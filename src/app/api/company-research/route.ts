import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getOpenAIErrorPayload } from "@/lib/api-error";
import { normalizeApplicationTarget } from "@/lib/application-target";
import {
  resolveCorporateNumberFromNta,
  type CorporateNumberResolveResult,
} from "@/lib/corporate-number-resolver";
import type {
  ApplicationTarget,
  CompanyClaim,
  CompanyEvidenceDigest,
  CompanyFinancialHighlight,
  CompanyIdentitySummary,
  CompanyRecentDevelopment,
  CompanyResearchRequest,
  CompanyResearchResponse,
  CompanyResearchSource,
  CompanySourceChunk,
  CompanySourceManifestEntry,
  ReviewWarning,
} from "@/types/sidus";

type SourceCandidate = {
  id: string;
  title: string;
  url: string;
  sourceType: CompanyResearchSource["sourceType"];
  sourceTier: CompanyResearchSource["sourceTier"];
  reason: string;
  isUserSpecified: boolean;
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
const searchModel =
  process.env.OPENAI_SEARCH_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const sourceFetchTimeoutMs = 8_000;
const webSearchTimeoutMs = 60_000;
const summaryTimeoutMs = 45_000;
const maxFetchedChars = 8_000;
const maxCandidateUrls = 16;
const maxVerifiedSources = 8;
const sourceTypeCaps: Partial<
  Record<CompanyResearchSource["sourceType"], number>
> = {
  company_database: 2,
  official_site: 3,
  recruiting: 2,
  financial_disclosure: 2,
  public_registry: 2,
  major_media: 1,
  url: 2,
};
const trustedCompanyInfoServices = [
  "nikkei.com",
  "nikkei.co.jp",
  "nkbb.jp",
  "g-search.or.jp",
  "cnavi.g-search.or.jp",
];
const majorMediaDomains = [
  "nikkei.com",
  "reuters.com",
  "bloomberg.co.jp",
  "bloomberg.com",
  "nhk.or.jp",
  "toyokeizai.net",
];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CompanyResearchRequest;
    const applicationTarget = normalizeApplicationTarget(body.applicationTarget);

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
  const userCorporateNumberPage =
    createUserProvidedCorporateNumberPage(applicationTarget);
  const verifiedPages = await enrichVerifiedPagesWithResolvedSources(
    client,
    applicationTarget,
    [
      ...(await fetchAndValidateSources(candidates, applicationTarget)),
      ...(userCorporateNumberPage ? [userCorporateNumberPage] : []),
    ],
  );
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
  const validatedSummary = validateSummaryDraft(
    summary,
    sources,
    applicationTarget,
    facts,
  );
  const generatedAt = new Date().toISOString();
  const sourceManifest = createSourceManifest(sources, generatedAt);
  const companyClaims = createCompanyClaims(
    applicationTarget,
    facts,
    validatedSummary,
    sources,
    sourceManifest,
  );
  const userProvidedCorporateNumber = extractManualCorporateNumber(applicationTarget);
  const claimBackedIdentity = applySupportedClaimsToIdentity(
    facts.identity,
    companyClaims,
  );
  const finalIdentity = {
    ...claimBackedIdentity,
    corporateNumber:
      userProvidedCorporateNumber || claimBackedIdentity.corporateNumber,
  };
  const finalUnknowns = userProvidedCorporateNumber
    ? facts.unknowns.filter((unknown) => !unknown.includes("法人番号"))
    : facts.unknowns;
  const claimBackedBusinessSummary = buildBusinessSummaryFromClaims(
    companyClaims,
    validatedSummary.businessSummary,
  );
  const claimBackedEvidenceDigest = buildEvidenceDigestFromClaims(
    companyClaims,
    sources,
    validatedSummary.evidenceDigest,
  );
  const accessMode =
    sources.filter((source) => source.accessStatus === "fetched").length > 0
      ? "fetched_sources"
      : userMemoSource
        ? "user_sources_only"
        : "model_knowledge_only";

  return {
    researchId: `company-research-${Date.now()}`,
    generatedAt,
    companyName: applicationTarget.companyName,
    industry: applicationTarget.industry,
    position: applicationTarget.position,
    accessMode,
    confidence: getResearchConfidence(sources, facts),
    companyUnderstandingMemo: validatedSummary.companyUnderstandingMemo,
    identitySummary: finalIdentity,
    businessSummary: claimBackedBusinessSummary,
    financialHighlights: facts.financialHighlights,
    recentDevelopments: validatedSummary.recentDevelopments,
    evidenceDigest: claimBackedEvidenceDigest,
    sourceCoverage: createSourceCoverage(sources),
    roleFitHypotheses: validatedSummary.roleFitHypotheses,
    esReviewFocus: validatedSummary.esReviewFocus,
    sources,
    sourceManifest,
    companyClaims,
    unknowns: finalUnknowns,
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
        true,
      ),
    );

  const knownListedCompanyUrls = getKnownListedCompanyUrls(applicationTarget);

  if (!client) {
    return sortCandidateSources(
      dedupeCandidates([
        ...userCandidates,
        ...knownListedCompanyUrls.map((item, index) =>
          createCandidate(
            item.url,
            item.title,
            `known-listed-${index + 1}`,
            applicationTarget,
            item.reason,
            false,
          ),
        ),
      ]),
    ).slice(0, maxCandidateUrls);
  }

  const knownBrandUrls = getKnownBrandOfficialUrls(applicationTarget);
  const officialUrls = await discoverOfficialCompanyUrls(client, applicationTarget);
  const trustedDatabaseUrls = isForeignCompanyMode(applicationTarget)
    ? []
    : await discoverTrustedDatabaseUrls(client, applicationTarget);
  const supplementalUrls = isForeignCompanyMode(applicationTarget)
    ? []
    : await discoverSupplementalCompanyUrls(client, applicationTarget);
  const discoveredUrls = await discoverUrlsWithOpenAISearch(client, applicationTarget);
  const discoveredCandidates = [
    ...knownListedCompanyUrls,
    ...knownBrandUrls,
    ...officialUrls,
    ...trustedDatabaseUrls,
    ...supplementalUrls,
    ...discoveredUrls,
  ].map((item, index) =>
    createCandidate(
      item.url,
      item.title || getDomain(item.url) || item.url,
      `search-url-${index + 1}`,
      applicationTarget,
      item.reason || "検索候補",
      false,
    ),
  );

  return sortCandidateSources(
    dedupeCandidates([...userCandidates, ...discoveredCandidates]),
  ).slice(0, maxCandidateUrls);
}

async function enrichVerifiedPagesWithResolvedSources(
  client: OpenAI | null,
  applicationTarget: ApplicationTarget,
  pages: VerifiedPage[],
) {
  let enrichedPages = [...pages];
  const initialFacts = extractCompanyFacts(applicationTarget, enrichedPages);
  const securitiesCode =
    initialFacts.identity.securitiesCode || findSecuritiesCodeInPages(enrichedPages);

  if (
    securitiesCode &&
    !enrichedPages.some((page) => isNikkeiCompanyProfileUrl(page.url))
  ) {
    const nikkeiPages = await fetchAndValidateSources(
      [
        createResolvedCandidate(
          `https://www.nikkei.com/nkd/company/gaiyo/?scode=${securitiesCode}`,
          "日経会社情報",
          `resolved-nikkei-${securitiesCode}`,
          applicationTarget,
          "証券コードから生成した日経会社情報URL",
        ),
      ],
      applicationTarget,
    );
    enrichedPages = dedupeVerifiedPages([...enrichedPages, ...nikkeiPages]);
  }

  const factsAfterNikkei = extractCompanyFacts(applicationTarget, enrichedPages);
  if (
    client &&
    !isForeignCompanyMode(applicationTarget) &&
    !factsAfterNikkei.identity.corporateNumber
  ) {
    const publicUrls = await discoverCorporateRegistryUrls(client, applicationTarget);
    const publicPages = await fetchAndValidateSources(
      publicUrls.map((item, index) =>
        createCandidate(
          item.url,
          item.title || "法人番号・公的DB",
          `resolved-public-${index + 1}`,
          applicationTarget,
          item.reason || "法人番号・公的DBの追加探索",
          false,
        ),
      ),
      applicationTarget,
    );
    enrichedPages = dedupeVerifiedPages([...enrichedPages, ...publicPages]);
  }

  const factsAfterPublic = extractCompanyFacts(applicationTarget, enrichedPages);
  if (!isForeignCompanyMode(applicationTarget) && !factsAfterPublic.identity.corporateNumber) {
    const ntaPage = await resolveCorporateNumberVerifiedPage(
      applicationTarget,
      factsAfterPublic.identity.headquarters,
    );
    if (ntaPage) {
      enrichedPages = dedupeVerifiedPages([...enrichedPages, ntaPage]);
    }
  }

  const factsAfterNta = extractCompanyFacts(applicationTarget, enrichedPages);
  if (
    client &&
    !isForeignCompanyMode(applicationTarget) &&
    !factsAfterNta.identity.securitiesCode &&
    !enrichedPages.some((page) => isNikkeiCompanyProfileUrl(page.url))
  ) {
    const nikkeiUrls = await discoverNikkeiCompanyProfileUrls(client, applicationTarget);
    const nikkeiPages = await fetchAndValidateSources(
      nikkeiUrls.map((item, index) =>
        createCandidate(
          item.url,
          item.title || "日経会社情報",
          `resolved-nikkei-search-${index + 1}`,
          applicationTarget,
          item.reason || "日経会社情報の追加探索",
          false,
        ),
      ),
      applicationTarget,
    );
    enrichedPages = dedupeVerifiedPages([...enrichedPages, ...nikkeiPages]);
  }

  return applyVerifiedSourcePolicy(
    filterInconsistentOfficialSites(enrichedPages, applicationTarget),
  );
}

async function resolveCorporateNumberVerifiedPage(
  applicationTarget: ApplicationTarget,
  headquarters: string,
): Promise<VerifiedPage | null> {
  const result = await resolveCorporateNumberFromNta({
    applicationTarget,
    headquarters,
  });
  if (!result.corporateNumber) return null;
  return createNtaVerifiedPage(result, applicationTarget);
}

function createNtaVerifiedPage(
  result: CorporateNumberResolveResult,
  applicationTarget: ApplicationTarget,
): VerifiedPage {
  const best = result.candidates[0];
  const title = `国税庁法人番号公表サイト: ${result.legalName || applicationTarget.companyName}`;
  const excerpt = [
    `法人番号 ${result.corporateNumber}`,
    `会社名 ${result.legalName || applicationTarget.companyName}`,
    result.headquarters ? `所在地 ${result.headquarters}` : "",
    best?.assignmentDate ? `法人番号指定年月日 ${best.assignmentDate}` : "",
    "出典 国税庁法人番号システムWeb-API",
    "このサービスは、国税庁法人番号システムのWeb-API機能を利用して取得した情報をもとに作成しているが、サービスの内容は国税庁によって保証されたものではない",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: "nta-corporate-number-api",
    title,
    url: "https://www.houjin-bangou.nta.go.jp/",
    sourceType: "public_registry",
    sourceTier: "public",
    reason: "国税庁法人番号システムWeb-APIによる法人番号照合",
    isUserSpecified: false,
    accessStatus: "fetched",
    excerpt,
  };
}

function createUserProvidedCorporateNumberPage(
  applicationTarget: ApplicationTarget,
): VerifiedPage | null {
  const corporateNumber = extractManualCorporateNumber(applicationTarget);
  if (!corporateNumber) return null;

  const title = `ユーザー指定法人番号: ${applicationTarget.companyName}`;
  const excerpt = [
    `法人番号 ${corporateNumber}`,
    `会社名 ${applicationTarget.companyName}`,
    "ユーザーが提出前提として入力した法人識別子です。",
  ].join(" ");

  return {
    id: "user-provided-corporate-number",
    title,
    url: "",
    sourceType: "public_registry",
    sourceTier: "user",
    reason: "ユーザー入力の法人番号を固定欄に優先反映",
    isUserSpecified: true,
    accessStatus: "fetched",
    excerpt,
  };
}

