import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getOpenAIErrorPayload } from "@/lib/api-error";
import type {
  ApplicationTarget,
  CompanyEvidenceDigest,
  CompanyFinancialHighlight,
  CompanyIdentitySummary,
  CompanyRecentDevelopment,
  CompanyResearchRequest,
  CompanyResearchResponse,
  CompanyResearchSource,
  ReviewWarning,
} from "@/types/sidus";

type SourceCandidate = {
  id: string;
  title: string;
  url: string;
  sourceType: CompanyResearchSource["sourceType"];
  sourceTier: CompanyResearchSource["sourceTier"];
  reason: string;
};

type VerifiedPage = SourceCandidate & {
  accessStatus: "fetched";
  excerpt: string;
};

type ExtractedFacts = {
  identity: CompanyIdentitySummary;
  financialHighlights: CompanyFinancialHighlight[];
  unknowns: string[];
};

type SummaryDraft = {
  companyUnderstandingMemo: string;
  businessSummary: string[];
  roleFitHypotheses: string[];
  esReviewFocus: string[];
  evidenceDigest: CompanyEvidenceDigest[];
  recentDevelopments: CompanyRecentDevelopment[];
};

const model =
  process.env.OPENAI_RESEARCH_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const searchModel = process.env.OPENAI_SEARCH_MODEL ?? "gpt-4o-mini-search-preview";
const sourceFetchTimeoutMs = 8_000;
const webSearchTimeoutMs = 60_000;
const summaryTimeoutMs = 45_000;
const maxFetchedChars = 8_000;
const maxCandidateUrls = 18;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CompanyResearchRequest;
    const applicationTarget = body.applicationTarget;

    if (!applicationTarget?.companyName?.trim()) {
      return NextResponse.json(
        {
          error: "applicationTarget.companyName is required",
          code: "company_name_required",
        },
        { status: 400 },
      );
    }

    const client = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
    const research = await buildCompanyResearchReport(client, applicationTarget);
    return NextResponse.json(research);
  } catch (error) {
    const openAIError = getOpenAIErrorPayload(error);
    if (openAIError) {
      return NextResponse.json(openAIError.body, {
        status: openAIError.status,
      });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid company research request",
        code: "company_research_failed",
      },
      { status: 400 },
    );
  }
}

