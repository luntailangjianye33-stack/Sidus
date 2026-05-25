import { NextRequest, NextResponse } from "next/server";

const fetchTimeoutMs = 8_000;
const maxImageBytes = 750_000;

type LogoCandidate = {
  url: string;
  score: number;
  reason: string;
};

export async function GET(request: NextRequest) {
  const targetUrl = request.nextUrl.searchParams.get("url") ?? "";
  const companyName = request.nextUrl.searchParams.get("name") ?? "";

  if (!targetUrl) {
    return NextResponse.json(
      { error: "url is required", code: "logo_url_required" },
      { status: 400 },
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return NextResponse.json(
      { error: "Invalid logo URL", code: "logo_url_invalid" },
      { status: 400 },
    );
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json(
      { error: "Unsupported logo URL protocol", code: "logo_url_invalid" },
      { status: 400 },
    );
  }

  try {
    const pageResponse = await fetchWithTimeout(parsedUrl.toString());
    const contentType = pageResponse.headers.get("content-type") ?? "";

    if (contentType.startsWith("image/")) {
      return imageResponse(pageResponse);
    }

    const html = await pageResponse.text();
    const candidates = buildLogoCandidates(html, parsedUrl, companyName);

    for (const candidate of candidates) {
      const image = await fetchImageCandidate(candidate.url);
      if (image) return image;
    }

    return NextResponse.json(
      { error: "Company logo not found", code: "logo_not_found" },
      { status: 404 },
    );
  } catch {
    return NextResponse.json(
      { error: "Company logo fetch failed", code: "logo_fetch_failed" },
      { status: 404 },
    );
  }
}

function buildLogoCandidates(
  html: string,
  baseUrl: URL,
  companyName: string,
): LogoCandidate[] {
  const candidates: LogoCandidate[] = [];
  const companyTokens = createCompanyTokens(companyName);

  for (const img of extractTags(html, "img")) {
    const attrs = parseAttributes(img);
    const src = attrs.src ?? "";
    if (!src) continue;

    const alt = attrs.alt ?? "";
    const title = attrs.title ?? "";
    const className = attrs.class ?? "";
    const text = `${src} ${alt} ${title} ${className}`.toLowerCase();
    let score = 0;

    if (/logo|siteLogo|site-logo|header_logo|brand/iu.test(text)) score += 70;
    if (companyTokens.some((token) => text.includes(token))) score += 90;
    if (/header|globalheader|site/i.test(text)) score += 20;
    if (score <= 0) continue;

    candidates.push({
      url: absolutizeUrl(src, baseUrl),
      score,
      reason: "image tag",
    });
  }

  for (const link of extractTags(html, "link")) {
    const attrs = parseAttributes(link);
    const rel = (attrs.rel ?? "").toLowerCase();
    const href = attrs.href ?? "";
    if (!href) continue;

    if (rel.includes("apple-touch-icon")) {
      candidates.push({
        url: absolutizeUrl(href, baseUrl),
        score: 60,
        reason: "apple touch icon",
      });
    } else if (rel.includes("icon")) {
      candidates.push({
        url: absolutizeUrl(href, baseUrl),
        score: 50,
        reason: "favicon",
      });
    }
  }

  for (const meta of extractTags(html, "meta")) {
    const attrs = parseAttributes(meta);
    const property = (attrs.property ?? attrs.name ?? "").toLowerCase();
    const content = attrs.content ?? "";
    if (!content) continue;

    if (property === "og:image" || property === "twitter:image") {
      candidates.push({
        url: absolutizeUrl(content, baseUrl),
        score: 30,
        reason: property,
      });
    }
  }

  candidates.push(
    {
      url: new URL("/apple-touch-icon.png", baseUrl).toString(),
      score: 20,
      reason: "default apple touch icon",
    },
    {
      url: new URL("/favicon.ico", baseUrl).toString(),
      score: 10,
      reason: "default favicon",
    },
  );

  return dedupeCandidates(candidates)
    .filter((candidate) => candidate.url)
    .sort((a, b) => b.score - a.score);
}

function extractTags(html: string, tagName: "img" | "link" | "meta") {
  const regex = new RegExp(`<${tagName}\\b[^>]*>`, "giu");
  return html.match(regex) ?? [];
}

function parseAttributes(tag: string) {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gu;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(tag))) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attrs;
}

function createCompanyTokens(companyName: string) {
  const compact = companyName
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|inc\.?|corporation|corp\.?|co\.?|ltd\.?/giu, "")
    .replace(/\s+/gu, "");

  return [
    compact,
    ...companyName
      .toLowerCase()
      .split(/[\s　・,，.。()（）-]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  ].filter(Boolean);
}

function absolutizeUrl(url: string, baseUrl: URL) {
  if (!url) return "";
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return "";
  }
}

function dedupeCandidates(candidates: LogoCandidate[]) {
  return [
    ...new Map(
      candidates
        .filter((candidate) => candidate.url)
        .map((candidate) => [candidate.url, candidate]),
    ).values(),
  ];
}

async function fetchImageCandidate(url: string) {
  try {
    const response = await fetchWithTimeout(url);
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.startsWith("image/")) return null;

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > maxImageBytes) return null;

    return imageResponse(response);
  } catch {
    return null;
  }
}

async function imageResponse(response: Response) {
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxImageBytes) {
    return NextResponse.json(
      { error: "Company logo image is too large", code: "logo_too_large" },
      { status: 413 },
    );
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "image/png",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

function fetchWithTimeout(url: string) {
  return fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SidusCompanyLogo/1.0; +https://localhost)",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5",
    },
    signal: AbortSignal.timeout(fetchTimeoutMs),
  });
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">");
}