function extractManualCorporateNumber(applicationTarget: ApplicationTarget) {
  const texts = [
    applicationTarget.corporateNumber ?? "",
    applicationTarget.companyMemo,
    ...applicationTarget.referenceUrls.flatMap((source) => [
      source.title,
      source.url ?? "",
      source.memo ?? "",
    ]),
  ];
  return texts.map(extractCorporateNumberDigits).find(Boolean) ?? "";
}

function extractCorporateNumberDigits(value: string | undefined) {
  const match = (value ?? "").match(/(?:^|\D)([0-9０-９][0-9０-９\-\s　]{11,20}[0-9０-９])(?:\D|$)/u);
  if (!match) return "";
  const digits = match[1].replace(/\D/gu, "");
  return digits.length === 13 ? digits : "";
}

function createResolvedCandidate(
  url: string,
  title: string,
  id: string,
  applicationTarget: ApplicationTarget,
  reason: string,
) {
  return createCandidate(url, title, id, applicationTarget, reason, false);
}

function getKnownBrandOfficialUrls(
  applicationTarget: ApplicationTarget,
): Array<{ url: string; title: string; reason: string }> {
  const normalized = toSearchToken(applicationTarget.companyName);
  if (normalized.includes("ゴルドマンサックス") || normalized.includes("goldmansachs")) {
    return [
      {
        url: "https://www.goldmansachs.com/",
        title: "Goldman Sachs 公式サイト",
        reason: "外資ブランドの公式グローバルサイト",
      },
      {
        url: "https://www.goldmansachs.com/careers/",
        title: "Goldman Sachs Careers",
        reason: "外資ブランドの公式採用サイト",
      },
    ];
  }
  if (normalized.includes("モルガンスタンレー")) {
    return [
      {
        url: "https://www.morganstanley.com/",
        title: "Morgan Stanley 公式サイト",
        reason: "外資ブランドの公式グローバルサイト",
      },
      {
        url: "https://www.morganstanley.com/people-opportunities",
        title: "Morgan Stanley Careers",
        reason: "外資ブランドの公式採用サイト",
      },
    ];
  }
  if (normalized.includes("ジェーピーモルガン") || normalized.includes("jpモルガン")) {
    return [
      {
        url: "https://www.jpmorgan.com/",
        title: "J.P. Morgan 公式サイト",
        reason: "外資ブランドの公式グローバルサイト",
      },
      {
        url: "https://www.jpmorgan.com/global/careers",
        title: "J.P. Morgan Careers",
        reason: "外資ブランドの公式採用サイト",
      },
    ];
  }
  return [];
}

function getKnownListedCompanyUrls(
  applicationTarget: ApplicationTarget,
): Array<{ url: string; title: string; reason: string }> {
  const normalized = toSearchToken(applicationTarget.companyName);
  const knownProfiles: Array<{
    matcher: RegExp;
    officialUrl: string;
    nikkeiUrl: string;
    title: string;
  }> = [
    {
      matcher: /東京エレクトロン|tokyoelectron/u,
      officialUrl: "https://www.tel.co.jp/about/summary/",
      nikkeiUrl: "https://www.nikkei.com/nkd/company/gaiyo/?scode=8035",
      title: "東京エレクトロン",
    },
    {
      matcher: /鹿島建設|kajima/u,
      officialUrl: "https://www.kajima.co.jp/prof/outline/",
      nikkeiUrl: "https://www.nikkei.com/nkd/company/gaiyo/?scode=1812",
      title: "鹿島建設",
    },
    {
      matcher: /三菱商事|mitsubishicorp/u,
      officialUrl: "https://www.mitsubishicorp.com/jp/ja/about/profile/",
      nikkeiUrl: "https://www.nikkei.com/nkd/company/gaiyo/?scode=8058",
      title: "三菱商事",
    },
    {
      matcher: /三菱地所|mec/u,
      officialUrl: "https://www.mec.co.jp/company/about/",
      nikkeiUrl: "https://www.nikkei.com/nkd/company/gaiyo/?scode=8802",
      title: "三菱地所",
    },
  ];
  const profile = knownProfiles.find((item) => item.matcher.test(normalized));
  if (!profile) return [];
  return [
    {
      url: profile.officialUrl,
      title: `${profile.title} 公式会社概要`,
      reason: "既知の上場企業公式会社概要URL",
    },
    {
      url: profile.nikkeiUrl,
      title: `日経会社情報: ${profile.title}`,
      reason: "既知の証券コードから固定した日経会社情報URL",
    },
  ];
}

function filterInconsistentOfficialSites(
  pages: VerifiedPage[],
  applicationTarget: ApplicationTarget,
) {
  const canonicalOfficialUrl = pages
    .filter((page) => page.sourceType === "company_database")
    .map((page) => extractOfficialWebsite(page.excerpt))
    .find(isKnownValue);
  const canonicalDomains = [
    getDomain(canonicalOfficialUrl ?? ""),
    ...getCanonicalOfficialDomains(applicationTarget),
  ].filter(Boolean);
  if (canonicalDomains.length === 0) return pages;

  return pages.filter((page) => {
    if (!["official_site", "recruiting"].includes(page.sourceType)) return true;
    if (page.isUserSpecified) return true;
    const domain = getDomain(page.url);
    return canonicalDomains.some((canonicalDomain) =>
      isSameOrSubdomain(domain, canonicalDomain),
    );
  });
}

async function discoverOfficialCompanyUrls(
  client: OpenAI,
  applicationTarget: ApplicationTarget,
): Promise<Array<{ url: string; title: string; reason: string }>> {
  const prompt = `
${applicationTarget.companyName} そのものの公式URLだけを探してください。

ユーザー指定URL:
${formatReferenceUrlsForPrompt(applicationTarget)}

返すURL:
- 公式会社概要URL
- 公式IRまたは投資家情報URL
- 公式採用URL
- 公式ニュースまたはプレスリリースURL

重要:
- 子会社、関連会社、グループ会社、同じブランドを含む別法人は除外します。
- 外資系企業やブランド名入力の場合は、日本の法人番号DBよりも公式グローバルサイト、公式日本サイト、公式採用サイトを優先します。
- 対象がブランド名だけの場合、ジャパン・サービス、エナジー、証券、アセット・マネジメント等の別法人ページを会社本体として扱わないでください。
- 就活媒体、口コミ、Wikipedia、AI回答ページ、第三者の企業プロフィールは除外します。
- URLを本文にそのまま書いてください。
`.trim();

  return discoverUrlsWithOpenAIResponses(client, prompt, "公式URL専用検索候補");
}

async function discoverTrustedDatabaseUrls(
  client: OpenAI,
  applicationTarget: ApplicationTarget,
): Promise<Array<{ url: string; title: string; reason: string }>> {
  const prompt = `
${applicationTarget.companyName} のESレビュー前提情報として、信頼度の高い会社情報サービスと公的サイトだけを探してください。

最優先:
- ユーザー指定URL。取得できる場合は必ず候補に残す。
- 日経新聞社/日経グループの会社情報・企業情報サービス上の対象企業ページ（企業INDEXナビ、日経会社情報、NIKKEI COMPASS等）
- 国税庁 法人番号公表サイトの対象企業ページ
- gBizINFO の対象企業ページ
- 金融庁 EDINET または公式IRの対象企業ページ

ユーザー指定URL:
${formatReferenceUrlsForPrompt(applicationTarget)}

除外:
- 就活媒体、口コミ、Wikipedia、AI回答ページ、第三者ブログ
- 対象企業ではなく子会社・関連会社・グループ会社のページ
- 法人番号制度やgBizINFO制度の説明ページ

URLを本文にそのまま書き、確認できる情報を短く添えてください。
`.trim();

  return discoverUrlsWithOpenAIResponses(client, prompt, "信頼DB・公的サイト検索候補");
}

async function discoverSupplementalCompanyUrls(
  client: OpenAI,
  applicationTarget: ApplicationTarget,
): Promise<Array<{ url: string; title: string; reason: string }>> {
  const prompt = `
${applicationTarget.companyName} の固定欄確認に使う補助URLを探してください。
目的は法人番号、証券コード、上場市場、所在地、資本金、従業員数の確認です。

ユーザー指定URL:
${formatReferenceUrlsForPrompt(applicationTarget)}

重要:
- 対象は「${applicationTarget.companyName}」そのものです。
- 子会社、関連会社、グループ会社、同じブランドを含む別法人を混ぜないでください。
- 外資系企業やブランド名入力では、法人番号・所在地は日本法人の一部会社を指す可能性があります。公式サイトで本体確認できない限り、別法人の法人番号ページを候補にしないでください。
- 例: 対象が三菱商事なら、三菱商事ライフサイエンス、三菱商事エネルギー、三菱商事パッケージング、三菱地所は除外します。
- 例: 対象が伊藤忠商事なら、伊藤忠テクノソリューションズ、伊藤忠食品、伊藤忠エネクスは除外します。

優先:
- 対象企業そのものの法人番号公表ページ、gBizINFO、会社情報系の企業詳細ページ
- 企業公式の会社概要
- 公式IRまたは有価証券報告書

除外:
- 汎用の制度説明ページ
- Wikipedia、就活媒体、口コミ、求人媒体

URLだけでなく、そのURLで確認できる固定欄項目を短く添えてください。
`.trim();
  return discoverUrlsWithOpenAIResponses(client, prompt, "固定欄補助検索候補");
}

async function discoverCorporateRegistryUrls(
  client: OpenAI,
  applicationTarget: ApplicationTarget,
): Promise<Array<{ url: string; title: string; reason: string }>> {
  const prompt = `
${applicationTarget.companyName} そのものの法人番号を確認できるページだけを探してください。

必須条件:
- 対象法人名が「${applicationTarget.companyName}」と一致するページ
- 法人番号、公的DB、gBizINFO、国税庁法人番号公表サイト、または会社情報DX/companyinformation.jp の企業詳細ページ

除外:
- 子会社、関連会社、同名ブランドの別法人
- 法人番号制度の説明ページ
- 求人、口コミ、就活媒体、Wikipedia

URLを本文にそのまま書き、そのページで確認できる法人番号・所在地を短く添えてください。
`.trim();

  return discoverUrlsWithOpenAIResponses(client, prompt, "法人番号・公的DBの追加探索");
}

async function discoverNikkeiCompanyProfileUrls(
  client: OpenAI,
  applicationTarget: ApplicationTarget,
): Promise<Array<{ url: string; title: string; reason: string }>> {
  const prompt = `
${applicationTarget.companyName} の日経会社情報DIGITALの企業概要ページだけを探してください。

探すURL形式:
- https://www.nikkei.com/nkd/company/gaiyo/?scode=XXXX

必須条件:
- 対象企業が「${applicationTarget.companyName}」そのもの
- URLに /nkd/company/gaiyo/ と scode= が含まれる

除外:
- 日経のニュース記事
- NIKKEI Financialなどの記事ページ
- 子会社、関連会社、同名別法人

URLを本文にそのまま書き、証券コードが分かる場合は併記してください。
`.trim();

  return discoverUrlsWithOpenAIResponses(client, prompt, "日経会社情報の追加探索");
}