async function buildCompanyResearchReport(
  client: OpenAI | null,
  applicationTarget: ApplicationTarget,
): Promise<CompanyResearchResponse> {
  const candidates = await discoverCompanyUrls(client, applicationTarget);
  const verifiedPages = await fetchAndValidateSources(candidates, applicationTarget);
  const userMemoSource = createUserMemoSource(applicationTarget);
  const sources = sortCompanySources([
    ...verifiedPages.map((page) => toResearchSource(page)),
    ...(userMemoSource ? [userMemoSource] : []),
  ]);
  const facts = extractCompanyFacts(applicationTarget, verifiedPages);
  const summary = client
    ? await summarizeCompanyResearch(client, applicationTarget, sources, facts)
    : createFallbackSummary(applicationTarget, sources, facts);
  const warnings = createResearchWarnings(sources, facts, client);
  const validatedSummary = validateSummaryDraft(summary, sources, applicationTarget);
  const accessMode =
    sources.filter((source) => source.accessStatus === "fetched").length > 0
      ? "fetched_sources"
      : userMemoSource
        ? "user_sources_only"
        : "model_knowledge_only";

  return {
    researchId: `company-research-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    companyName: applicationTarget.companyName,
    industry: applicationTarget.industry,
    position: applicationTarget.position,
    accessMode,
    confidence: getResearchConfidence(sources, facts),
    companyUnderstandingMemo: validatedSummary.companyUnderstandingMemo,
    identitySummary: facts.identity,
    businessSummary: validatedSummary.businessSummary,
    financialHighlights: facts.financialHighlights,
    recentDevelopments: validatedSummary.recentDevelopments,
    evidenceDigest: validatedSummary.evidenceDigest,
    sourceCoverage: createSourceCoverage(sources),
    roleFitHypotheses: validatedSummary.roleFitHypotheses,
    esReviewFocus: validatedSummary.esReviewFocus,
    sources,
    unknowns: facts.unknowns,
    warnings,
  };
}

async function discoverCompanyUrls(
  client: OpenAI | null,
  applicationTarget: ApplicationTarget,
): Promise<SourceCandidate[]> {
  const userCandidates = applicationTarget.referenceUrls
    .filter((source) => source.url?.trim())
    .map((source, index) =>
      createCandidate(
        source.url ?? "",
        source.title || "ユーザー指定URL",
        `user-url-${index + 1}`,
        applicationTarget,
        "ユーザー指定URL",
      ),
    );

  if (!client) return dedupeCandidates(userCandidates);

  const discoveredUrls = await discoverUrlsWithOpenAISearch(
    client,
    applicationTarget,
  );
  const supplementalUrls = await discoverSupplementalCompanyUrls(
    client,
    applicationTarget,
  );
  const discoveredCandidates = [...discoveredUrls, ...supplementalUrls].map((item, index) =>
    createCandidate(
      item.url,
      item.title || getDomain(item.url) || item.url,
      `search-url-${index + 1}`,
      applicationTarget,
      item.reason || "検索候補",
    ),
  );

  return dedupeCandidates([...userCandidates, ...discoveredCandidates]).slice(
    0,
    maxCandidateUrls,
  );
}

async function discoverSupplementalCompanyUrls(
  client: OpenAI,
  applicationTarget: ApplicationTarget,
): Promise<Array<{ url: string; title: string; reason: string }>> {
  const prompt = `
${applicationTarget.companyName} の固定欄確認に使う補助URLを探してください。
目的は法人番号、証券コード、上場市場、所在地、資本金、従業員数の確認です。

優先:
- 対象企業そのものの法人番号公表ページ、gBizINFO、会社情報系の企業詳細ページ
- 企業公式の会社概要
- 公式IRまたは有価証券報告書

除外:
- 汎用の制度説明ページ
- Wikipedia、就活媒体、口コミ、求人媒体

URLだけでなく、そのURLで確認できる固定欄項目を短く添えてください。
`.trim();

  try {
    const completion = await withTimeout(
      client.chat.completions.create(
        {
          model: searchModel,
          web_search_options: { search_context_size: "medium" },
          messages: [
            {
              role: "system",
              content:
                "You find supplemental company fact URLs only. Prefer pages about the exact target company.",
            },
            { role: "user", content: prompt },
          ],
        } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
        { signal: AbortSignal.timeout(webSearchTimeoutMs) },
      ),
      webSearchTimeoutMs,
      "OpenAI supplemental search timed out",
    );
    const message = completion.choices[0]?.message;
    const content = message?.content ?? "";
    const urls = [
      ...new Set([...extractChatAnnotationUrls(message), ...extractUrls(content)]),
    ]
      .map(normalizeSourceUrl)
      .filter(Boolean);
    return urls.map((url) => ({
      url,
      title: findNearbyTitle(content, url),
      reason: "固定欄補助検索候補",
    }));
  } catch {
    return [];
  }
}

async function discoverUrlsWithOpenAISearch(
  client: OpenAI,
  applicationTarget: ApplicationTarget,
): Promise<Array<{ url: string; title: string; reason: string }>> {
  const prompt = `
${applicationTarget.companyName} / ${applicationTarget.position} のESレビュー前に使う出典URLを探してください。

返すURLの優先順位:
1. 企業公式の会社概要、公式サイト、公式採用、公式IR、統合報告書
2. 対象企業そのものの法人番号公表ページ、gBizINFO、EDINETなど
3. 主要メディアまたは企業公式ニュース

除外:
- example.com
- Wikipedia
- 就活媒体、採用口コミ、ケース面接対策、求人まとめ
- 法人番号制度やgBizINFOの説明ページなど、対象企業そのものではない汎用ページ

必ずURLを本文にそのまま書き、各URLで確認できる事実を短く添えてください。
`.trim();

  try {
    const completion = await withTimeout(
      client.chat.completions.create(
        {
          model: searchModel,
          web_search_options: { search_context_size: "medium" },
          messages: [
            {
              role: "system",
              content:
                "You find candidate URLs only. Do not summarize facts beyond what each URL can verify.",
            },
            { role: "user", content: prompt },
          ],
        } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
        { signal: AbortSignal.timeout(webSearchTimeoutMs) },
      ),
      webSearchTimeoutMs,
      "OpenAI search timed out",
    );
    const message = completion.choices[0]?.message;
    const content = message?.content ?? "";
    const annotationUrls = extractChatAnnotationUrls(message);
    const textUrls = extractUrls(content);
    const urls = [...new Set([...annotationUrls, ...textUrls])]
      .map(normalizeSourceUrl)
      .filter(Boolean);
    return urls.map((url) => ({
      url,
      title: findNearbyTitle(content, url),
      reason: "OpenAI検索候補",
    }));
  } catch {
    return [];
  }
}

async function fetchAndValidateSources(
  candidates: SourceCandidate[],
  applicationTarget: ApplicationTarget,
): Promise<VerifiedPage[]> {
  const pages = await Promise.all(
    candidates.map(async (candidate): Promise<VerifiedPage | null> => {
      if (!isCandidateUrlAllowed(candidate.url)) return null;

      try {
        const response = await fetch(candidate.url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; SidusCompanyResearch/1.0; +https://localhost)",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          },
          signal: AbortSignal.timeout(sourceFetchTimeoutMs),
        });
        const contentType = response.headers.get("content-type") ?? "";
        if (!response.ok || !contentType.includes("text")) return null;

        const html = await response.text();
        const excerpt = normalizeHtmlText(html).slice(0, maxFetchedChars);
        const documentTitle = extractTitle(html) || candidate.title;
        const page: VerifiedPage = {
          ...candidate,
          title: documentTitle || candidate.url,
          sourceType: classifySourceType(
            candidate.url,
            `${documentTitle} ${candidate.url} ${excerpt}`,
          ),
          sourceTier: classifySourceTier(candidate.url, candidate.sourceType),
          accessStatus: "fetched",
          excerpt,
        };

        if (!isPageAboutTargetCompany(page, applicationTarget)) return null;
        return {
          ...page,
          sourceTier: classifySourceTier(page.url, page.sourceType),
        };
      } catch {
        return null;
      }
    }),
  );

  return dedupeVerifiedPages(
    pages.filter((page): page is VerifiedPage => Boolean(page)),
  ).slice(0, 8);
}

function extractCompanyFacts(
  applicationTarget: ApplicationTarget,
  pages: VerifiedPage[],
): ExtractedFacts {
  const officialPages = pages.filter((page) =>
    ["official_site", "recruiting", "financial_disclosure"].includes(
      page.sourceType,
    ),
  );
  const publicPages = pages.filter((page) => page.sourceType === "public_registry");
  const allPages = [...officialPages, ...publicPages, ...pages];
  const firstValue = (extractor: (text: string) => string) =>
    normalizeKnownText(
      allPages.map((page) => extractor(page.excerpt)).find(isKnownValue) ?? "",
    );
  const officialWebsite = officialPages[0]?.url ?? "";
  const corporateNumber = firstValue(extractCorporateNumber);
  const securitiesCode = firstValue(extractSecuritiesCode);
  const listingMarket = firstValue(extractListingMarket);
  const headquarters = firstValue(extractHeadquarters);
  const legalName =
    firstValue(extractLegalName) ||
    (pages.some((page) => containsCompanyToken(page.excerpt, applicationTarget.companyName))
      ? applicationTarget.companyName
      : "");
  const jurisdiction =
    corporateNumber || /[一-龯ぁ-んァ-ヶ]/u.test(applicationTarget.companyName)
      ? "日本"
      : "";
  const entityKind = securitiesCode || listingMarket
    ? "上場企業"
    : corporateNumber
      ? "日本法人"
      : "";
  const industryClassification =
    firstValue(extractIndustry) || applicationTarget.industry || "";
  const financialHighlights = createFinancialHighlights(allPages);
  const unknowns = [
    !corporateNumber ? "法人番号は公的情報ソースから確認できていません。" : "",
    !securitiesCode ? "証券コードは確認済みソースから抽出できていません。" : "",
    financialHighlights.length === 0
      ? "財務・規模情報は確認済みソースから抽出できていません。"
      : "",
    !officialWebsite ? "企業公式サイトを確認済みソースとして採用できていません。" : "",
  ].filter(Boolean);

  return {
    identity: {
      legalName,
      jurisdiction,
      entityKind,
      corporateNumber,
      headquarters,
      industryClassification,
      officialWebsite,
      securitiesCode,
      listingMarket,
    },
    financialHighlights,
    unknowns,
  };
}

async function summarizeCompanyResearch(
  client: OpenAI,
  applicationTarget: ApplicationTarget,
  sources: CompanyResearchSource[],
  facts: ExtractedFacts,
): Promise<SummaryDraft> {
  if (sources.filter((source) => source.accessStatus === "fetched").length === 0) {
    return createFallbackSummary(applicationTarget, sources, facts);
  }

  try {
    const completion = await withTimeout(
      client.chat.completions.create(
        {
          model,
          messages: [
            {
              role: "system",
              content:
                "You are Sidus Research Editor. Use only provided verified sources and extracted facts. Return JSON only.",
            },
            {
              role: "user",
              content: buildSummaryPrompt(applicationTarget, sources, facts),
            },
          ],
          response_format: { type: "json_object" },
        },
        { signal: AbortSignal.timeout(summaryTimeoutMs) },
      ),
      summaryTimeoutMs,
      "OpenAI summary timed out",
    );
    const content = completion.choices[0]?.message?.content;
    if (!content) return createFallbackSummary(applicationTarget, sources, facts);
    return {
      ...createFallbackSummary(applicationTarget, sources, facts),
      ...(JSON.parse(content) as Partial<SummaryDraft>),
    };
  } catch {
    return createFallbackSummary(applicationTarget, sources, facts);
  }
}

function buildSummaryPrompt(
  applicationTarget: ApplicationTarget,
  sources: CompanyResearchSource[],
  facts: ExtractedFacts,
) {
  return `
以下の「検証済みソース」と「コード抽出済みファクト」だけを使って、ESレビュー用の企業理解をJSONで返してください。
推測は禁止。URLやsourceIdを捏造しない。sourceIdsには必ずsourcesに存在するidだけを使う。

返却形式:
{
  "companyUnderstandingMemo": "string",
  "businessSummary": ["string"],
  "roleFitHypotheses": ["string"],
  "esReviewFocus": ["string"],
  "evidenceDigest": [
    {
      "category": "official_company | financial | public_registry | major_media | user_context | unverified",
      "title": "string",
      "summary": "string",
      "sourceIds": ["source id"],
      "userRelevance": "ESでどう使うか",
      "useRecommendation": "direct_use | background_only | use_with_caution | do_not_use",
      "riskNote": "string"
    }
  ],
  "recentDevelopments": [
    {
      "title": "string",
      "summary": "string",
      "date": "YYYY-MM-DD or empty",
      "sourceId": "source id",
      "sourceType": "official_site | recruiting | public_registry | financial_disclosure | major_media | url",
      "esUseRecommendation": "direct_use | background_only | use_with_caution | do_not_use",
      "riskNote": "string",
      "url": "string",
      "confidence": "high | medium | low"
    }
  ]
}

Application target:
${JSON.stringify(applicationTarget, null, 2)}

Extracted facts:
${JSON.stringify(facts, null, 2)}

Verified sources:
${JSON.stringify(
  sources.map((source) => ({
    ...source,
    excerpt: source.excerpt.slice(0, 1200),
  })),
  null,
  2,
)}
`.trim();
}

function validateSummaryDraft(
  draft: SummaryDraft,
  sources: CompanyResearchSource[],
  applicationTarget: ApplicationTarget,
): SummaryDraft {
  const sourceIds = new Set(sources.map((source) => source.id));
  const fallback = createFallbackSummary(applicationTarget, sources, {
    identity: emptyIdentity(applicationTarget),
    financialHighlights: [],
    unknowns: [],
  });

  return {
    companyUnderstandingMemo:
      normalizeKnownText(draft.companyUnderstandingMemo) ||
      fallback.companyUnderstandingMemo,
    businessSummary: normalizeStringList(draft.businessSummary).slice(0, 5),
    roleFitHypotheses: normalizeStringList(draft.roleFitHypotheses).slice(0, 5),
    esReviewFocus: normalizeStringList(draft.esReviewFocus).slice(0, 5),
    evidenceDigest: (Array.isArray(draft.evidenceDigest)
      ? draft.evidenceDigest
      : []
    )
      .map((item) => ({
        category: normalizeEvidenceCategory(item.category),
        title: stripMarkdownLinks(String(item.title ?? "")).slice(0, 80),
        summary: stripMarkdownLinks(String(item.summary ?? "")).slice(0, 260),
        sourceIds: (item.sourceIds ?? []).filter((id) => sourceIds.has(id)),
        userRelevance: stripMarkdownLinks(String(item.userRelevance ?? "")).slice(
          0,
          180,
        ),
        useRecommendation: normalizeUseRecommendation(item.useRecommendation),
        riskNote: stripMarkdownLinks(String(item.riskNote ?? "")).slice(0, 160),
      }))
      .filter((item) => item.title && item.summary && item.sourceIds.length > 0)
      .slice(0, 6),
    recentDevelopments: (Array.isArray(draft.recentDevelopments)
      ? draft.recentDevelopments
      : []
    )
      .filter((item) => sourceIds.has(item.sourceId))
      .map((item) => ({
        title: stripMarkdownLinks(String(item.title ?? "")).slice(0, 90),
        summary: stripMarkdownLinks(String(item.summary ?? "")).slice(0, 260),
        date: stripMarkdownLinks(String(item.date ?? "")).slice(0, 20),
        sourceId: item.sourceId,
        sourceType: normalizeSourceType(item.sourceType),
        esUseRecommendation: normalizeUseRecommendation(item.esUseRecommendation),
        riskNote: stripMarkdownLinks(String(item.riskNote ?? "")).slice(0, 160),
        url: sources.find((source) => source.id === item.sourceId)?.url ?? "",
        confidence: normalizeConfidence(item.confidence),
      }))
      .filter((item) => item.title && item.summary)
      .slice(0, 4),
  };
}

function createFallbackSummary(
  applicationTarget: ApplicationTarget,
  sources: CompanyResearchSource[],
  facts: ExtractedFacts,
): SummaryDraft {
  const source = sources.find((item) => item.sourceTier === "primary") ?? sources[0];
  const company = applicationTarget.companyName;
  const officialSummary =
    source && source.accessStatus !== "model_based"
      ? `${company}について、採用済みソースをもとに企業概要とESで確認すべき論点を整理します。`
      : `${company}について、確認済みの外部ソースが不足しています。公式サイトや公的情報を追加してください。`;
  const evidenceDigest: CompanyEvidenceDigest[] = source
    ? [
        {
          category:
            source.sourceType === "financial_disclosure"
              ? "financial"
              : source.sourceType === "public_registry"
                ? "public_registry"
                : source.sourceType === "major_media"
                  ? "major_media"
                  : "official_company",
          title: source.title,
          summary: source.excerpt.slice(0, 160),
          sourceIds: [source.id],
          userRelevance: "ESレビューで企業理解の根拠として確認します。",
          useRecommendation:
            source.sourceTier === "primary" || source.sourceTier === "public"
              ? "direct_use"
              : "background_only",
          riskNote: "",
        },
      ]
    : [];

  return {
    companyUnderstandingMemo: officialSummary,
    businessSummary: [
      facts.identity.industryClassification
        ? `${company}は${facts.identity.industryClassification}に関わる企業として確認されています。`
        : `${company}の事業内容は、確認済みソースから整理してください。`,
    ],
    roleFitHypotheses: [
      `${applicationTarget.position || "志望職種"}で求められる経験と、企業の事業理解が接続できているかを確認します。`,
    ],
    esReviewFocus: [
      "志望理由がその企業固有の情報に基づいているか",
      "自分の経験と職種要件の接続が具体的か",
      "出典未確認の断定が含まれていないか",
    ],
    evidenceDigest,
    recentDevelopments: [],
  };
}

function createResearchWarnings(
  sources: CompanyResearchSource[],
  facts: ExtractedFacts,
  client: OpenAI | null,
): ReviewWarning[] {
  const warnings: ReviewWarning[] = [];
  if (!client) {
    warnings.push({
      code: "possible_hallucination",
      message:
        "OpenAI APIキーが未設定のため、企業調査は外部AI検索なしで実行されています。",
      severity: "warning",
    });
  }
  if (!sources.some((source) => source.sourceTier === "primary")) {
    warnings.push({
      code: "source_missing",
      message:
        "企業公式サイトまたは公式IRを確認済みソースとして採用できていません。",
      severity: "warning",
    });
  }
  if (!sources.some((source) => source.sourceTier === "public")) {
    warnings.push({
      code: "source_missing",
      message: "法人番号や公的情報ソースはまだ確認できていません。",
      severity: "info",
    });
  }
  if (!facts.identity.officialWebsite) {
    warnings.push({
      code: "insufficient_company_context",
      message:
        "公式サイトのURLを固定欄へ反映できていません。参考URLに公式会社概要を追加すると精度が上がります。",
      severity: "warning",
    });
  }
  return warnings;
}

function createUserMemoSource(
  applicationTarget: ApplicationTarget,
): CompanyResearchSource | null {
  if (!applicationTarget.companyMemo.trim()) return null;

  return {
    id: "user-company-memo",
    title: "ユーザー入力の企業メモ",
    url: "",
    sourceType: "user_memo",
    sourceTier: "user",
    accessStatus: "provided",
    usedFor: ["companyUnderstandingMemo", "esReviewFocus"],
    excerpt: applicationTarget.companyMemo.slice(0, 1200),
  };
}

function toResearchSource(page: VerifiedPage): CompanyResearchSource {
  return {
    id: page.id,
    title: createDisplaySourceTitle(page),
    url: page.url,
    sourceType: page.sourceType,
    sourceTier: page.sourceTier,
    accessStatus: "fetched",
    usedFor: inferUsedFor(page.sourceType),
    excerpt: page.excerpt.slice(0, 1200),
  };
}

function createCandidate(
  url: string,
  title: string,
  id: string,
  applicationTarget: ApplicationTarget,
  reason: string,
): SourceCandidate {
  const normalizedUrl = normalizeSourceUrl(url);
  const sourceType = classifySourceType(
    normalizedUrl,
    `${title} ${applicationTarget.companyName}`,
  );
  return {
    id,
    title,
    url: normalizedUrl,
    sourceType,
    sourceTier: classifySourceTier(normalizedUrl, sourceType),
    reason,
  };
}

function classifySourceType(
  url: string,
  text: string,
): CompanyResearchSource["sourceType"] {
  const domain = getDomain(url);
  const normalizedText = text.toLowerCase();

  if (
    [
      "houjin-bangou.nta.go.jp",
      "info.gbiz.go.jp",
      "gbiz.go.jp",
      "meti.go.jp",
      "edinet-fsa.go.jp",
      "disclosure2.edinet-fsa.go.jp",
      "fsa.go.jp",
      "houjin.info",
      "companyinformation.jp",
      "cnavi.g-search.or.jp",
      "companydata.tsujigawa.com",
    ].some((publicDomain) => domain.endsWith(publicDomain))
  ) {
    return "public_registry";
  }
  if (
    /会社概要|企業情報|about|company profile|corporate|会社情報/u.test(
      normalizedText,
    ) &&
    !isThirdPartyFinancialDomain(domain)
  ) {
    return "official_site";
  }
  if (
    [
      "irbank.net",
      "kabutan.jp",
      "finance.yahoo.co.jp",
      "tdnet.info",
      "edinetdb.com",
    ].some((financialDomain) => domain.endsWith(financialDomain)) ||
    /\/ir\b|investor|annual|統合報告|決算|有価証券|financial/u.test(
      normalizedText,
    )
  ) {
    return "financial_disclosure";
  }
  if (
    [
      "nikkei.com",
      "reuters.com",
      "bloomberg.co.jp",
      "bloomberg.com",
      "nhk.or.jp",
      "toyokeizai.net",
    ].some((mediaDomain) => domain.endsWith(mediaDomain))
  ) {
    return "major_media";
  }
  if (
    /recruit|career|採用|募集|新卒/u.test(normalizedText) &&
    !isRecruitingOrAggregatorUrl(url)
  ) {
    return "recruiting";
  }
  if (/公式/u.test(normalizedText)) {
    return "official_site";
  }
  return "url";
}

function classifySourceTier(
  url: string,
  sourceType: CompanyResearchSource["sourceType"],
): CompanyResearchSource["sourceTier"] {
  const domain = getDomain(url);
  if (sourceType === "official_site" || sourceType === "recruiting") {
    return "primary";
  }
  if (sourceType === "public_registry" || isPublicDisclosureDomain(domain)) {
    return "public";
  }
  if (sourceType === "financial_disclosure") {
    return isThirdPartyFinancialDomain(domain) ? "secondary" : "primary";
  }
  if (sourceType === "major_media" || sourceType === "url") return "secondary";
  if (sourceType === "user_memo") return "user";
  return "model";
}

function isCandidateUrlAllowed(url: string) {
  if (!url || !/^https?:\/\//u.test(url)) return false;
  if (isBlockedSourceUrl(url) || isRecruitingOrAggregatorUrl(url)) return false;
  const lower = url.toLowerCase();
  return ![
    "wikipedia.org",
    "career-tasu.jp",
    "job.mynavi.jp",
    "rikunabi.com",
    "onecareer.jp",
    "openwork.jp",
    "vorkers.com",
    "wantedly.com",
    "casebasix.com",
  ].some((blocked) => lower.includes(blocked));
}

function isPageAboutTargetCompany(
  page: VerifiedPage,
  applicationTarget: ApplicationTarget,
) {
  if (isGenericInstitutionalSource(page)) return false;
  const text = `${page.title} ${page.url} ${page.excerpt}`;
  if (containsCompanyToken(text, applicationTarget.companyName)) return true;
  const domain = getDomain(page.url).replace(/[-.]/g, "");
  return getCompanyNameTokens(applicationTarget.companyName).some((token) =>
    domain.includes(toSearchToken(token)),
  );
}

function extractLegalName(text: string) {
  return cleanCompanyName(
    extractValueAfterLabels(text, ["会社名", "商号", "社名", "名称"], [
      "本社所在地",
      "所在地",
      "代表者",
      "設立",
      "資本金",
    ]),
  );
}

function extractHeadquarters(text: string) {
  return cleanHeadquarters(
    extractValueAfterLabels(text, ["本社所在地", "所在地", "本社"], [
      "TEL",
      "Tel",
      "電話",
      "設立",
      "代表者",
      "主要事業",
      "資本金",
      "従業員",
    ]),
  );
}

function extractIndustry(text: string) {
  return extractValueAfterLabels(text, ["業種", "事業内容", "主要事業"], [
    "資本金",
    "従業員",
    "所在地",
    "代表者",
    "設立",
  ]);
}

function extractCorporateNumber(text: string) {
  const match = text.match(/法人番号\s*([0-9]{13})/u);
  return match?.[1] ?? "";
}

function extractSecuritiesCode(text: string) {
  const match = text.match(/(?:証券コード|銘柄コード|証券番号)\s*([0-9]{4})/u);
  return match?.[1] ?? "";
}

function extractListingMarket(text: string) {
  if (text.includes("東京証券取引所プライム市場") || text.includes("東証プライム")) {
    return "東京証券取引所プライム市場";
  }
  if (text.includes("東京証券取引所スタンダード市場")) {
    return "東京証券取引所スタンダード市場";
  }
  if (text.includes("東京証券取引所グロース市場")) {
    return "東京証券取引所グロース市場";
  }
  if (text.includes("東京証券取引所")) return "東京証券取引所";
  if (text.includes("名古屋証券取引所")) return "名古屋証券取引所";
  return "";
}

function createFinancialHighlights(pages: VerifiedPage[]) {
  const highlights: CompanyFinancialHighlight[] = [];
  for (const page of pages) {
    addFinancialHighlight(
      highlights,
      "資本金",
      extractValueAfterLabels(page.excerpt, ["資本金"], [
        "売上高",
        "売上収益",
        "従業員",
        "代表者",
        "主要事業",
      ]),
      page.id,
    );
    addFinancialHighlight(
      highlights,
      "売上高",
      extractValueAfterLabels(page.excerpt, ["売上高", "売上収益", "営業収益"], [
        "従業員",
        "社員数",
        "組織図",
        "拠点数",
      ]),
      page.id,
    );
    addFinancialHighlight(
      highlights,
      "従業員数",
      extractValueAfterLabels(page.excerpt, ["従業員数", "社員数"], [
        "組織図",
        "拠点数",
        "グループ会社",
        "国内",
        "海外",
      ]),
      page.id,
    );
  }
  return highlights.slice(0, 5);
}

function addFinancialHighlight(
  highlights: CompanyFinancialHighlight[],
  label: string,
  value: string,
  sourceId: string,
) {
  const cleaned = cleanExtractedValue(value);
  if (!isKnownValue(cleaned) || cleaned.length > 90) return;
  if (highlights.some((item) => item.label === label)) return;
  highlights.push({
    label,
    value: cleaned,
    period: "",
    sourceId,
    confidence: "high",
  });
}

function extractValueAfterLabels(
  text: string,
  labels: string[],
  stopLabels: string[],
) {
  for (const label of labels) {
    const start = text.indexOf(label);
    if (start < 0) continue;
    const afterLabel = text.slice(start + label.length).trim();
    const stopIndexes = stopLabels
      .map((stopLabel) => afterLabel.indexOf(stopLabel))
      .filter((index) => index > 0);
    const end = stopIndexes.length > 0 ? Math.min(...stopIndexes) : 120;
    return cleanExtractedValue(afterLabel.slice(0, end));
  }
  return "";
}

function createDisplaySourceTitle(page: VerifiedPage) {
  const label: Record<CompanyResearchSource["sourceType"], string> = {
    official_site: "企業公式",
    recruiting: "公式採用",
    public_registry: "公的情報",
    financial_disclosure: "公式IR・財務情報",
    major_media: "主要メディア",
    user_memo: "ユーザー入力",
    model_knowledge: "モデル知識",
    url: "参考情報",
  };
  const cleanTitle = page.title.replace(/\s+/g, " ").trim();
  return cleanTitle && cleanTitle.length <= 80
    ? cleanTitle
    : `${label[page.sourceType]}: ${getDomain(page.url)}`;
}

function inferUsedFor(sourceType: CompanyResearchSource["sourceType"]) {
  if (sourceType === "public_registry") return ["identitySummary"];
  if (sourceType === "financial_disclosure") {
    return ["financialHighlights", "evidenceDigest"];
  }
  if (sourceType === "major_media") return ["recentDevelopments"];
  if (sourceType === "recruiting") return ["roleFitHypotheses", "esReviewFocus"];
  return ["companyUnderstandingMemo", "businessSummary", "evidenceDigest"];
}

function createSourceCoverage(
  sources: CompanyResearchSource[],
): CompanyResearchResponse["sourceCoverage"] {
  return {
    publicRegistry: sources.filter(
      (source) => source.sourceType === "public_registry",
    ).length,
    official: sources.filter((source) => source.sourceType === "official_site")
      .length,
    financial: sources.filter(
      (source) => source.sourceType === "financial_disclosure",
    ).length,
    media: sources.filter((source) => source.sourceType === "major_media").length,
    userProvided: sources.filter((source) => source.sourceType === "user_memo")
      .length,
    modelKnowledge: sources.filter(
      (source) => source.sourceType === "model_knowledge",
    ).length,
  };
}

function getResearchConfidence(
  sources: CompanyResearchSource[],
  facts: ExtractedFacts,
): CompanyResearchResponse["confidence"] {
  const hasPrimary = sources.some((source) => source.sourceTier === "primary");
  const hasPublic = sources.some((source) => source.sourceTier === "public");
  if (hasPrimary && (hasPublic || facts.financialHighlights.length > 0)) {
    return "high";
  }
  if (hasPrimary || sources.length >= 2) return "medium";
  return "low";
}

function sortCompanySources(sources: CompanyResearchSource[]) {
  const priority: Record<CompanyResearchSource["sourceType"], number> = {
    official_site: 0,
    financial_disclosure: 1,
    public_registry: 2,
    recruiting: 3,
    major_media: 4,
    user_memo: 5,
    url: 6,
    model_knowledge: 7,
  };

  return [...sources].sort((a, b) => {
    const priorityDiff = priority[a.sourceType] - priority[b.sourceType];
    if (priorityDiff !== 0) return priorityDiff;
    return a.title.localeCompare(b.title, "ja");
  });
}

function dedupeCandidates(candidates: SourceCandidate[]) {
  return [
    ...new Map(
      candidates
        .filter((candidate) => candidate.url)
        .map((candidate) => [candidate.url, candidate]),
    ).values(),
  ];
}

function dedupeVerifiedPages(pages: VerifiedPage[]) {
  return [
    ...new Map(
      pages
        .filter((page) => page.url)
        .map((page) => [page.url.replace(/\/$/u, ""), page]),
    ).values(),
  ];
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => stripMarkdownLinks(String(item ?? "")).trim())
        .filter(Boolean)
    : [];
}

function normalizeEvidenceCategory(value: unknown): CompanyEvidenceDigest["category"] {
  return [
    "public_registry",
    "official_company",
    "financial",
    "major_media",
    "user_context",
    "unverified",
  ].includes(String(value))
    ? (value as CompanyEvidenceDigest["category"])
    : "unverified";
}

function normalizeUseRecommendation(
  value: unknown,
): CompanyEvidenceDigest["useRecommendation"] {
  return [
    "direct_use",
    "background_only",
    "use_with_caution",
    "do_not_use",
  ].includes(String(value))
    ? (value as CompanyEvidenceDigest["useRecommendation"])
    : "background_only";
}

function normalizeSourceType(value: unknown): CompanyResearchSource["sourceType"] {
  return [
    "url",
    "official_site",
    "recruiting",
    "public_registry",
    "financial_disclosure",
    "major_media",
    "user_memo",
    "model_knowledge",
  ].includes(String(value))
    ? (value as CompanyResearchSource["sourceType"])
    : "url";
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  return ["high", "medium", "low"].includes(String(value))
    ? (value as "high" | "medium" | "low")
    : "medium";
}

function emptyIdentity(applicationTarget: ApplicationTarget): CompanyIdentitySummary {
  return {
    legalName: "",
    jurisdiction: "",
    entityKind: "",
    corporateNumber: "",
    headquarters: "",
    industryClassification: applicationTarget.industry,
    officialWebsite: "",
    securitiesCode: "",
    listingMarket: "",
  };
}

function isPublicDisclosureDomain(domain: string) {
  return [
    "edinet-fsa.go.jp",
    "disclosure2.edinet-fsa.go.jp",
    "fsa.go.jp",
  ].some((publicDomain) => domain.endsWith(publicDomain));
}

function isThirdPartyFinancialDomain(domain: string) {
  return [
    "irbank.net",
    "kabutan.jp",
    "finance.yahoo.co.jp",
    "tdnet.info",
    "edinetdb.com",
  ].some((financialDomain) => domain.endsWith(financialDomain));
}

function isBlockedSourceUrl(url: string) {
  const domain = getDomain(url);
  return ["example.com", "example.org", "example.net"].some((blockedDomain) =>
    domain.endsWith(blockedDomain),
  );
}

function isRecruitingOrAggregatorUrl(url?: string) {
  const domain = getDomain(url ?? "");
  return [
    "career-tasu.jp",
    "job.mynavi.jp",
    "rikunabi.com",
    "onecareer.jp",
    "openwork.jp",
    "vorkers.com",
    "wantedly.com",
    "wikipedia.org",
  ].some((blockedDomain) => domain.endsWith(blockedDomain));
}

function isGenericInstitutionalSource(source: { sourceType: string; url: string }) {
  if (
    source.sourceType !== "public_registry" &&
    source.sourceType !== "financial_disclosure"
  ) {
    return false;
  }
  const normalizedUrl = source.url.toLowerCase();
  return [
    "meti.go.jp/policy/digital_transformation/gbizinfo",
    "nta.go.jp/taxes/tetsuzuki/mynumberinfo/houjinbangou",
    "fsa.go.jp/status/index.html",
    "disclosure2.edinet-fsa.go.jp/guide",
  ].some((pattern) => normalizedUrl.includes(pattern));
}

function containsCompanyToken(text: string, companyName: string) {
  const normalizedText = toSearchToken(text);
  return getCompanyNameTokens(companyName).some((token) =>
    normalizedText.includes(toSearchToken(token)),
  );
}

function getCompanyNameTokens(companyName: string) {
  const base = stripCompanySuffix(companyName);
  const tokens = [companyName, base]
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  return [...new Set(tokens)];
}

function stripCompanySuffix(companyName: string) {
  return companyName
    .replace(
      /(株式会社|有限会社|合同会社|合名会社|合資会社|Inc\.?|Corporation|Corp\.?|Ltd\.?|Co\.,?\s*Ltd\.?)/giu,
      "",
    )
    .trim();
}

function toSearchToken(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[・･.,，、。/／\-ー―_()[\]（）「」『』:：]/g, "");
}

function isKnownValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return Boolean(
    normalized &&
      !/^[?？]+$/u.test(normalized) &&
      ![
        "unknown",
        "unknowns",
        "n/a",
        "none",
        "no",
        "なし",
        "無し",
        "該当なし",
        "該当無し",
        "非上場",
        "not found",
        "not confirmed",
        "未確認",
        "不明",
      ].includes(normalized),
  );
}

function normalizeKnownText(value: string) {
  return isKnownValue(value) ? stripMarkdownLinks(value.trim()) : "";
}

function cleanExtractedValue(value: string) {
  return stripMarkdownLinks(value)
    .replace(/\s+/g, " ")
    .replace(/^[：:・｜|／/\s]+/u, "")
    .replace(/[。,:：、\s]+$/u, "")
    .trim();
}

function cleanCompanyName(value: string) {
  const cleaned = cleanExtractedValue(value);
  const japanesePart = cleaned.split(/\s+(?=[A-Z][A-Za-z])/u)[0] ?? cleaned;
  const match = japanesePart.match(
    /(?:[一-龯ぁ-んァ-ヶーA-Za-z0-9・＆&]+\s*){1,8}(?:株式会社|有限会社|合同会社|Corporation|Inc\.?|Ltd\.?)/u,
  );
  return cleanExtractedValue(match?.[0] ?? cleaned);
}

function cleanHeadquarters(value: string) {
  return cleanExtractedValue(value)
    .replace(/\s*(tel|TEL|電話).*$/u, "")
    .trim();
}

function stripMarkdownLinks(value: string) {
  return value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}

function extractUrls(text: string) {
  return [
    ...new Set(
      Array.from(text.matchAll(/https?:\/\/[^\s)"'<>]+/gu)).map((match) =>
        normalizeSourceUrl(match[0].replace(/[),.。]+$/u, "")),
      ),
    ),
  ].filter(Boolean);
}

function findNearbyTitle(content: string, url: string) {
  const index = content.indexOf(url);
  if (index < 0) return "";
  return content.slice(Math.max(0, index - 90), index).split(/\n/u).at(-1)?.trim() ?? "";
}

function extractChatAnnotationUrls(
  message: OpenAI.Chat.Completions.ChatCompletionMessage | undefined,
) {
  const annotations =
    (
      message as
        | {
            annotations?: Array<{
              type?: string;
              url_citation?: { url?: string; title?: string };
            }>;
          }
        | undefined
    )?.annotations ?? [];

  return annotations
    .map((annotation) => annotation.url_citation?.url ?? "")
    .filter(Boolean);
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
}

function normalizeSourceUrl(url: string) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("utm_source");
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

function normalizeHtmlText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}