async function discoverUrlsWithOpenAISearch(
  client: OpenAI,
  applicationTarget: ApplicationTarget,
): Promise<Array<{ url: string; title: string; reason: string }>> {
  const prompt = `
${applicationTarget.companyName} / ${applicationTarget.position} のESレビュー前に使う出典URLを探してください。

ユーザー指定URL:
${formatReferenceUrlsForPrompt(applicationTarget)}

重要:
- 対象は「${applicationTarget.companyName}」そのものです。
- 子会社、関連会社、グループ会社、同じブランドを含む別法人を混ぜないでください。
- 例: 対象が三菱商事なら、三菱商事ライフサイエンス、三菱商事エネルギー、三菱商事パッケージング、三菱地所は除外します。
- 例: 対象が伊藤忠商事なら、伊藤忠テクノソリューションズ、伊藤忠食品、伊藤忠エネクスは除外します。

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

  return discoverUrlsWithOpenAIResponses(client, prompt, "OpenAI検索候補");
}

async function discoverUrlsWithOpenAIResponses(
  client: OpenAI,
  prompt: string,
  reason: string,
): Promise<Array<{ url: string; title: string; reason: string }>> {
  try {
    const response = await withTimeout(
      client.responses.create(
        {
          model: searchModel,
          instructions:
            "You find candidate URLs only. Prefer exact official, public registry, recruiting, IR, and major media pages for the target company. Include raw URLs in the answer.",
          input: prompt,
          tools: [
            {
              type: "web_search_preview",
              search_context_size: "medium",
              user_location: {
                type: "approximate",
                country: "JP",
                timezone: "Asia/Tokyo",
              },
            },
          ],
          tool_choice: { type: "web_search_preview" },
          include: ["web_search_call.action.sources"],
          max_output_tokens: 900,
        },
        { signal: AbortSignal.timeout(webSearchTimeoutMs) },
      ),
      webSearchTimeoutMs,
      "OpenAI web search timed out",
    );
    const content = response.output_text ?? "";
    const urls = [...new Set([...extractResponseSourceUrls(response), ...extractUrls(content)])]
      .map(normalizeSourceUrl)
      .filter(Boolean);
    return urls.map((url) => ({
      url,
      title: findNearbyTitle(content, url),
      reason,
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
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
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
        const sourceType = classifySourceType(
          candidate.url,
          `${documentTitle} ${candidate.url} ${excerpt}`,
        );
        const page: VerifiedPage = {
          ...candidate,
          title: documentTitle || candidate.url,
          sourceType,
          sourceTier: classifySourceTier(candidate.url, sourceType),
          accessStatus: "fetched",
          excerpt,
        };

        if (isInconsistentOfficialDomain(page, applicationTarget)) return null;
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

  return applyVerifiedSourcePolicy(
    dedupeVerifiedPages(pages.filter((page): page is VerifiedPage => Boolean(page))),
  );
}

function extractCompanyFacts(
  applicationTarget: ApplicationTarget,
  pages: VerifiedPage[],
): ExtractedFacts {
  const foreignMode = isForeignCompanyMode(applicationTarget);
  const officialPages = pages.filter((page) =>
    ["official_site", "recruiting", "financial_disclosure"].includes(
      page.sourceType,
    ),
  );
  const officialSitePages = pages.filter(
    (page) => page.sourceType === "official_site",
  );
  const publicPages = pages.filter((page) =>
    ["public_registry", "company_database"].includes(page.sourceType),
  );
  const nikkeiCompanyInfoPages = pages.filter((page) =>
    isNikkeiCompanyProfileUrl(page.url) ||
    isTrustedCompanyInfoDomain(getDomain(page.url)),
  );
  const identityPages = [
    ...nikkeiCompanyInfoPages,
    ...officialSitePages,
    ...(foreignMode ? [] : publicPages),
    ...pages,
  ];
  const allPages = foreignMode
    ? [...officialPages, ...pages]
    : [...publicPages, ...officialPages, ...pages];
  const firstIdentityValue = (extractor: (text: string) => string) =>
    normalizeKnownText(
      identityPages.map((page) => extractor(page.excerpt)).find(isKnownValue) ?? "",
    );
  const securitiesCode = foreignMode ? "" : firstIdentityValue(extractSecuritiesCode);
  const listingMarket = foreignMode ? "" : firstIdentityValue(extractListingMarket);
  const headquarters = firstIdentityValue(extractHeadquarters);
  const officialWebsite =
    firstIdentityValue(extractOfficialWebsite) || pickBestOfficialWebsite(officialSitePages);
  const corporateNumber = foreignMode
    ? ""
    : pickCorporateNumber(
        identityPages,
        applicationTarget,
        headquarters,
        securitiesCode,
      );
  const extractedLegalName = firstIdentityValue(extractLegalName);
  const legalName =
    extractedLegalName &&
    containsCompanyToken(extractedLegalName, applicationTarget.companyName)
      ? extractedLegalName
      : pages.some((page) =>
            containsCompanyToken(page.excerpt, applicationTarget.companyName),
          )
        ? applicationTarget.companyName
        : "";
  const jurisdiction = foreignMode
    ? "グローバル / 外資系"
    : corporateNumber || /[一-龯ぁ-んァ-ヶ]/u.test(applicationTarget.companyName)
      ? "日本"
      : "";
  const entityKind = foreignMode
    ? "外資系企業"
    : securitiesCode || listingMarket
      ? "上場企業"
      : corporateNumber
        ? "日本法人"
        : "";
  const extractedIndustry = firstIdentityValue(extractIndustry);
  const industryClassification =
    foreignMode || !isCleanIndustryClassification(extractedIndustry)
      ? applicationTarget.industry || ""
      : extractedIndustry || applicationTarget.industry || "";
  const financialHighlights = createFinancialHighlights(allPages);
  const unknowns = [
    !foreignMode && !corporateNumber
      ? "法人番号は公的情報ソースから確認できていません。"
      : "",
    !foreignMode && !securitiesCode
      ? "証券コードは確認済みソースから抽出できていません。"
      : "",
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

function pickBestOfficialWebsite(pages: VerifiedPage[]) {
  const officialPage = pages
    .filter((page) => page.sourceType === "official_site")
    .sort((a, b) => getOfficialWebsiteScore(b) - getOfficialWebsiteScore(a))[0];
  return officialPage?.url ?? "";
}

function getOfficialWebsiteScore(page: VerifiedPage) {
  const target = `${page.title} ${page.url}`.toLowerCase();
  let score = getSourceSelectionScore(page);
  if (/会社概要|企業情報|企業データ|company|corporate|profile|outline|about/u.test(target)) {
    score += 80;
  }
  if (/governance|ir\/library|news|press|recruit|career|採用|お知らせ|ニュース/u.test(target)) {
    score -= 60;
  }
  const pathDepth = (() => {
    try {
      return new URL(page.url).pathname.split("/").filter(Boolean).length;
    } catch {
      return 0;
    }
  })();
  return score - Math.max(0, pathDepth - 2) * 8;
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

文章方針:
- 参照ソースは少数精鋭で扱う。会社概要、採用/職種、IR/統合報告、公的情報、ユーザー入力の型から外れる情報を主根拠にしない。
- 法人番号、所在地、証券コード、上場市場、業種分類などの基本会社情報は、検証済みソースに日経会社情報系（企業INDEXナビ、日経会社情報、NIKKEI COMPASS等）が含まれる場合、それを最優先で扱う。なければ国税庁/gBizINFO/EDINET/公式会社概要の順に使う。
- companyUnderstandingMemoは必ず「会社概要または企業データ」を第一根拠にする。ニュース一覧、プレスリリース一覧、ナビゲーション本文、第三者記事を企業全体説明の主根拠にしない。
- businessSummaryは最大3件、evidenceDigestは最大4件、recentDevelopmentsは最大2件に抑える。
- businessSummaryは企業紹介の一般論ではなく、ESを書く前に押さえるべき事業理解を2〜4件で短く書く。
- roleFitHypothesesは「応募職種の人がどう貢献できるか」の仮説にする。根拠が薄い場合は断定しない。
- esReviewFocusはESレビュー時のチェック観点にする。「技術革新プロジェクトへの適合性」のような抽象語だけで終えず、本人経験と企業情報をどう接続するかを書け。
- evidenceDigest.userRelevanceは、ES本文にそのまま入れる文ではなく「使い方」を書く。
- evidenceDigest.riskNoteは空にしない。直接使える情報でも「数値は年度・出典を併記」「志望動機では事業理解に留める」など短い注意を書く。
- major_mediaの個別記事は「最近の動向」または背景理解に限定する。companyUnderstandingMemoやbusinessSummaryの中核説明は、公式会社概要・公式採用・公式IR・公的情報を優先する。
- 銀行、商社、メーカーなど大企業では、個別の海外フィンテック記事や富裕層記事を企業全体の代表事業のように扱わない。
- 最近の動向は、日付と見出しがソース本文で確認できる場合だけ返す。確認できない場合は空配列。

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
      "sourceType": "official_site | recruiting | company_database | public_registry | financial_disclosure | major_media | url",
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
  facts?: ExtractedFacts,
): SummaryDraft {
  const sourceIds = new Set(sources.map((source) => source.id));
  const fallback = createFallbackSummary(applicationTarget, sources, {
    identity: emptyIdentity(applicationTarget),
    financialHighlights: [],
    unknowns: [],
  });

  const evidenceDigest = (Array.isArray(draft.evidenceDigest)
    ? draft.evidenceDigest
    : []
  )
    .map((item) => ({
      category: normalizeEvidenceCategoryForSources(item.category, item.sourceIds, sources),
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
    .slice(0, 4);
  const businessSummary = buildBusinessSummaryFromSources(
    applicationTarget,
    sources,
    evidenceDigest,
    facts,
  );

  return {
    companyUnderstandingMemo:
      normalizeKnownText(draft.companyUnderstandingMemo) ||
      fallback.companyUnderstandingMemo,
    businessSummary,
    roleFitHypotheses: normalizeStringList(draft.roleFitHypotheses).slice(0, 3),
    esReviewFocus: normalizeStringList(draft.esReviewFocus).slice(0, 4),
    evidenceDigest,
    recentDevelopments: (Array.isArray(draft.recentDevelopments)
      ? draft.recentDevelopments
      : []
      )
      .filter((item) => {
        const source = sources.find((sourceItem) => sourceItem.id === item.sourceId);
        return source ? isGroundedRecentDevelopment(item, source) : false;
      })
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
      .slice(0, 2),
  };
}

function createSourceManifest(
  sources: CompanyResearchSource[],
  retrievedAt: string,
): CompanySourceManifestEntry[] {
  return sources.map((source) => ({
    sourceId: source.id,
    title: source.title,
    url: source.url,
    sourceType: source.sourceType,
    sourceTier: source.sourceTier,
    retrievedAt,
    chunks: createSourceChunks(source),
  }));
}

function buildBusinessSummaryFromSources(
  applicationTarget: ApplicationTarget,
  sources: CompanyResearchSource[],
  evidenceDigest: CompanyEvidenceDigest[],
  facts?: ExtractedFacts,
) {
  const officialSource = pickBestSource(sources, ["official_site"]);
  const recruitingSource = pickBestSource(sources, ["recruiting"]);
  const officialEvidence = evidenceDigest.find(
    (item) => item.category === "official_company",
  );
  const industryLabel = formatIndustryClassification(
    facts?.identity.industryClassification,
  );
  const summaries = [
    industryLabel
      ? `${applicationTarget.companyName}は、${industryLabel}に分類される企業です。`
      : "",
    officialSource
      ? createOfficialBusinessSummary(officialSource, applicationTarget)
      : officialEvidence?.summary || "",
    recruitingSource
      ? extractRecruitingRoleSummary(recruitingSource, applicationTarget)
      : "",
  ].filter((item) => item && !looksLikeFinancialSummary(item));

  return [...new Set(summaries)].slice(0, 3);
}

function createOfficialBusinessSummary(
  source: CompanyResearchSource,
  applicationTarget: ApplicationTarget,
) {
  const officialSentence = firstUsefulCompanySentence(source.excerpt);
  if (officialSentence) {
    return officialSentence;
  }

  const businessTerms = formatIndustryClassification(applicationTarget.industry);
  return businessTerms
    ? `${applicationTarget.companyName}は、${businessTerms}に関わる事業を展開しています。`
    : `${applicationTarget.companyName}は、公式会社情報で事業内容を確認できる企業です。`;
}

function firstUsefulCompanySentence(text: string) {
  const blocked = /FAQ|お問い合わせ|English|サイト内検索|トップページ|メニュー|mypage|entry|キーワード|絞り込み検索|Copyright/u;
  const sentences = cleanSourceSentence(text)
    .split(/(?<=[。.!?！？])\s*/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24 && sentence.length <= 180)
    .filter((sentence) => !blocked.test(sentence))
    .filter((sentence) => !looksLikeFinancialSummary(sentence));

  return sentences[0] ?? "";
}

function extractRecruitingRoleSummary(
  source: CompanyResearchSource,
  applicationTarget: ApplicationTarget,
) {
  const match = source.excerpt.match(
    /数理（情報）系\s*([^。]{20,180}?研究開発)/u,
  );
  const roleText = match?.[1]
    ? `数理（情報）系では${cleanSourceSentence(match[1])}。`
    : `${applicationTarget.position || "志望職種"}では、公式採用情報に基づいて本人経験との接続を確認します。`;
  return roleText;
}

function looksLikeFinancialSummary(text: string) {
  return /資本金|売上高|売上収益|純利益|営業利益|PER|PBR|時価|配当|億円|兆円|百万円/u.test(
    text,
  );
}

function createSourceChunks(source: CompanyResearchSource): CompanySourceChunk[] {
  const sentences = source.excerpt
    .split(/(?<=[。.!?！？])\s*/u)
    .map((sentence) => cleanSourceSentence(sentence))
    .filter((sentence) => sentence.length >= 18);
  const units = sentences.length > 0 ? sentences : [cleanSourceSentence(source.excerpt)];

  return units.slice(0, 8).map((text, index) => ({
    chunkId: `${source.id}:L${index + 1}`,
    sourceId: source.id,
    lineStart: index + 1,
    lineEnd: index + 1,
    text: text.slice(0, 360),
  }));
}

function createCompanyClaims(
  applicationTarget: ApplicationTarget,
  facts: ExtractedFacts,
  summary: SummaryDraft,
  sources: CompanyResearchSource[],
  manifest: CompanySourceManifestEntry[],
): CompanyClaim[] {
  const identity = facts.identity;
  const claims: CompanyClaim[] = [
    createValueClaim({
      id: "claim-legal-name",
      claimType: "legal_name",
      label: "正式名称",
      value: identity.legalName,
      fallbackText: `${applicationTarget.companyName}の正式名称`,
      sources,
      manifest,
    }),
    createValueClaim({
      id: "claim-corporate-number",
      claimType: "corporate_number",
      label: "法人番号",
      value: identity.corporateNumber,
      fallbackText: `${applicationTarget.companyName}の法人番号`,
      sources,
      manifest,
    }),
    createValueClaim({
      id: "claim-headquarters",
      claimType: "headquarters",
      label: "所在地",
      value: identity.headquarters,
      fallbackText: `${applicationTarget.companyName}の本社所在地`,
      sources,
      manifest,
    }),
    createValueClaim({
      id: "claim-industry",
      claimType: "industry",
      label: "業種分類",
      value: identity.industryClassification,
      fallbackText: `${applicationTarget.companyName}の業種分類`,
      sources,
      manifest,
    }),
    createValueClaim({
      id: "claim-official-website",
      claimType: "official_website",
      label: "公式サイト",
      value: identity.officialWebsite,
      fallbackText: `${applicationTarget.companyName}の公式サイト`,
      sources,
      manifest,
    }),
    createValueClaim({
      id: "claim-securities-code",
      claimType: "securities_code",
      label: "証券コード",
      value: identity.securitiesCode,
      fallbackText: `${applicationTarget.companyName}の証券コード`,
      sources,
      manifest,
    }),
    createValueClaim({
      id: "claim-listing-market",
      claimType: "listing_market",
      label: "上場市場",
      value: identity.listingMarket,
      fallbackText: `${applicationTarget.companyName}の上場市場`,
      sources,
      manifest,
    }),
    ...facts.financialHighlights.map((item, index) =>
      createFinancialClaim(item, index, sources, manifest),
    ),
    ...summary.businessSummary
      .filter((text) => !looksLikeFinancialSummary(text))
      .filter((text) => isUsableEsClaimText(text, "business_summary"))
      .map((text, index) =>
        createTextClaim({
          id: `claim-business-${index + 1}`,
          claimType: "business_summary",
          label: "事業理解",
          text,
          sourceIds: summary.evidenceDigest
            .filter((item) =>
              ["official_company", "public_registry"].includes(item.category),
            )
            .flatMap((item) => item.sourceIds),
          sources,
          manifest,
        }),
      ),
    ...summary.roleFitHypotheses
      .filter((text) => isUsableEsClaimText(text, "role_fit"))
      .map((text, index) =>
        createTextClaim({
          id: `claim-role-fit-${index + 1}`,
          claimType: "role_fit",
          label: "職種接続",
          text,
          sourceIds: summary.evidenceDigest
            .filter((item) => item.category === "official_company")
            .flatMap((item) => item.sourceIds),
          sources,
          manifest,
        }),
      ),
    ...summary.recentDevelopments.map((item, index) =>
      createTextClaim({
        id: `claim-recent-${index + 1}`,
        claimType: "recent_development",
        label: "最近の動向",
        text: item.summary,
        sourceIds: [item.sourceId],
        sources,
        manifest,
      }),
    ),
  ];

  return claims
    .map((claim) =>
      claim.verification === "unverified" ? claim : verifyClaimSupport(claim, sources),
    )
    .filter((claim) => claim.adopted || claim.claimType !== "recent_development")
    .slice(0, 24);
}

function createValueClaim({
  id,
  claimType,
  label,
  value,
  fallbackText,
  sources,
  manifest,
}: {
  id: string;
  claimType: CompanyClaim["claimType"];
  label: string;
  value: string;
  fallbackText: string;
  sources: CompanyResearchSource[];
  manifest: CompanySourceManifestEntry[];
}): CompanyClaim {
  const trimmedValue = normalizeKnownText(value);
  const support = trimmedValue
    ? findSupportForValue(trimmedValue, sources, manifest)
    : { sourceIds: [], chunkIds: [] };

  return {
    id,
    claimType,
    label,
    value: trimmedValue,
    text: trimmedValue ? `${label}: ${trimmedValue}` : fallbackText,
    sourceIds: support.sourceIds,
    chunkIds: support.chunkIds,
    verification: trimmedValue
      ? support.sourceIds.length > 0
        ? "supported"
        : "weak"
      : "unverified",
    confidence: getClaimConfidence(support.sourceIds, sources),
    adopted: Boolean(trimmedValue && support.sourceIds.length > 0),
    note: trimmedValue
      ? "固定抽出で取得。source chunkで裏取りします。"
      : "確認済みソースから抽出できていません。",
  };
}

function isUsableEsClaimText(
  text: string,
  claimType: "business_summary" | "role_fit",
) {
  const normalized = cleanBusinessDisplayText(text);
  if (normalized.length < 20 || normalized.length > 180) return false;
  if (looksLikeFinancialSummary(normalized)) return false;
  if (
    /FAQ|お問い合わせ|English|サイト内検索|トップページ|メニュー|mypage|entry|キーワード|絞り込み検索|Copyright/u.test(
      normalized,
    )
  ) {
    return false;
  }
  if (/けんきゅうしつ|どんな仕事|先輩社員|インターンシップ|マイページ/u.test(normalized)) {
    return false;
  }
  if (
    /候補者|でしょう|可能性がある|可能性が高い|ことが可能|考えられます|考えられる|確認します|確認できます|前提にします/u.test(
      normalized,
    )
  ) {
    return false;
  }
  if (claimType === "role_fit" && !/職|業務|技術|開発|研究|営業|設計|企画|推進|構築|分析|顧客/u.test(normalized)) {
    return false;
  }
  return true;
}

function createFinancialClaim(
  item: CompanyFinancialHighlight,
  index: number,
  sources: CompanyResearchSource[],
  manifest: CompanySourceManifestEntry[],
): CompanyClaim {
  const sourceIds = item.sourceId ? [item.sourceId] : [];
  const chunkIds = getChunkIdsForSources(sourceIds, manifest, item.value);
  return {
    id: `claim-financial-${index + 1}`,
    claimType:
      item.label === "売上高"
        ? "revenue"
        : item.label === "従業員数"
          ? "employees"
          : "capital",
    label: item.label,
    value: item.value,
    text: `${item.label}: ${item.value}`,
    sourceIds,
    chunkIds,
    verification: sourceIds.length > 0 ? "supported" : "weak",
    confidence: getClaimConfidence(sourceIds, sources),
    adopted: sourceIds.length > 0,
    note: "固定抽出で取得。数値をES本文で使う場合は年度と出典を併記します。",
  };
}

function createTextClaim({
  id,
  claimType,
  label,
  text,
  sourceIds,
  sources,
  manifest,
}: {
  id: string;
  claimType: CompanyClaim["claimType"];
  label: string;
  text: string;
  sourceIds: string[];
  sources: CompanyResearchSource[];
  manifest: CompanySourceManifestEntry[];
}): CompanyClaim {
  const uniqueSourceIds = [...new Set(sourceIds)].filter((sourceId) =>
    sources.some((source) => source.id === sourceId),
  );
  const chunkIds = getChunkIdsForSources(uniqueSourceIds, manifest, text);
  return {
    id,
    claimType,
    label,
    text,
    sourceIds: uniqueSourceIds,
    chunkIds,
    verification: uniqueSourceIds.length > 0 ? "supported" : "unverified",
    confidence: getClaimConfidence(uniqueSourceIds, sources),
    adopted: uniqueSourceIds.length > 0,
    note:
      uniqueSourceIds.length > 0
        ? "採用済みsourceIdに基づく編集用claimです。"
        : "sourceIdがないためレビューでは要確認として扱います。",
  };
}

function verifyClaimSupport(
  claim: CompanyClaim,
  sources: CompanyResearchSource[],
): CompanyClaim {
  if (claim.sourceIds.length === 0) {
    return { ...claim, verification: "unverified", confidence: "low", adopted: false };
  }
  const missingSource = claim.sourceIds.some(
    (sourceId) => !sources.some((source) => source.id === sourceId),
  );
  if (missingSource) {
    return { ...claim, verification: "unverified", confidence: "low", adopted: false };
  }
  return claim;
}

function findSupportForValue(
  value: string,
  sources: CompanyResearchSource[],
  manifest: CompanySourceManifestEntry[],
) {
  const normalizedValue = toSearchToken(value);
  const sourceIds = sources
    .filter((source) => {
      const sourceText = toSearchToken(`${source.title} ${source.url ?? ""} ${source.excerpt}`);
      const valueTokens = value
        .split(/[\/／,，、\s]+/u)
        .map((token) => toSearchToken(token))
        .filter((token) => token.length >= 2);
      return (
        sourceText.includes(normalizedValue) ||
        (valueTokens.length > 0 &&
          valueTokens.every((token) => sourceText.includes(token))) ||
        normalizedValue.includes(toSearchToken(source.title).slice(0, 8))
      );
    })
    .sort((a, b) => getClaimSourceRank(a) - getClaimSourceRank(b))
    .slice(0, 3)
    .map((source) => source.id);

  return {
    sourceIds,
    chunkIds: getChunkIdsForSources(sourceIds, manifest, value),
  };
}

function getChunkIdsForSources(
  sourceIds: string[],
  manifest: CompanySourceManifestEntry[],
  needle: string,
) {
  const normalizedNeedle = toSearchToken(needle).slice(0, 40);
  return sourceIds.flatMap((sourceId) => {
    const entry = manifest.find((item) => item.sourceId === sourceId);
    if (!entry) return [];
    const matchedChunk =
      entry.chunks.find((chunk) =>
        toSearchToken(chunk.text).includes(normalizedNeedle),
      ) ?? entry.chunks[0];
    return matchedChunk ? [matchedChunk.chunkId] : [];
  });
}

function getClaimConfidence(
  sourceIds: string[],
  sources: CompanyResearchSource[],
): CompanyClaim["confidence"] {
  if (sourceIds.length === 0) return "low";
  const supportingSources = sourceIds
    .map((sourceId) => sources.find((source) => source.id === sourceId))
    .filter((source): source is CompanyResearchSource => Boolean(source));
  if (
    supportingSources.some((source) =>
      ["company_database", "public_registry", "financial_disclosure"].includes(
        source.sourceType,
      ),
    ) ||
    supportingSources.some((source) => source.sourceTier === "primary")
  ) {
    return "high";
  }
  return "medium";
}

function getClaimSourceRank(source: CompanyResearchSource) {
  const rank: Record<CompanyResearchSource["sourceType"], number> = {
    financial_disclosure: 0,
    company_database: 1,
    official_site: 2,
    public_registry: 3,
    recruiting: 4,
    major_media: 5,
    user_memo: 6,
    url: 7,
    model_knowledge: 8,
  };
  return rank[source.sourceType] ?? 99;
}

function applySupportedClaimsToIdentity(
  identity: CompanyIdentitySummary,
  claims: CompanyClaim[],
): CompanyIdentitySummary {
  const valueFor = (claimType: CompanyClaim["claimType"], fallback: string) =>
    claims.find(
      (claim) =>
        claim.claimType === claimType &&
        claim.adopted &&
        claim.verification === "supported" &&
        claim.value,
    )?.value ?? fallback;

  return {
    ...identity,
    legalName: valueFor("legal_name", identity.legalName),
    corporateNumber: valueFor("corporate_number", identity.corporateNumber),
    headquarters: valueFor("headquarters", identity.headquarters),
    industryClassification: valueFor("industry", identity.industryClassification),
    officialWebsite: valueFor("official_website", identity.officialWebsite),
    securitiesCode: valueFor("securities_code", identity.securitiesCode),
    listingMarket: valueFor("listing_market", identity.listingMarket),
  };
}

function buildBusinessSummaryFromClaims(
  claims: CompanyClaim[],
  fallback: string[],
) {
  const claimTexts = claims
    .filter(
      (claim) =>
        claim.adopted &&
        claim.verification === "supported" &&
        claim.claimType === "business_summary" &&
        !looksLikeFinancialSummary(claim.text),
    )
    .map((claim) => cleanBusinessDisplayText(claim.text))
    .filter(Boolean);

  return (claimTexts.length > 0 ? [...new Set(claimTexts)] : fallback).slice(0, 3);
}

function buildEvidenceDigestFromClaims(
  claims: CompanyClaim[],
  sources: CompanyResearchSource[],
  fallback: CompanyEvidenceDigest[],
) {
  const cards = [
    createClaimEvidenceDigest("business_summary", claims, sources),
    createClaimEvidenceDigest("role_fit", claims, sources),
    createClaimEvidenceDigest("capital", claims, sources) ??
      createClaimEvidenceDigest("revenue", claims, sources) ??
      createClaimEvidenceDigest("employees", claims, sources),
  ].filter((item): item is CompanyEvidenceDigest => Boolean(item));

  return cards.length > 0 ? cards.slice(0, 4) : fallback;
}

function createClaimEvidenceDigest(
  claimType: CompanyClaim["claimType"],
  claims: CompanyClaim[],
  sources: CompanyResearchSource[],
): CompanyEvidenceDigest | null {
  const claim = claims.find(
    (item) =>
      item.claimType === claimType &&
      item.adopted &&
      item.verification === "supported" &&
      item.sourceIds.length > 0,
  );
  if (!claim) return null;

  const source = claim.sourceIds
    .map((sourceId) => sources.find((item) => item.id === sourceId))
    .find((item): item is CompanyResearchSource => Boolean(item));
  const category = getEvidenceCategoryForClaimSource(claimType, source);

  return {
    category,
    title: source?.title || claim.label,
    summary: cleanBusinessDisplayText(claim.text),
    sourceIds: claim.sourceIds,
    userRelevance:
      claimType === "role_fit"
        ? "職種理解と本人経験の接続に使います。"
        : claimType === "capital" ||
            claimType === "revenue" ||
            claimType === "employees"
          ? "企業規模を述べる場合の裏取りに使います。"
          : "志望理由の企業固有性を支える根拠として使います。",
    useRecommendation:
      claimType === "capital" || claimType === "revenue" || claimType === "employees"
        ? "use_with_caution"
        : "direct_use",
    riskNote:
      claimType === "capital" || claimType === "revenue" || claimType === "employees"
        ? "数値は年度・出典を併記してください。"
        : "ES本文では本人経験との接続まで書いてください。",
  };
}

function getEvidenceCategoryForClaimSource(
  claimType: CompanyClaim["claimType"],
  source?: CompanyResearchSource,
): CompanyEvidenceDigest["category"] {
  if (claimType === "capital" || claimType === "revenue" || claimType === "employees") {
    return "financial";
  }
  if (!source) return "unverified";
  if (source.sourceType === "public_registry" || source.sourceType === "company_database") {
    return "public_registry";
  }
  if (source.sourceType === "financial_disclosure") return "financial";
  if (source.sourceType === "major_media") return "major_media";
  if (source.sourceType === "user_memo") return "user_context";
  return "official_company";
}

function cleanBusinessDisplayText(text: string) {
  return text
    .replace(/^事業理解[:：]\s*/u, "")
    .replace(/^業種分類[:：]\s*/u, "")
    .replace(/\s+/gu, " ")
    .replace(/\s+([。、])/gu, "$1")
    .trim();
}

function formatIndustryClassification(value?: string) {
  if (!value) return "";

  const rawTerms = value
    .replace(/上場区分.*$/u, "")
    .split(/[\/／,，、|｜]/u)
    .map((term) => term.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .filter((term) => !/未確認|不明|確認中/u.test(term))
    .filter((term) => !/インターン|職種|募集|採用|志望|研究開発|IT戦略/u.test(term));

  const uniqueTerms = rawTerms.filter((term, index, terms) => {
    const normalized = term.replace(/\s+/gu, "");
    const hasMoreSpecificTerm = terms.some((other, otherIndex) => {
      if (index === otherIndex) return false;
      const otherNormalized = other.replace(/\s+/gu, "");
      return otherNormalized.length > normalized.length && otherNormalized.includes(normalized);
    });
    return !hasMoreSpecificTerm;
  });

  return [...new Set(uniqueTerms)].slice(0, 3).join("・");
}

function createFallbackSummary(
  applicationTarget: ApplicationTarget,
  sources: CompanyResearchSource[],
  facts: ExtractedFacts,
): SummaryDraft {
  const company = applicationTarget.companyName;
  const position = applicationTarget.position || "志望職種";
  const officialSource = pickBestSource(sources, ["official_site", "recruiting"]);
  const recruitingSource = pickBestSource(sources, ["recruiting"]);
  const financialSource = pickBestSource(sources, ["financial_disclosure"]);
  const publicSource = pickBestSource(sources, ["public_registry"]);
  const mainSource = officialSource ?? publicSource ?? financialSource ?? sources[0];
  const mainSummary = mainSource
    ? summarizeSourceForEs(mainSource)
    : "";
  const companyUnderstandingMemo =
    mainSource && mainSource.accessStatus !== "model_based"
      ? `${company}は、${mainSummary}。この情報を前提に、志望理由では「なぜこの企業か」と「自分の経験をどの課題に使うか」を同じ文脈で示す必要があります。`
      : `${company}について、確認済みの外部ソースが不足しています。公式会社概要、公的情報、IRまたは採用ページを追加してください。`;
  const businessSummary = [
    officialSource
      ? `${officialSource.title}では、${summarizeSourceForEs(officialSource)}。`
      : facts.identity.industryClassification
        ? `${company}は${facts.identity.industryClassification}に関わる企業として確認されています。`
        : `${company}の事業内容は、確認済みソースから整理してください。`,
  ];
  if (financialSource) {
    businessSummary.push(`${company}の財務・規模情報は財務情報欄で確認します。`);
  }

  const roleFitHypotheses = [
    recruitingSource
      ? `${position}では、採用ページの記述「${summarizeSourceForEs(recruitingSource).slice(0, 90)}」と本人経験を接続できるかが焦点です。`
      : `${position}では、本人の経験を${company}の事業課題や顧客価値に接続できているかを確認します。`,
  ];

  const esReviewFocus = [
    `志望理由が「${company}でなければならない理由」まで踏み込めているか`,
    `${position}で使う経験・技術・強みが、企業固有の事業や職種情報と同じ文脈で接続されているか`,
    "出典にない最近の動向、数字、職種内容を断定していないか",
  ];

  const evidenceDigest: CompanyEvidenceDigest[] = [
    officialSource,
    recruitingSource && recruitingSource.id !== officialSource?.id
      ? recruitingSource
      : null,
    financialSource,
    publicSource,
  ]
    .filter((source): source is CompanyResearchSource => Boolean(source))
    .map((source) => createFallbackEvidenceDigest(source));

  return {
    companyUnderstandingMemo,
    businessSummary,
    roleFitHypotheses,
    esReviewFocus,
    evidenceDigest,
    recentDevelopments: [],
  };
}

function pickBestSource(
  sources: CompanyResearchSource[],
  sourceTypes: CompanyResearchSource["sourceType"][],
) {
  return sources
    .filter(
      (source) =>
        sourceTypes.includes(source.sourceType) &&
        source.accessStatus !== "model_based" &&
        source.excerpt.trim().length > 0,
    )
    .sort((a, b) => getSourceSelectionScore(b) - getSourceSelectionScore(a))[0];
}

function summarizeSourceForEs(source: CompanyResearchSource) {
  const cleaned = cleanSourceSentence(source.excerpt);
  const sentence = firstUsefulSentence(cleaned);
  return sentence || source.title;
}

function firstUsefulSentence(text: string) {
  const sentences = text
    .split(/(?<=[。.!?！？])\s*/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 18);

  return (sentences[0] ?? text).slice(0, 180);
}

function cleanSourceSentence(text: string) {
  return stripMarkdownLinks(text)
    .replace(/\s+/gu, " ")
    .replace(/[\u200b-\u200d\ufeff]/gu, "")
    .replace(/Copyright.*$/iu, "")
    .trim();
}

function createFallbackEvidenceDigest(
  source: CompanyResearchSource,
): CompanyEvidenceDigest {
  const category =
    source.sourceType === "financial_disclosure"
      ? "financial"
      : source.sourceType === "public_registry" ||
          source.sourceType === "company_database"
        ? "public_registry"
        : source.sourceType === "major_media"
          ? "major_media"
          : source.sourceType === "user_memo"
            ? "user_context"
            : "official_company";

  return {
    category,
    title: source.title,
    summary: summarizeSourceForEs(source),
    sourceIds: [source.id],
    userRelevance:
      source.sourceType === "recruiting"
        ? "職種理解と本人経験の接続に使います。"
        : source.sourceType === "financial_disclosure"
          ? "企業規模や事業の安定性を述べる場合の裏取りに使います。"
          : "志望理由の企業固有性を支える根拠として使います。",
    useRecommendation:
      source.sourceTier === "primary" || source.sourceTier === "public"
        ? "direct_use"
        : "background_only",
    riskNote:
      source.sourceType === "major_media"
        ? "メディア情報は背景理解に留め、公式発表と照合してください。"
        : "",
  };
}

function getSourceSelectionScore(
  source: Pick<
    CompanyResearchSource,
    "id" | "title" | "url" | "sourceTier" | "sourceType" | "excerpt"
  >,
) {
  const text = `${source.id} ${source.title} ${source.url ?? ""}`.toLowerCase();
  const domain = getDomain(source.url ?? "");
  const excerpt = source.excerpt;
  let score = 0;

  if (isKnownGlobalOfficialDomain(domain)) score += 160;
  if (isNikkeiCompanyProfileUrl(source.url)) score += 140;
  if (isTrustedCompanyInfoDomain(domain)) score += 90;
  if (source.sourceType === "company_database") score += 70;
  if (source.id.includes("official") || source.id.includes("company")) score += 40;
  if (source.sourceTier === "primary") score += 30;
  if (source.sourceTier === "public") score += 24;
  if (source.sourceType === "recruiting") score += 18;
  if (source.sourceType === "financial_disclosure") score += 14;
  if (/会社概要|企業データ|会社情報|企業情報|corporate|outline|overview|about/u.test(text)) {
    score += 60;
  }
  if (/\/prof\/outline|\/company|\/corporate|\/about|outline|overview/u.test(text)) {
    score += 35;
  }
  if (/採用|recruit|職種|仕事紹介/u.test(text)) score += 22;
  if (/ir|有価証券報告書|統合報告|決算|financial/u.test(text)) score += 16;
  if (/お知らせ|ニュース一覧|press|release|\/news|\/topics|20[0-9]{2}年/u.test(text)) {
    score -= 55;
  }
  if (/問い合わせ|お問い合わせ|contact|inquiry|privacy|プライバシー|個人情報/u.test(text)) {
    score -= 85;
  }
  if (looksLikeNavigationExcerpt(excerpt)) score -= 45;

  return score;
}

function looksLikeNavigationExcerpt(value: string) {
  const text = value.slice(0, 500);
  const navSignals = [
    "FAQ",
    "お問い合わせ",
    "サイト内検索",
    "トップページへ",
    "English",
    "menu",
    "mypage",
  ].filter((signal) => text.includes(signal)).length;
  const repeatedCompanyInfo = (text.match(/企業情報/gu) ?? []).length;
  return navSignals >= 3 || repeatedCompanyInfo >= 3;
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
  if (
    facts.identity.entityKind !== "外資系企業" &&
    !sources.some((source) => source.sourceTier === "public")
  ) {
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
    excerpt: selectSourceExcerpt(page).slice(0, 1600),
  };
}

function createCandidate(
  url: string,
  title: string,
  id: string,
  applicationTarget: ApplicationTarget,
  reason: string,
  isUserSpecified = false,
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
    isUserSpecified,
  };
}

function classifySourceType(
  url: string,
  text: string,
): CompanyResearchSource["sourceType"] {
  const domain = getDomain(url);
  const normalizedText = text.toLowerCase();

  if (isNikkeiCompanyProfileUrl(url)) {
    return "company_database";
  }

  if (isKnownGlobalOfficialDomain(domain)) {
    return isRecruitingPath(url) ? "recruiting" : "official_site";
  }

  if (isMajorMediaDomain(domain)) {
    return "major_media";
  }

  if (
    [
      "houjin-bangou.nta.go.jp",
      "info.gbiz.go.jp",
      "gbiz.go.jp",
      "trial.info.gbiz.go.jp",
      "meti.go.jp",
      "edinet-fsa.go.jp",
      "disclosure2.edinet-fsa.go.jp",
      "fsa.go.jp",
      "houjin.info",
      "companyinformation.jp",
      "cnavi.g-search.or.jp",
      "corp-japan.com",
      "companydata.tsujigawa.com",
      "corporation.teraren.com",
    ].some((publicDomain) => domain.endsWith(publicDomain)) ||
    /\/company\/[0-9]{13}(?:\/|$)/u.test(url)
  ) {
    return "public_registry";
  }
  if (
    [
      "irbank.net",
      "kabutan.jp",
      "finance.yahoo.co.jp",
      "tdnet.info",
      "edinetdb.com",
      "j-lic.com",
    ].some((financialDomain) => domain.endsWith(financialDomain)) ||
    /\/ir(?:\/|$)|\/investor|annual|integrated-report|securities-report|financial/u.test(
      url.toLowerCase(),
    ) ||
    /統合報告|決算|有価証券/u.test(text.slice(0, 180))
  ) {
    return "financial_disclosure";
  }
  if (
    /会社概要|企業情報|about|company profile|corporate|会社情報/u.test(
      normalizedText,
    ) &&
    !isRecruitingPath(url) &&
    !isThirdPartyFinancialDomain(domain) &&
    !isThirdPartyCompanyInfoDomain(domain) &&
    !isKnownLowQualityDomain(domain)
  ) {
    return "official_site";
  }
  if (
    /recruit|career|採用|募集|新卒/u.test(`${url} ${text.slice(0, 180)}`) &&
    !isRecruitingOrAggregatorUrl(url)
  ) {
    return "recruiting";
  }
  if (
    /公式/u.test(normalizedText) &&
    !isRecruitingPath(url) &&
    !isThirdPartyCompanyInfoDomain(domain) &&
    !isKnownLowQualityDomain(domain)
  ) {
    return "official_site";
  }
  return "url";
}

function classifySourceTier(
  url: string,
  sourceType: CompanyResearchSource["sourceType"],
): CompanyResearchSource["sourceTier"] {
  const domain = getDomain(url);
  if (sourceType === "company_database") {
    return "public";
  }
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
    "askai.glarity.app",
    "glarity.app",
    "jobcatalog.yahoo.co.jp",
    "rbbtoday.com",
    "shukatsu-career.co.jp",
    "shukatsusoken.com",
    "asuka-plan.com",
    "corporate-inst.asuka-plan.com",
    "note.com",
    "qiita.com",
    "zenn.dev",
  ].some((blocked) => lower.includes(blocked));
}

function isPageAboutTargetCompany(
  page: VerifiedPage,
  applicationTarget: ApplicationTarget,
) {
  if (isGenericInstitutionalSource(page)) return false;
  if (isKnownLowQualityDomain(getDomain(page.url))) return false;
  if (looksLikeForbiddenRelatedCompany(page, applicationTarget)) return false;
  if (
    page.sourceType === "public_registry" &&
    !isExactCorporateIdentityPage(page, applicationTarget)
  ) {
    return false;
  }
  const text = `${page.title} ${page.url} ${page.excerpt}`;
  const pageDomain = getDomain(page.url);
  if (isNikkeiCompanyProfileUrl(page.url) && containsCompanyToken(text, applicationTarget.companyName)) {
    return true;
  }
  if (isKnownGlobalOfficialDomain(pageDomain)) {
    if (
      pageDomain !== "goldmansachs.com" &&
      looksLikeDifferentAliasEntity(text, applicationTarget.companyName)
    ) {
      return false;
    }
    return true;
  }
  if (looksLikeDifferentJapaneseEntity(page.title, applicationTarget.companyName)) {
    return false;
  }
  if (looksLikeDifferentAliasEntity(text, applicationTarget.companyName)) {
    return false;
  }
  if (containsCompanyToken(text, applicationTarget.companyName)) return true;
  const domain = getDomain(page.url).replace(/[-.]/g, "");
  return getCompanyNameTokens(applicationTarget.companyName).some((token) => {
    const normalizedToken = toSearchToken(token);
    return (
      domain.includes(normalizedToken) ||
      toSearchToken(text).includes(normalizedToken)
    );
  });
}

function looksLikeForbiddenRelatedCompany(
  page: VerifiedPage,
  applicationTarget: ApplicationTarget,
) {
  const target = toSearchToken(applicationTarget.companyName);
  const text = toSearchToken(`${page.title} ${page.url} ${page.excerpt.slice(0, 1200)}`);

  if (
    /東京エレクトロン|tokyoelectron/u.test(target) &&
    /エレクトロンデバイス|tokyoelectrondevice|electrondevice|tedcorp/u.test(text)
  ) {
    return true;
  }

  if (
    /東京エレクトロン|tokyoelectron/u.test(target) &&
    /ハンドドライヤ|エアータオル|handdryer|airtowel/u.test(text)
  ) {
    return true;
  }

  return false;
}

function isInconsistentOfficialDomain(
  page: VerifiedPage,
  applicationTarget: ApplicationTarget,
) {
  if (page.isUserSpecified) return false;
  if (!["official_site", "recruiting"].includes(page.sourceType)) return false;
  const canonicalDomains = getCanonicalOfficialDomains(applicationTarget);
  if (canonicalDomains.length === 0) return false;
  const pageDomain = getDomain(page.url);
  if (!pageDomain) return false;
  return !canonicalDomains.some((canonicalDomain) =>
    isSameOrSubdomain(pageDomain, canonicalDomain),
  );
}

function isExactCorporateIdentityPage(
  page: VerifiedPage,
  applicationTarget: ApplicationTarget,
) {
  const sourceText = `${page.title} ${page.excerpt}`;
  const legalName = extractLegalName(sourceText);
  if (legalName) {
    return isCompatibleLegalEntityName(legalName, applicationTarget.companyName);
  }
  const target = toSearchToken(applicationTarget.companyName);
  const compactText = toSearchToken(sourceText);
  if (compactText.includes(target) && !looksLikeDifferentJapaneseEntity(sourceText, applicationTarget.companyName)) {
    return true;
  }
  return false;
}

function isCompatibleLegalEntityName(legalName: string, companyName: string) {
  if (!containsCompanyToken(legalName, companyName)) return false;
  return (
    !looksLikeDifferentJapaneseEntity(legalName, companyName) &&
    !looksLikeDifferentAliasEntity(legalName, companyName)
  );
}

function extractLegalName(text: string) {
  const nikkeiOfficialName = text.match(/正式社名\s*([^ ]{2,40})/u)?.[1];
  if (nikkeiOfficialName) return cleanCompanyName(nikkeiOfficialName);
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
  const labeledValue = cleanHeadquarters(
    extractValueAfterLabels(text, ["本社所在地", "本社住所", "所在地", "住所", "本社"], [
      "地図",
      "TEL",
      "Tel",
      "電話",
      "創業",
      "設立",
      "代表者",
      "主要事業",
      "資本金",
      "従業員",
    ]),
  );
  if (isPlausibleJapaneseAddress(labeledValue)) return labeledValue;

  const addressMatch = text.match(
    /(北海道|東京都|大阪府|京都府|(?:.{2,3}県))[一-龯ぁ-んァ-ヶー0-9０-９一二三四五六七八九十丁目番地号\-－ーの\s]{6,80}/u,
  );
  if (!addressMatch?.[0]) return "";

  const contextBefore = text.slice(
    Math.max(0, (addressMatch.index ?? 0) - 40),
    addressMatch.index ?? 0,
  );
  if (!/(本社|所在地|住所|本店|本部)/u.test(contextBefore)) return "";
  return cleanHeadquarters(addressMatch[0]);
}

function extractIndustry(text: string) {
  const nikkeiIndustry = text.match(/日経業種分類\s*([^ ]{2,40})/u)?.[1];
  const tseIndustry = text.match(/東証業種名\s*([^ ]{2,40})/u)?.[1];
  if (nikkeiIndustry || tseIndustry) {
    return cleanIndustryClassification(
      [nikkeiIndustry, tseIndustry].filter(Boolean).join(" / "),
    );
  }
  return cleanIndustryClassification(
    extractValueAfterLabels(text, ["業種", "業種分類", "事業内容", "主要事業"], [
      "更新日",
      "基本情報",
      "資本金",
      "従業員",
      "所在地",
      "本社",
      "代表者",
      "設立",
    ]),
  );
}

function extractCorporateNumber(text: string) {
  const match = text.match(/法人番号\s*([0-9]{13})/u);
  return match?.[1] ?? "";
}

function pickCorporateNumber(
  pages: VerifiedPage[],
  applicationTarget: ApplicationTarget,
  headquarters: string,
  securitiesCode: string,
) {
  const candidates = pages
    .map((page) => ({
      value: extractCorporateNumber(`${page.title} ${page.excerpt}`),
      page,
      score: scoreCorporateNumberCandidate(
        page,
        applicationTarget,
        headquarters,
        securitiesCode,
      ),
    }))
    .filter((item) => isKnownValue(item.value))
    .filter((item) => item.score >= 170)
    .sort((a, b) => b.score - a.score);

  return normalizeKnownText(candidates[0]?.value ?? "");
}

function scoreCorporateNumberCandidate(
  page: VerifiedPage,
  applicationTarget: ApplicationTarget,
  headquarters: string,
  securitiesCode: string,
) {
  const text = `${page.title} ${page.url} ${page.excerpt}`;
  let score = getSourceSelectionScore(page);
  if (page.id === "user-provided-corporate-number") score += 260;
  if (containsCompanyToken(text, applicationTarget.companyName)) score += 30;
  if (!isExactCorporateIdentityPage(page, applicationTarget)) score -= 180;
  if (headquarters && addressTokensMatch(text, headquarters)) score += 140;
  if (securitiesCode && text.includes(securitiesCode)) score += 40;
  if (page.sourceType === "public_registry") score += 30;
  if (getDomain(page.url).endsWith("companyinformation.jp")) score += 20;
  return score;
}

function addressTokensMatch(text: string, address: string) {
  const normalizedText = toSearchToken(text);
  const normalizedAddress = toSearchToken(address);
  if (normalizedAddress.length >= 12 && normalizedText.includes(normalizedAddress)) {
    return true;
  }
  const prefectureCity = address.match(
    /(北海道|東京都|大阪府|京都府|(?:.{2,3}県))[一-龯ぁ-んァ-ヶー]{1,12}[市区町村]/u,
  )?.[0];
  return Boolean(prefectureCity && normalizedText.includes(toSearchToken(prefectureCity)));
}

function extractOfficialWebsite(text: string) {
  const match = text.match(/URL\s*(https?:\/\/[^\s]+|www\.[^\s]+)/iu);
  if (!match?.[1]) return "";
  const value = match[1].startsWith("www.") ? `https://${match[1]}` : match[1];
  return normalizeSourceUrl(value);
}

function extractSecuritiesCode(text: string) {
  const titleMatch = text.match(/\[([0-9]{4})\]企業概要/u);
  if (titleMatch?.[1]) return titleMatch[1];
  const parenthesizedCode = text.match(/[（(]([0-9]{4})[）)](?:の| |　)?(?:有価証券報告書|決算|株価|企業概要|会社情報)/u);
  if (parenthesizedCode?.[1]) return parenthesizedCode[1];
  const match = text.match(/(?:証券コード|銘柄コード|証券番号)\s*([0-9]{4})/u);
  return match?.[1] ?? "";
}

function findSecuritiesCodeInPages(pages: VerifiedPage[]) {
  return normalizeKnownText(
    pages
      .map((page) => extractSecuritiesCode(`${page.title} ${page.url} ${page.excerpt}`))
      .find(isKnownValue) ?? "",
  );
}

function extractListingMarket(text: string) {
  const nikkeiMarket = text.match(/上場市場名\s*([^ ]{4,80}?市場)(?:\s|$)/u)?.[1];
  if (nikkeiMarket) return cleanListingMarket(nikkeiMarket);
  if (/上場区分\s*東証上場/u.test(text)) return "東京証券取引所";
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

function cleanListingMarket(value: string) {
  return cleanExtractedValue(value)
    .replace(/\s*(株主総会日|従業員数|平均年齢).*$/u, "")
    .trim();
}

function createFinancialHighlights(pages: VerifiedPage[]) {
  const highlights: CompanyFinancialHighlight[] = [];
  for (const page of pages) {
    if (page.sourceTier === "secondary") continue;
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
  if (!isPlausibleFinancialValue(label, cleaned)) return;
  if (highlights.some((item) => item.label === label)) return;
  highlights.push({
    label,
    value: cleaned,
    period: "",
    sourceId,
    confidence: "high",
  });
}

function isPlausibleFinancialValue(label: string, value: string) {
  if (label === "従業員数") return /[0-9０-９,，]+名|[0-9０-９,，]+人/u.test(value);
  if (label === "資本金") return /[0-9０-９,，.]+.*(?:円|百万円|億円|万円)/u.test(value);
  if (label === "売上高") {
    return (
      /[0-9０-９,，.]+.*(?:円|百万円|億円|万円)/u.test(value) &&
      !/倍|成長率|分析|最高/u.test(value)
    );
  }
  return true;
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
    company_database: "日経会社情報",
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
  if (sourceType === "company_database") return ["identitySummary", "financialHighlights"];
  if (sourceType === "public_registry") return ["identitySummary"];
  if (sourceType === "financial_disclosure") {
    return ["financialHighlights", "evidenceDigest"];
  }
  if (sourceType === "major_media") return ["recentDevelopments"];
  if (sourceType === "recruiting") return ["roleFitHypotheses", "esReviewFocus"];
  return ["companyUnderstandingMemo", "businessSummary", "evidenceDigest"];
}

function selectSourceExcerpt(page: VerifiedPage) {
  const anchors =
    page.sourceType === "company_database"
      ? [
          "会社概要 正式社名",
          "正式社名",
          "本社住所",
          "日経業種分類",
          "上場市場名",
        ]
      : page.sourceType === "recruiting"
        ? [
            "数理（情報）系",
            "建設プロジェクトや企業経営",
            "サービス・システム",
            "研究開発",
            "職務内容",
            "募集要項",
          ]
        : page.sourceType === "financial_disclosure"
          ? ["資本金", "売上高", "統合報告", "有価証券報告書"]
          : ["会社概要", "企業データ", "企業情報", "事業内容"];
  const index = anchors
    .map((anchor) => page.excerpt.indexOf(anchor))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b)[0];
  if (index === undefined) return page.excerpt;
  return page.excerpt.slice(Math.max(0, index - 160), index + 1800);
}

function createSourceCoverage(
  sources: CompanyResearchSource[],
): CompanyResearchResponse["sourceCoverage"] {
  return {
    publicRegistry: sources.filter(
      (source) =>
        source.sourceType === "public_registry" ||
        source.sourceType === "company_database",
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
    company_database: 0,
    official_site: 1,
    financial_disclosure: 2,
    public_registry: 3,
    recruiting: 4,
    major_media: 5,
    user_memo: 6,
    url: 7,
    model_knowledge: 8,
  };

  return [...sources].sort((a, b) => {
    const priorityDiff = priority[a.sourceType] - priority[b.sourceType];
    if (priorityDiff !== 0) return priorityDiff;
    const selectionDiff = getSourceSelectionScore(b) - getSourceSelectionScore(a);
    if (selectionDiff !== 0) return selectionDiff;
    return a.title.localeCompare(b.title, "ja");
  });
}

function applyVerifiedSourcePolicy(pages: VerifiedPage[]) {
  const sorted = [...pages].sort(
    (a, b) => getSourceSelectionScore(b) - getSourceSelectionScore(a),
  );
  const picked: VerifiedPage[] = [];
  const counts = new Map<CompanyResearchSource["sourceType"], number>();

  for (const page of sorted) {
    if (picked.length >= maxVerifiedSources) break;
    if (shouldDropByStrictSourcePolicy(page)) continue;
    const cap = sourceTypeCaps[page.sourceType] ?? 1;
    const current = counts.get(page.sourceType) ?? 0;
    if (current >= cap) continue;
    picked.push(page);
    counts.set(page.sourceType, current + 1);
  }

  return picked;
}

function shouldDropByStrictSourcePolicy(page: VerifiedPage) {
  if (isTrustedCompanyInfoDomain(getDomain(page.url))) return false;
  const score = getSourceSelectionScore(page);
  if (page.sourceType === "major_media") return score < 20;
  if (page.sourceType === "url") return score < 10;
  if (
    page.sourceType === "financial_disclosure" &&
    /faq|request|contact|inquiry|support|\/news|\/press|release|お問い合わせ|よくあるご質問/u.test(
      `${page.title} ${page.url}`,
    )
  ) {
    return true;
  }
  if (
    page.sourceType === "official_site" &&
    /contact|inquiry|privacy|お問い合わせ|お問合せ|個人情報/u.test(
      `${page.title} ${page.url}`,
    )
  ) {
    return true;
  }
  if (page.sourceType === "official_site" && /お知らせ|ニュース一覧|\/news/u.test(`${page.title} ${page.url}`)) {
    return true;
  }
  return false;
}

function formatReferenceUrlsForPrompt(applicationTarget: ApplicationTarget) {
  const urls = applicationTarget.referenceUrls
    .filter((source) => source.url?.trim())
    .map((source) => `- ${source.title || source.id}: ${source.url}`);
  return urls.length > 0 ? urls.join("\n") : "- 指定なし";
}

function dedupeCandidates(candidates: SourceCandidate[]) {
  const seen = new Set<string>();
  const deduped: SourceCandidate[] = [];

  for (const candidate of candidates) {
    if (!candidate.url || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    deduped.push(candidate);
  }

  return deduped;
}

function sortCandidateSources(candidates: SourceCandidate[]) {
  const priority: Record<CompanyResearchSource["sourceType"], number> = {
    company_database: 0,
    official_site: 1,
    financial_disclosure: 2,
    public_registry: 3,
    recruiting: 4,
    major_media: 5,
    user_memo: 6,
    url: 7,
    model_knowledge: 8,
  };

  return [...candidates].sort((a, b) => {
    const userSpecifiedDiff = Number(b.isUserSpecified) - Number(a.isUserSpecified);
    if (userSpecifiedDiff !== 0) return userSpecifiedDiff;

    const priorityDiff = priority[a.sourceType] - priority[b.sourceType];
    if (priorityDiff !== 0) return priorityDiff;

    const trustedDiff =
      Number(isTrustedCompanyInfoDomain(getDomain(b.url))) -
      Number(isTrustedCompanyInfoDomain(getDomain(a.url)));
    if (trustedDiff !== 0) return trustedDiff;

    const lowQualityDiff =
      Number(isKnownLowQualityDomain(getDomain(a.url))) -
      Number(isKnownLowQualityDomain(getDomain(b.url)));
    if (lowQualityDiff !== 0) return lowQualityDiff;

    return a.url.localeCompare(b.url);
  });
}

function isTrustedCompanyInfoDomain(domain: string) {
  return trustedCompanyInfoServices.some((trustedDomain) =>
    domain.endsWith(trustedDomain),
  );
}

function getCanonicalOfficialDomains(applicationTarget: ApplicationTarget) {
  const fromReferences = applicationTarget.referenceUrls
    .map((source) => getDomain(source.url ?? ""))
    .filter((domain) => domain && isLikelyOfficialReferenceDomain(domain));
  const fromKnownProfiles = getKnownListedCompanyUrls(applicationTarget)
    .map((item) => getDomain(item.url))
    .filter((domain) => domain && isLikelyOfficialReferenceDomain(domain));

  return [...new Set([...fromReferences, ...fromKnownProfiles])];
}

function isLikelyOfficialReferenceDomain(domain: string) {
  if (!domain) return false;
  if (isTrustedCompanyInfoDomain(domain)) return false;
  if (isMajorMediaDomain(domain)) return false;
  if (isPublicDisclosureDomain(domain)) return false;
  if (isThirdPartyCompanyInfoDomain(domain)) return false;
  if (isThirdPartyFinancialDomain(domain)) return false;
  if (isKnownLowQualityDomain(domain)) return false;
  return true;
}

function isNikkeiCompanyProfileUrl(url?: string) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.endsWith("nikkei.com") &&
      parsed.pathname.startsWith("/nkd/company/") &&
      parsed.searchParams.has("scode")
    );
  } catch {
    return false;
  }
}

function isMajorMediaDomain(domain: string) {
  return majorMediaDomains.some((mediaDomain) => domain.endsWith(mediaDomain));
}

function dedupeVerifiedPages(pages: VerifiedPage[]) {
  const pageMap = new Map<string, VerifiedPage>();

  for (const page of pages.filter((item) => item.url)) {
    const key = getVerifiedPageDedupeKey(page);
    const previous = pageMap.get(key);
    if (!previous || getSourceSelectionScore(page) > getSourceSelectionScore(previous)) {
      pageMap.set(key, page);
    }
  }

  return [...pageMap.values()];
}

function getVerifiedPageDedupeKey(page: VerifiedPage) {
  if (isNikkeiCompanyProfileUrl(page.url)) return page.url.replace(/\/$/u, "");
  try {
    const parsed = new URL(page.url);
    if (["official_site", "financial_disclosure", "recruiting"].includes(page.sourceType)) {
      parsed.search = "";
      parsed.hash = "";
    }
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return page.url.replace(/\/$/u, "");
  }
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

function normalizeEvidenceCategoryForSources(
  value: unknown,
  sourceIds: string[] | undefined,
  sources: CompanyResearchSource[],
): CompanyEvidenceDigest["category"] {
  const sourceTypes = (sourceIds ?? [])
    .map((id) => sources.find((source) => source.id === id)?.sourceType)
    .filter(Boolean);

  if (sourceTypes.length > 0) {
    if (sourceTypes.every((type) => type === "public_registry")) {
      return "public_registry";
    }
    if (sourceTypes.every((type) => type === "financial_disclosure")) {
      return "financial";
    }
    if (sourceTypes.every((type) => type === "major_media")) {
      return "major_media";
    }
    if (sourceTypes.every((type) => type === "user_memo")) {
      return "user_context";
    }
    if (
      sourceTypes.some((type) => type === "official_site" || type === "recruiting")
    ) {
      return "official_company";
    }
  }

  return normalizeEvidenceCategory(value);
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
    "company_database",
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

function isGroundedRecentDevelopment(
  item: CompanyRecentDevelopment,
  source: CompanyResearchSource,
) {
  const title = stripMarkdownLinks(String(item.title ?? "")).trim();
  const summary = stripMarkdownLinks(String(item.summary ?? "")).trim();
  if (!title || !summary) return false;

  const sourceText = `${source.title} ${source.excerpt}`.replace(/\s+/gu, " ");
  const titleTokens = getMeaningfulJapaneseTokens(title);
  const hasTitleEvidence = titleTokens.some((token) => sourceText.includes(token));
  if (!hasTitleEvidence) return false;

  const date = stripMarkdownLinks(String(item.date ?? "")).trim();
  if (!date) return true;

  const compactDate = date.replace(/-/gu, "");
  return sourceText.includes(date) || sourceText.replace(/[年月日/\s]/gu, "").includes(compactDate);
}

function getMeaningfulJapaneseTokens(value: string) {
  return value
    .split(/[\s　、。・,，:：／/「」『』()（）【】\-ー]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 6);
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
    "houjin-bangou.nta.go.jp",
    "info.gbiz.go.jp",
    "gbiz.go.jp",
    "trial.info.gbiz.go.jp",
  ].some((publicDomain) => domain.endsWith(publicDomain));
}

function isThirdPartyFinancialDomain(domain: string) {
  return [
    "irbank.net",
    "kabutan.jp",
    "finance.yahoo.co.jp",
    "tdnet.info",
    "edinetdb.com",
    "j-lic.com",
  ].some((financialDomain) => domain.endsWith(financialDomain));
}

function isThirdPartyCompanyInfoDomain(domain: string) {
  return [
    "enehub.jp",
    "corporation.teraren.com",
    "houjin.jp",
    "houjin.info",
    "companyinformation.jp",
    "companydata.tsujigawa.com",
    "cnavi.g-search.or.jp",
  ].some((companyInfoDomain) => domain.endsWith(companyInfoDomain));
}

function isKnownGlobalOfficialDomain(domain: string) {
  return [
    "goldmansachs.com",
    "gs.com",
    "morganstanley.com",
    "jpmorgan.com",
    "mckinsey.com",
    "bcg.com",
    "bain.com",
  ].some((officialDomain) => domain.endsWith(officialDomain));
}

function isForeignCompanyMode(applicationTarget: ApplicationTarget) {
  if (applicationTarget.companyScope === "foreign") return true;
  if (applicationTarget.companyScope === "domestic") return false;
  const normalizedCompany = toSearchToken(applicationTarget.companyName);
  const normalizedIndustry = toSearchToken(applicationTarget.industry);
  return (
    getKnownCompanyAliases(applicationTarget.companyName).length > 0 ||
    /外資|グローバル|投資銀行|コンサル|foreign|global/u.test(
      `${normalizedCompany} ${normalizedIndustry}`,
    )
  );
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
    "shukatsu-career.co.jp",
  ].some((blockedDomain) => domain.endsWith(blockedDomain));
}

function isRecruitingPath(url: string) {
  const lower = url.toLowerCase();
  return /(?:^|[./_-])(career|careers|recruit|recruiting|saiyo)(?:[./_-]|$)|採用/u.test(
    lower,
  );
}

function isKnownLowQualityDomain(domain: string) {
  return [
    "askai.glarity.app",
    "glarity.app",
    "wikipedia.org",
    "onecareer.jp",
    "openwork.jp",
    "vorkers.com",
    "wantedly.com",
    "jobcatalog.yahoo.co.jp",
    "rbbtoday.com",
    "shukatsu-career.co.jp",
    "shukatsusoken.com",
    "asuka-plan.com",
    "corporate-inst.asuka-plan.com",
    "note.com",
    "qiita.com",
    "zenn.dev",
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

function looksLikeDifferentJapaneseEntity(text: string, companyName: string) {
  const target = toSearchToken(stripCompanySuffix(companyName));
  if (!target || target.length < 3 || !/[一-龯ぁ-んァ-ヶ]/u.test(companyName)) {
    return false;
  }

  const compact = toSearchToken(text);
  const index = compact.indexOf(target);
  if (index < 0) return false;

  let suffix = compact.slice(index + target.length);
  if (!suffix) return false;

  suffix = suffix.replace(
    /^(株式会社|有限会社|合同会社|合名会社|合資会社|inc|corporation|corp|ltd|coltd)/iu,
    "",
  );
  if (!suffix) return false;

  if (/^(について|とは|会社|企業|公式|採用|会社概要|企業情報|日本|japan|ホーム|トップ|サイト)/iu.test(suffix)) {
    return false;
  }
  if (/^ジャパン(株式会社|合同会社|有限会社|会社|公式|採用|会社概要|企業情報|$)/u.test(suffix)) {
    return false;
  }
  return true;
}

function looksLikeDifferentAliasEntity(text: string, companyName: string) {
  const aliases = getKnownCompanyAliases(companyName)
    .map((alias) => toSearchToken(alias))
    .filter((alias) => /^[a-z0-9]+$/iu.test(alias) && alias.length >= 5);
  if (aliases.length === 0) return false;

  const compact = toSearchToken(text);
  return aliases.some((alias) => {
    const index = compact.indexOf(alias);
    if (index < 0) return false;
    const suffix = compact.slice(index + alias.length);
    if (!suffix) return false;
    if (/^(japan|global|careers|career|official|home|about|worldwide|group|cojp|com|日本)/iu.test(suffix)) {
      return false;
    }
    return /^(assetmanagement|japanservices|energy|securities|am|bank|trust|realty|capitalpartners)/iu.test(suffix);
  });
}

function getCompanyNameTokens(companyName: string) {
  const base = stripCompanySuffix(companyName);
  const tokens = [companyName, base, ...getKnownCompanyAliases(companyName)]
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  return [...new Set(tokens)];
}

function getKnownCompanyAliases(companyName: string) {
  const normalized = toSearchToken(companyName);
  if (normalized.includes("ゴルドマンサックス") || normalized.includes("goldmansachs")) {
    return ["Goldman Sachs", "GoldmanSachs", "goldmansachs"];
  }
  if (normalized.includes("モルガンスタンレ") || normalized.includes("morganstanley")) {
    return ["Morgan Stanley", "MorganStanley"];
  }
  if (
    normalized.includes("ジェピモルガン") ||
    normalized.includes("jpモルガン") ||
    normalized.includes("jpmorgan")
  ) {
    return ["J.P. Morgan", "JPMorgan", "JP Morgan"];
  }
  if (normalized.includes("マッキンゼ") || normalized.includes("mckinsey")) {
    return ["McKinsey", "McKinsey & Company"];
  }
  if (
    normalized.includes("ボストンコンサルティンググルプ") ||
    normalized.includes("bcg")
  ) {
    return ["Boston Consulting Group", "BCG"];
  }
  if (normalized.includes("ベインアンドカンパニ") || normalized.includes("bain")) {
    return ["Bain & Company", "Bain"];
  }
  return [];
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
    .replace(/[・･.,，、。/／\-－ー―_()[\]（）「」『』:：]/g, "");
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
  if (
    /有料会員|料金プラン|お申し込み|取引銀行|ご注意|QUICK|株価/u.test(cleaned)
  ) {
    return "";
  }
  const japanesePart = cleaned.split(/\s+(?=[A-Z][A-Za-z])/u)[0] ?? cleaned;
  const match = japanesePart.match(
    /(?:[一-龯ぁ-んァ-ヶーA-Za-z0-9・＆&]+\s*){1,8}(?:株式会社|有限会社|合同会社|Corporation|Inc\.?|Ltd\.?)/u,
  );
  return cleanExtractedValue(match?.[0] ?? cleaned);
}

function cleanHeadquarters(value: string) {
  const cleaned = cleanExtractedValue(value)
    .replace(/\s*(tel|TEL|電話).*$/u, "")
    .replace(/\s*(創業|設立|代表者|資本金|従業員).*$/u, "")
    .replace(/\s*地図.*$/u, "")
    .trim();
  return isPlausibleJapaneseAddress(cleaned) ? cleaned.slice(0, 80) : "";
}

function isPlausibleJapaneseAddress(value: string) {
  return (
    value.length >= 8 &&
    value.length <= 90 &&
    /(北海道|東京都|大阪府|京都府|.{2,3}県)/u.test(value) &&
    !/[。！？]/u.test(value)
  );
}

function cleanIndustryClassification(value: string) {
  const cleaned = cleanExtractedValue(value)
    .replace(/^は/u, "")
    .replace(/\s*(上場区分|更新日|基本情報|企業名|法人番号).*$/u, "")
    .replace(/です[。．]?.*$/u, "")
    .replace(/\s*[0-9０-９]{4}年.*$/u, "")
    .trim();
  if (!cleaned || cleaned.length > 80) return "";
  if (
    /資本金|売上高|純利益|本社|法人番号|地図|お知らせ|FAQ|お問い合わせ|サイト内検索|実績一覧|更新/u.test(
      cleaned,
    )
  ) {
    return "";
  }
  if (!/(建設|金融|銀行|商社|製造|情報|通信|不動産|小売|サービス|機械|電気|化学|医薬|食品|運輸|保険|証券|メディア|広告|コンサル|エネルギー|業)/u.test(cleaned)) {
    return "";
  }
  return cleaned;
}

function isCleanIndustryClassification(value: string) {
  return Boolean(cleanIndustryClassification(value));
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

function extractResponseSourceUrls(response: OpenAI.Responses.Response) {
  const urls: string[] = [];

  for (const item of response.output ?? []) {
    if (item.type === "web_search_call") {
      const sources =
        (
          item as {
            action?: { sources?: Array<{ url?: string }> };
          }
        ).action?.sources ?? [];
      urls.push(...sources.map((source) => source.url ?? ""));
    }

    if (item.type === "message") {
      for (const content of item.content ?? []) {
        if (content.type !== "output_text") continue;
        urls.push(
          ...content.annotations
            .filter((annotation) => annotation.type === "url_citation")
            .map((annotation) => annotation.url),
        );
      }
    }
  }

  return urls.filter(Boolean);
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
}

function isSameOrSubdomain(domain: string, canonicalDomain: string) {
  return (
    domain === canonicalDomain ||
    domain.endsWith(`.${canonicalDomain}`) ||
    canonicalDomain.endsWith(`.${domain}`)
  );
}

function normalizeSourceUrl(url: string) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.searchParams.delete("utm_campaign");
    parsed.searchParams.delete("utm_content");
    parsed.searchParams.delete("utm_term");
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
