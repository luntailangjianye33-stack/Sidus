"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileText,
  Link2,
  type LucideIcon,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Plus,
  Save,
  SearchCheck,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { mockReviewResponse } from "@/data/mock-review-response";
import { defaultSampleEssay, sampleEssays } from "@/data/sample-essays";
import { normalizeApplicationTarget } from "@/lib/application-target";
import { createReviewRequest } from "@/lib/create-review-request";
import { requestBenchmarkResearch } from "@/lib/benchmark-research-client";
import { requestCompanyResearch } from "@/lib/company-research-client";
import { requestDocumentExtraction } from "@/lib/document-intake-client";
import { requestSuggestionDiscussion } from "@/lib/discuss-client";
import { requestReview } from "@/lib/review-client";
import type {
  ApplicationTarget,
  BenchmarkResearchResponse,
  CompanyResearchResponse,
  CompanyResearchSource,
  DocumentExtractionCandidate,
  DocumentExtractionResult,
  EssaySourceType,
  EvidenceAuditItem,
  ReviewCriterion,
  ReviewRequest,
  ReviewResponse,
  SampleEssay,
  Suggestion,
  SuggestionStatus,
  UserContext,
  VerificationStatus,
} from "@/types/sidus";

type PageId =
  | "library"
  | "context"
  | "research"
  | "benchmark"
  | "review"
  | "suggestions"
  | "final";
type DrawerItem =
  | { kind: "suggestion"; item: Suggestion }
  | { kind: "audit"; item: EvidenceAuditItem }
  | null;
type CompanyResearchStatus = "idle" | "pending" | "accepted";
type WorkflowStatus = "done" | "next" | "locked" | "available";
type CompanyResearchProgressStep = {
  label: string;
  detail: string;
  searchFocus: string;
};
type SavedEssayDraft = {
  id: string;
  title: string;
  savedAt: string;
  selectedSampleId: string;
  essayTitle: string;
  essaySourceType: EssaySourceType;
  essayText: string;
  finalDraft: string;
  targetCount: number;
  applicationTarget: ApplicationTarget;
  userContext: UserContext;
  reviewRequest: ReviewRequest | null;
  reviewResponse: ReviewResponse | null;
  suggestionStatuses: Record<string, SuggestionStatus>;
  companyResearch: CompanyResearchResponse | null;
  acceptedCompanyResearch: CompanyResearchResponse | null;
  companyResearchStatus: CompanyResearchStatus;
  benchmarkResearch: BenchmarkResearchResponse | null;
};
type EssayDirectionSuggestion = {
  id: string;
  title: string;
  reason: string;
  motivationAxis: string;
  selfPr: string;
  studentExperience: string;
  evidenceLabel: string;
};

const savedEssaysStorageKey = "sidus-saved-essays-v1";

const criteria: ReviewCriterion[] = [
  "logical_structure",
  "specificity_and_original_experience",
  "company_understanding_and_fit",
  "expression_quality",
  "authenticity_and_ai_likeness",
];

const companyResearchProgressSteps: CompanyResearchProgressStep[] = [
  {
    label: "公式会社概要を確認中",
    detail: "入力URLと公式サイトから、対象企業そのものの会社概要を優先して確認しています。",
    searchFocus: "公式会社概要 / 公式企業情報",
  },
  {
    label: "法人番号ページを確認中",
    detail: "法人番号、gBizINFO、日経会社情報など、固定欄に使える信頼DBを照合しています。",
    searchFocus: "法人番号 / gBizINFO / 日経会社情報",
  },
  {
    label: "IR/ニュースページを確認中",
    detail: "公式IR、ニュースリリース、採用情報から、ESで使える事業理解を探しています。",
    searchFocus: "公式IR / ニュース / 採用情報",
  },
  {
    label: "就活媒体を除外中",
    detail: "子会社、口コミ、就活媒体、自動生成ページが主根拠に混ざらないように弾いています。",
    searchFocus: "除外判定 / 対象企業の同一性",
  },
  {
    label: "出典本文を抽出中",
    detail: "確認済みソースから、ESレビューに強く影響させる企業固有の論点だけを抽出しています。",
    searchFocus: "出典本文 / ES論点 / 未確認事項",
  },
];

const minNavWidth = 224;
const maxNavWidth = 360;
const collapsedNavWidth = 64;

const navItems: {
  id: PageId;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  { id: "library", label: "保存ファイル", description: "保存ESとサンプル", icon: Save },
  { id: "context", label: "前提情報", description: "ESと本人文脈", icon: FileText },
  { id: "research", label: "企業調査", description: "出典と企業理解", icon: ShieldCheck },
  { id: "benchmark", label: "参考ES", description: "型と語彙", icon: SearchCheck },
  { id: "review", label: "レビュー", description: "採点と根拠確認", icon: SearchCheck },
  { id: "suggestions", label: "提案", description: "提案と差分", icon: MessageSquare },
  { id: "final", label: "最終稿", description: "編集と出力", icon: PenLine },
];

const blankApplicationTarget: ApplicationTarget = {
  industry: "",
  companyName: "",
  companyScope: "auto",
  corporateNumber: "",
  position: "",
  companyMemo: "",
  referenceUrls: [],
};

const blankUserContext: UserContext = {
  selfPr: "",
  studentExperience: "",
  motivationAxis: "",
  skills: "",
  values: "",
  seminarMemo: "",
  obOgMemo: "",
  additionalNotes: "",
  benchmarkNotes: {
    passedEssayPatterns: "",
    strongPhrases: "",
    weakGenericPhrases: "",
    structureHints: "",
  },
};

const companyReferenceFields = [
  {
    id: "official-company",
    title: "公式会社概要URL",
    label: "公式会社概要",
  },
  {
    id: "official-recruiting-ir",
    title: "公式採用・IR URL",
    label: "公式採用 / IR",
  },
  {
    id: "nikkei-company-info",
    title: "日経会社情報URL",
    label: "日経会社情報",
  },
  {
    id: "public-disclosure",
    title: "公的情報URL",
    label: "法人番号 / gBizINFO / EDINET",
  },
  {
    id: "extra-reference",
    title: "その他参考URL",
    label: "その他参考URL",
  },
] as const;

function stripTrailingEllipsis(value: string) {
  return value.replace(/(\.\.\.|…)\s*$/u, "").trim();
}

function getSourceDomain(url?: string) {
  if (!url) return "";

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./u, "");
  } catch {
    return "";
  }
}

function getCompanyReferenceUrl(target: ApplicationTarget) {
  const officialUrl = target.referenceUrls.find((source) => {
    const text = `${source.id} ${source.title} ${source.memo ?? ""}`.toLowerCase();
    const domain = getSourceDomain(source.url);
    return (
      source.url &&
      !isRecruitingOrAggregatorUrl(source.url) &&
      !domain.includes("nikkei.") &&
      !domain.includes("irbank.") &&
      /公式|会社概要|企業情報|採用|ir|official|company|corporate|about/u.test(text)
    );
  })?.url;

  return officialUrl || target.referenceUrls.find((source) => source.url)?.url;
}

function isKnownCompanyValue(value?: string) {
  const normalized = (value ?? "").trim().toLowerCase();
  return Boolean(
    normalized &&
      !/^[?？]+$/u.test(normalized) &&
      ![
        "unknown",
        "unknowns",
        "n/a",
        "not found",
        "not confirmed",
        "未確認",
        "不明",
      ].includes(normalized),
  );
}

function isRecruitingOrAggregatorUrl(url?: string) {
  const domain = getSourceDomain(url);
  return [
    "career-tasu.jp",
    "job.mynavi.jp",
    "rikunabi.com",
    "onecareer.jp",
    "openwork.jp",
    "vorkers.com",
    "wantedly.com",
  ].some((blockedDomain) => domain.endsWith(blockedDomain));
}

function getPrimaryCompanyUrl(research: CompanyResearchResponse) {
  if (
    isKnownCompanyValue(research.identitySummary.officialWebsite) &&
    !isRecruitingOrAggregatorUrl(research.identitySummary.officialWebsite)
  ) {
    return research.identitySummary.officialWebsite;
  }

  const officialSource = research.sources.find(
    (source) =>
      source.url &&
      (source.sourceType === "official_site" ||
        source.sourceType === "company_database") &&
      !isRecruitingOrAggregatorUrl(source.url),
  );
  if (officialSource?.url) return officialSource.url;

  const financialSource = research.sources.find(
    (source) =>
      source.url &&
      source.sourceType === "financial_disclosure" &&
      !isRecruitingOrAggregatorUrl(source.url),
  );
  if (financialSource?.url) return financialSource.url;

  return research.sources.find(
    (source) => source.url && !isRecruitingOrAggregatorUrl(source.url),
  )?.url;
}

function getFaviconUrl(url?: string) {
  const domain = getSourceDomain(url);
  if (!domain) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    domain,
  )}&sz=64`;
}

function getCompanyLogoUrls(url?: string, companyName?: string) {
  const domain = getSourceDomain(url);
  if (!domain) return [];
  const params = new URLSearchParams({
    url: url ?? "",
    name: companyName ?? "",
  });
  return [
    `/api/company-logo?${params.toString()}`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
      domain,
    )}&sz=128`,
  ];
}

function getDisplayValue(value?: string) {
  return isKnownCompanyValue(value) ? value?.trim() ?? "" : "未確認";
}

function getResearchAccessModeLabel(
  accessMode: CompanyResearchResponse["accessMode"],
) {
  const labels: Record<CompanyResearchResponse["accessMode"], string> = {
    fetched_sources: "外部情報を取得済み",
    user_sources_only: "入力情報のみ",
    model_knowledge_only: "検証済み出典なし",
  };
  return labels[accessMode];
}

function getConfidenceLabel(confidence: CompanyResearchResponse["confidence"]) {
  const labels: Record<CompanyResearchResponse["confidence"], string> = {
    high: "高",
    medium: "中",
    low: "低",
  };
  return labels[confidence];
}

function getSourceTypeLabel(sourceType: CompanyResearchSource["sourceType"]) {
  const labels: Record<CompanyResearchSource["sourceType"], string> = {
    company_database: "日経会社情報",
    official_site: "公式サイト",
    recruiting: "公式採用",
    public_registry: "公的情報",
    financial_disclosure: "公式IR・開示",
    major_media: "主要メディア",
    user_memo: "本人メモ",
    model_knowledge: "未検証情報",
    url: "参考URL",
  };
  return labels[sourceType];
}

function getEvidenceCategoryLabel(
  category: CompanyResearchResponse["evidenceDigest"][number]["category"],
) {
  const labels: Record<
    CompanyResearchResponse["evidenceDigest"][number]["category"],
    string
  > = {
    public_registry: "公的情報",
    official_company: "企業公式",
    financial: "財務・開示",
    major_media: "主要メディア",
    user_context: "本人メモ",
    unverified: "未確認",
  };
  return labels[category];
}

function createCompanySourceLookup(research: CompanyResearchResponse) {
  return new Map(research.sources.map((source) => [source.id, source]));
}

function getSourceDisplayName(
  sourceId: string,
  sourceLookup: Map<string, CompanyResearchSource>,
) {
  const source = sourceLookup.get(sourceId);
  if (!source) return "出典未確認";
  return source.title || getSourceTypeLabel(source.sourceType);
}

function getSourceLinkLabel(source: Pick<CompanyResearchSource, "sourceType">) {
  return `${getSourceTypeLabel(source.sourceType)}を開く`;
}

function getUsedForLabel(value: string) {
  const labels: Record<string, string> = {
    companyUnderstandingMemo: "企業理解",
    businessSummary: "事業説明",
    identitySummary: "法人情報",
    financialHighlights: "財務情報",
    recentDevelopments: "最近の動向",
    evidenceDigest: "ES論点",
    esReviewFocus: "レビュー観点",
    source_discovery: "出典探索",
    fallbackCompanyUnderstanding: "補助情報",
  };
  return labels[value] ?? value;
}

function getWarningCodeLabel(code: string) {
  const labels: Record<string, string> = {
    insufficient_company_context: "企業情報不足",
    insufficient_user_context: "本人情報不足",
    possible_hallucination: "要確認",
    source_missing: "出典不足",
    too_short: "文字数不足",
    too_long: "文字数超過",
    ambiguous_claim: "根拠が曖昧",
  };
  return labels[code] ?? "確認事項";
}

function getWarningSeverityLabel(severity: string) {
  const labels: Record<string, string> = {
    info: "情報",
    warning: "注意",
    error: "要修正",
  };
  return labels[severity] ?? severity;
}

function getSourceQualityLabel(value: string) {
  const labels: Record<string, string> = {
    official: "公式情報",
    company_provided: "企業提供",
    user_provided: "本人入力",
    third_party: "第三者情報",
    model_knowledge: "未検証情報",
    unknown: "未確認",
  };
  return labels[value] ?? value;
}

function getSuggestionTypeLabel(type: Suggestion["type"]) {
  const labels: Record<Suggestion["type"], string> = {
    logic: "構成",
    specificity: "具体性",
    company_fit: "企業適合",
    expression: "表現",
    authenticity: "本人らしさ",
    length: "文字数",
  };
  return labels[type];
}

function getSuggestionSeverityLabel(severity: Suggestion["severity"]) {
  const labels: Record<Suggestion["severity"], string> = {
    high: "優先",
    medium: "通常",
    low: "軽微",
  };
  return labels[severity];
}

function getSuggestionStatusLabel(status: SuggestionStatus) {
  const labels: Record<SuggestionStatus, string> = {
    unreviewed: "未確認",
    accepted: "採用済み",
    rejected: "却下",
    edited: "編集反映",
    revised: "再検討済み",
  };
  return labels[status];
}

function getReusableCompanyRisk(
  essayText: string,
  applicationTarget: ApplicationTarget,
) {
  const essay = essayText.trim();
  const companyName = applicationTarget.companyName.trim();
  if (!essay || !companyName) return null;

  const specificTerms = getCompanySpecificTerms(applicationTarget);
  const matchedTerms = specificTerms.filter((term) => essay.includes(term));
  const mentionsCompany = essay.includes(companyName);
  const genericSignals = [
    "貴社でも",
    "社会に貢献",
    "お客様に寄り添",
    "成長したい",
    "挑戦したい",
    "強みを活か",
    "課題解決",
  ].filter((term) => essay.includes(term));

  if (matchedTerms.length >= 2 && mentionsCompany) return null;
  if (matchedTerms.length >= 3) return null;
  if (!mentionsCompany && genericSignals.length === 0) return null;

  return {
    matchedTerms,
    genericSignals,
    reason:
      matchedTerms.length === 0
        ? "企業固有の事業・顧客・提供価値が本文にほとんど入っていません。"
        : "企業名は出ていても、本文の根拠が企業固有情報まで届いていない可能性があります。",
  };
}

function getCompanySpecificTerms(applicationTarget: ApplicationTarget) {
  const text = [
    applicationTarget.companyName,
    applicationTarget.industry,
    applicationTarget.position,
    applicationTarget.companyMemo,
  ].join(" ");
  const stopWords = new Set([
    "企業",
    "会社",
    "事業",
    "情報",
    "サービス",
    "インターン",
    "日本",
    "株式会社",
    "できる",
    "いる",
    "する",
    "ます",
    "です",
  ]);

  return [
    ...new Set(
      text
        .split(/[\s　、。・/／|｜,，.。()（）「」『』【】\[\]{}:：;；-]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2 && !stopWords.has(term)),
    ),
  ].slice(0, 24);
}

function normalizeUserContext(context: UserContext): UserContext {
  return {
    ...context,
    benchmarkNotes: {
      passedEssayPatterns: context.benchmarkNotes?.passedEssayPatterns ?? "",
      strongPhrases: context.benchmarkNotes?.strongPhrases ?? "",
      weakGenericPhrases: context.benchmarkNotes?.weakGenericPhrases ?? "",
      structureHints: context.benchmarkNotes?.structureHints ?? "",
    },
  };
}

function hasBenchmarkNotes(context: UserContext) {
  const notes = context.benchmarkNotes;
  if (!notes) return false;
  return [
    notes.passedEssayPatterns,
    notes.strongPhrases,
    notes.weakGenericPhrases,
    notes.structureHints,
  ].some((value) => value.trim().length > 0);
}

function createEssayDirectionSuggestions({
  applicationTarget,
  userContext,
  acceptedCompanyResearch,
}: {
  applicationTarget: ApplicationTarget;
  userContext: UserContext;
  acceptedCompanyResearch: CompanyResearchResponse | null;
}): EssayDirectionSuggestion[] {
  const company = applicationTarget.companyName || "応募先企業";
  const position = applicationTarget.position || "志望職種";
  const focus =
    acceptedCompanyResearch?.esReviewFocus[0] ||
    acceptedCompanyResearch?.roleFitHypotheses[0] ||
    applicationTarget.companyMemo ||
    "企業固有の提供価値と本人経験の接続";
  const business =
    acceptedCompanyResearch?.businessSummary[0] ||
    acceptedCompanyResearch?.companyUnderstandingMemo ||
    applicationTarget.companyMemo ||
    `${company}の事業理解`;
  const benchmark = userContext.benchmarkNotes;
  const strongPhrase =
    benchmark?.strongPhrases
      ?.split(/\n/u)
      .map((item) => item.trim())
      .find(Boolean) || "企業固有の課題に対して自分の経験をどう使うか";
  const studentExperience =
    userContext.studentExperience ||
    "これまでの経験で、課題を分解し、周囲を巻き込みながら改善したこと";
  const selfPr =
    userContext.selfPr ||
    "複雑な情報を整理し、相手が判断しやすい形に落とし込めること";

  return [
    {
      id: "direction-company-fit",
      title: "企業理解を主軸にする",
      reason: `採用済み企業調査の論点「${focus.slice(0, 80)}」を起点に、${company}である必然性を強めます。`,
      motivationAxis: `${company}の${business.slice(0, 90)}に関心がある。${position}として、企業固有の提供価値と自分の経験を接続し、現場で再現できる貢献をしたい。`,
      selfPr,
      studentExperience,
      evidenceLabel: acceptedCompanyResearch
        ? "採用済み企業調査"
        : "企業メモ",
    },
    {
      id: "direction-experience-fit",
      title: "本人経験を主軸にする",
      reason: "自己PRとガクチカを先に置き、企業情報は経験の延長線として接続します。",
      motivationAxis: `自分の強みである「${selfPr.slice(0, 60)}」を、${company}の${position}で求められる課題解決に活かしたい。`,
      selfPr,
      studentExperience,
      evidenceLabel: "本人文脈",
    },
    {
      id: "direction-benchmark-fit",
      title: "通過ESの型に寄せる",
      reason: `参考ESベンチマークの語彙「${strongPhrase.slice(0, 70)}」を、本人経験の言葉に変換して使います。`,
      motivationAxis: `${strongPhrase}という観点から、${company}で自分の経験を具体的な行動に変えたい。`,
      selfPr,
      studentExperience,
      evidenceLabel: hasBenchmarkNotes(userContext)
        ? "参考ESベンチマーク"
        : "構成候補",
    },
  ];
}

function getReviewBlockReason({
  isContextReady,
  isCompanyReady,
  isBenchmarkReady,
}: {
  isContextReady: boolean;
  isCompanyReady: boolean;
  isBenchmarkReady: boolean;
}) {
  if (!isContextReady) {
    return "前提情報でES本文・企業名・職種を入力してください。";
  }
  if (!isCompanyReady) {
    return "次は企業調査を実行し、内容を採用してください。";
  }
  if (!isBenchmarkReady) {
    return "次は参考ESページで構成・語彙ベンチマークを作ってください。";
  }
  return "";
}

function formatCompanyResearchForReview(research: CompanyResearchResponse) {
  const identity = research.identitySummary;
  const claims = (research.companyClaims ?? [])
    .filter((claim) => claim.adopted)
    .map(
      (claim) =>
        `- ${claim.label}: ${claim.text} [${claim.verification}, source: ${claim.sourceIds.join(", ") || "none"}]`,
    )
    .join("\n");
  const financial = research.financialHighlights
    .map((item) => `- ${item.label}: ${item.value} (${item.period}, source: ${item.sourceId})`)
    .join("\n");
  const developments = research.recentDevelopments
    .map((item) => `- ${item.title}: ${item.summary} (${item.date}, source: ${item.sourceId})`)
    .join("\n");
  const evidence = research.evidenceDigest
    .map((item) => `- [${item.category}] ${item.title}: ${item.summary} / ES relevance: ${item.userRelevance}`)
    .join("\n");
  const sources = research.sources
    .map((source) => `- ${source.id}: ${source.title} (${source.sourceType}, ${source.sourceTier}, ${source.accessStatus}) ${source.url ?? ""}`)
    .join("\n");
  const unknowns = research.unknowns.map((unknown) => `- ${unknown}`).join("\n");

  return [
    "Sidus採用済み企業調査レポート",
    `企業名: ${research.companyName}`,
    `業界/職種: ${research.industry} / ${research.position}`,
    `信頼度: ${research.confidence}`,
    `要約: ${research.companyUnderstandingMemo}`,
    "",
    "法人・企業識別情報",
    `正式名称: ${getDisplayValue(identity.legalName)}`,
    `管轄/法人種別: ${getDisplayValue(identity.jurisdiction)} / ${getDisplayValue(identity.entityKind)}`,
    `法人番号: ${getDisplayValue(identity.corporateNumber)}`,
    `所在地: ${getDisplayValue(identity.headquarters)}`,
    `業種分類: ${getDisplayValue(identity.industryClassification)}`,
    `公式サイト: ${getDisplayValue(identity.officialWebsite)}`,
    `証券コード/市場: ${getDisplayValue(identity.securitiesCode)} / ${getDisplayValue(identity.listingMarket)}`,
    "",
    "証拠台帳Claims",
    claims || "- 採用済みclaimなし",
    "",
    "事業理解",
    ...research.businessSummary.map((item) => `- ${item}`),
    "",
    "財務情報",
    financial || "- 未確認",
    "",
    "最近の動向",
    developments || "- 未確認",
    "",
    "ESレビューに使う根拠",
    evidence || "- 未確認",
    "",
    "職種適合仮説",
    ...research.roleFitHypotheses.map((item) => `- ${item}`),
    "",
    "レビュー観点",
    ...research.esReviewFocus.map((item) => `- ${item}`),
    "",
    "出典",
    sources || "- 未確認",
    "",
    "未確認事項",
    unknowns || "- なし",
  ].join("\n");
}

function applyPartialDiff(
  current: string,
  before: string,
  after: string,
): string | null {
  const beforePrefix = stripTrailingEllipsis(before);
  const afterPrefix = stripTrailingEllipsis(after);
  if (
    beforePrefix === before.trim() ||
    afterPrefix === after.trim() ||
    beforePrefix.length < 8 ||
    afterPrefix.length < 8
  ) {
    return null;
  }

  const start = current.indexOf(beforePrefix);
  if (start === -1) return null;

  const sentenceEnd = current.indexOf("。", start + beforePrefix.length);
  const end = sentenceEnd === -1 ? start + beforePrefix.length : sentenceEnd + 1;
  const tail = current.slice(start + beforePrefix.length, end);
  const replacement = `${afterPrefix}${tail}`;

  return `${current.slice(0, start)}${replacement}${current.slice(end)}`;
}

function removeDuplicateJapaneseSentences(text: string) {
  const seen = new Set<string>();
  return text
    .split(/(?<=。)/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      if (!sentence) return false;
      if (!sentence.endsWith("。") || sentence.length < 18) return true;
      const normalized = sentence.replace(/\s+/gu, "");
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join("");
}

export default function Home() {
  const [page, setPage] = useState<PageId>("context");
  const [navWidth, setNavWidth] = useState(248);
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [selectedSampleId, setSelectedSampleId] = useState(defaultSampleEssay.id);
  const [essayTitle, setEssayTitle] = useState(defaultSampleEssay.title);
  const [essaySourceType, setEssaySourceType] =
    useState<EssaySourceType>("sample");
  const [essayText, setEssayText] = useState(defaultSampleEssay.essayText);
  const [finalDraft, setFinalDraft] = useState(defaultSampleEssay.essayText);
  const [documentExtraction, setDocumentExtraction] =
    useState<DocumentExtractionResult | null>(null);
  const [isExtractingDocument, setIsExtractingDocument] = useState(false);
  const [documentExtractionError, setDocumentExtractionError] = useState<
    string | null
  >(null);
  const [targetCount, setTargetCount] = useState(
    defaultSampleEssay.targetCharacterCount,
  );
  const [applicationTarget, setApplicationTarget] =
    useState<ApplicationTarget>(defaultSampleEssay.applicationTarget);
  const [userContext, setUserContext] = useState<UserContext>(
    normalizeUserContext(defaultSampleEssay.userContext),
  );
  const [reviewRequest, setReviewRequest] = useState<ReviewRequest | null>(null);
  const [reviewResponse, setReviewResponse] = useState<ReviewResponse | null>(
    null,
  );
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<DrawerItem>(null);
  const [draftEditText, setDraftEditText] = useState(
    mockReviewResponse.suggestions[0].diffHint.after,
  );
  const [suggestionStatuses, setSuggestionStatuses] = useState<
    Record<string, SuggestionStatus>
  >(() => createInitialSuggestionStatuses(mockReviewResponse.suggestions));
  const [discussionDraft, setDiscussionDraft] = useState("");
  const [discussionNotes, setDiscussionNotes] = useState<Record<string, string[]>>({});
  const [isDiscussingSuggestion, setIsDiscussingSuggestion] = useState(false);
  const [companyResearch, setCompanyResearch] =
    useState<CompanyResearchResponse | null>(null);
  const [acceptedCompanyResearch, setAcceptedCompanyResearch] =
    useState<CompanyResearchResponse | null>(null);
  const [companyResearchStatus, setCompanyResearchStatus] =
    useState<CompanyResearchStatus>("idle");
  const [isResearchingCompany, setIsResearchingCompany] = useState(false);
  const [companyResearchProgressIndex, setCompanyResearchProgressIndex] =
    useState(0);
  const [companyResearchError, setCompanyResearchError] = useState<string | null>(
    null,
  );
  const [benchmarkResearch, setBenchmarkResearch] =
    useState<BenchmarkResearchResponse | null>(null);
  const [isResearchingBenchmark, setIsResearchingBenchmark] = useState(false);
  const [benchmarkResearchError, setBenchmarkResearchError] = useState<
    string | null
  >(null);
  const [savedDrafts, setSavedDrafts] = useState<SavedEssayDraft[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "failed">(
    "idle",
  );

  const activeReview = reviewResponse ?? mockReviewResponse;
  const isContextReady =
    essayText.trim().length > 0 &&
    applicationTarget.companyName.trim().length > 0 &&
    applicationTarget.position.trim().length > 0;
  const isCompanyReady = companyResearchStatus === "accepted";
  const isBenchmarkReady = hasBenchmarkNotes(userContext);
  const canRunReview = isContextReady && isCompanyReady && isBenchmarkReady;
  const reviewBlockReason = getReviewBlockReason({
    isContextReady,
    isCompanyReady,
    isBenchmarkReady,
  });
  const openCount = Object.values(suggestionStatuses).filter(
    (status) => status === "unreviewed" || status === "revised",
  ).length;
  const acceptedCount = Object.values(suggestionStatuses).filter(
    (status) => status === "accepted" || status === "edited",
  ).length;
  const workflowStatus: Record<PageId, WorkflowStatus> = {
    library: "available",
    context: isContextReady ? "done" : "next",
    research: !isContextReady
      ? "locked"
      : isCompanyReady
        ? "done"
        : "next",
    benchmark: !isContextReady || !isCompanyReady
      ? "locked"
      : isBenchmarkReady
        ? "done"
        : "next",
    review: !canRunReview
      ? "locked"
      : reviewResponse
        ? "done"
        : "next",
    suggestions: !reviewResponse
      ? "locked"
      : openCount > 0
        ? "next"
        : "done",
    final: !reviewResponse
      ? "locked"
      : openCount === 0 || acceptedCount > 0
        ? "next"
        : "available",
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(savedEssaysStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedEssayDraft[];
      if (Array.isArray(parsed)) {
        setSavedDrafts(parsed.map(normalizeSavedDraft));
      }
    } catch {
      setSavedDrafts([]);
    }
  }, []);

  useEffect(() => {
    if (!isResearchingCompany) {
      setCompanyResearchProgressIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setCompanyResearchProgressIndex((current) =>
        Math.min(current + 1, companyResearchProgressSteps.length - 1),
      );
    }, 4500);

    return () => window.clearInterval(timer);
  }, [isResearchingCompany]);

  useEffect(() => {
    if (page !== "review" && page !== "suggestions") {
      setDrawerItem(null);
    }
  }, [page]);

  function normalizeSavedDraft(draft: SavedEssayDraft): SavedEssayDraft {
    return {
      ...draft,
      userContext: normalizeUserContext(draft.userContext),
      companyResearchStatus: draft.companyResearchStatus ?? "idle",
      benchmarkResearch: draft.benchmarkResearch ?? null,
    };
  }

  function persistSavedDrafts(nextDrafts: SavedEssayDraft[]) {
    setSavedDrafts(nextDrafts);
    window.localStorage.setItem(savedEssaysStorageKey, JSON.stringify(nextDrafts));
  }

  function buildSavedDraft(id?: string): SavedEssayDraft {
    const existingId =
      id ??
      (selectedSampleId.startsWith("saved-") ? selectedSampleId : `saved-${Date.now()}`);
    const companyLabel = applicationTarget.companyName || "応募先未設定";
    const title = essayTitle.trim() || `${companyLabel}のES`;

    return {
      id: existingId,
      title,
      savedAt: new Date().toISOString(),
      selectedSampleId,
      essayTitle: title,
      essaySourceType,
      essayText,
      finalDraft,
      targetCount,
      applicationTarget,
      userContext: normalizeUserContext(userContext),
      reviewRequest,
      reviewResponse,
      suggestionStatuses,
      companyResearch,
      acceptedCompanyResearch,
      companyResearchStatus,
      benchmarkResearch,
    };
  }

  function saveCurrentEssay() {
    try {
      const draft = buildSavedDraft();
      const nextDrafts = [
        draft,
        ...savedDrafts.filter((item) => item.id !== draft.id),
      ].slice(0, 12);
      persistSavedDrafts(nextDrafts);
      setSelectedSampleId(draft.id);
      setEssayTitle(draft.essayTitle);
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 1800);
    } catch {
      setSaveStatus("failed");
      window.setTimeout(() => setSaveStatus("idle"), 2200);
    }
  }

  function loadSavedDraft(draft: SavedEssayDraft) {
    const normalizedDraft = normalizeSavedDraft(draft);
    setSelectedSampleId(normalizedDraft.id);
    setEssayTitle(normalizedDraft.essayTitle);
    setEssaySourceType(normalizedDraft.essaySourceType);
    setEssayText(normalizedDraft.essayText);
    setFinalDraft(normalizedDraft.finalDraft);
    setTargetCount(normalizedDraft.targetCount);
    setApplicationTarget(normalizedDraft.applicationTarget);
    setUserContext(normalizedDraft.userContext);
    setReviewRequest(normalizedDraft.reviewRequest);
    setReviewResponse(normalizedDraft.reviewResponse);
    setSuggestionStatuses(normalizedDraft.suggestionStatuses);
    setCompanyResearch(normalizedDraft.companyResearch);
    setAcceptedCompanyResearch(normalizedDraft.acceptedCompanyResearch);
    setCompanyResearchStatus(normalizedDraft.companyResearchStatus);
    setBenchmarkResearch(normalizedDraft.benchmarkResearch);
    setDrawerItem(null);
    setReviewError(null);
    setCompanyResearchError(null);
    setBenchmarkResearchError(null);
    setPage("context");
  }

  function loadSample(sample: SampleEssay) {
    setSelectedSampleId(sample.id);
    setEssayTitle(sample.title);
    setEssaySourceType("sample");
    setEssayText(sample.essayText);
    setFinalDraft(sample.essayText);
    setDocumentExtraction(null);
    setDocumentExtractionError(null);
    setIsExtractingDocument(false);
    setTargetCount(sample.targetCharacterCount);
    setApplicationTarget(sample.applicationTarget);
    setUserContext(normalizeUserContext(sample.userContext));
    setReviewRequest(null);
    setReviewResponse(null);
    setDrawerItem(null);
    setReviewError(null);
    setSuggestionStatuses(createInitialSuggestionStatuses(mockReviewResponse.suggestions));
    setDiscussionDraft("");
    setDiscussionNotes({});
    setIsDiscussingSuggestion(false);
    setCompanyResearch(null);
    setAcceptedCompanyResearch(null);
    setCompanyResearchStatus("idle");
    setCompanyResearchError(null);
    setBenchmarkResearch(null);
    setBenchmarkResearchError(null);
    setIsResearchingBenchmark(false);
    setPage("context");
  }

  function startNewEssayReview() {
    setSelectedSampleId("custom-new-essay");
    setEssayTitle("Custom ES");
    setEssaySourceType("text");
    setEssayText("");
    setFinalDraft("");
    setDocumentExtraction(null);
    setDocumentExtractionError(null);
    setIsExtractingDocument(false);
    setTargetCount(400);
    setApplicationTarget(blankApplicationTarget);
    setUserContext(blankUserContext);
    setReviewRequest(null);
    setReviewResponse(null);
    setDrawerItem(null);
    setReviewError(null);
    setSuggestionStatuses({});
    setDiscussionDraft("");
    setDiscussionNotes({});
    setIsDiscussingSuggestion(false);
    setCompanyResearch(null);
    setAcceptedCompanyResearch(null);
    setCompanyResearchStatus("idle");
    setCompanyResearchError(null);
    setBenchmarkResearch(null);
    setBenchmarkResearchError(null);
    setIsResearchingBenchmark(false);
    setPage("context");
  }

  async function runCompanyResearch() {
    const normalizedTarget = normalizeApplicationTarget(applicationTarget);
    if (!normalizedTarget.companyName.trim()) {
      setCompanyResearchError("企業名を入力してから調査を実行してください。");
      return;
    }
    if (normalizedTarget !== applicationTarget) {
      setApplicationTarget(normalizedTarget);
    }

    setCompanyResearchError(null);
    setCompanyResearch(null);
    setAcceptedCompanyResearch(null);
    setCompanyResearchStatus("idle");
    setCompanyResearchProgressIndex(0);
    setIsResearchingCompany(true);

    try {
      const response = await requestCompanyResearch({
        applicationTarget: normalizedTarget,
      });
      setCompanyResearch(response);
      setCompanyResearchStatus("pending");
    } catch (error) {
      setCompanyResearchError(
        error instanceof Error ? error.message : "Failed to research company",
      );
    } finally {
      setIsResearchingCompany(false);
    }
  }

  function acceptCompanyResearch() {
    if (!companyResearch) return;

    setApplicationTarget((current) => ({
      ...current,
      companyMemo: formatCompanyResearchForReview(companyResearch),
      referenceUrls:
        current.referenceUrls.length > 0
          ? current.referenceUrls
          : companyResearch.sources
              .filter((source) => source.url)
              .map((source) => ({
                id: source.id,
                title: source.title,
                url: source.url,
                memo: source.excerpt,
                sourceType: "url" as const,
              })),
    }));
    setCompanyResearchStatus("accepted");
    setAcceptedCompanyResearch(companyResearch);
    setBenchmarkResearch(null);
    setBenchmarkResearchError(null);
    setReviewResponse(null);
    setReviewRequest(null);
    setPage("benchmark");
  }

  function discardCompanyResearch() {
    setCompanyResearch(null);
    setAcceptedCompanyResearch(null);
    setCompanyResearchStatus("idle");
    setCompanyResearchError(null);
    setBenchmarkResearch(null);
    setBenchmarkResearchError(null);
  }

  async function runBenchmarkResearch() {
    const normalizedTarget = normalizeApplicationTarget(applicationTarget);
    if (!normalizedTarget.companyName.trim()) {
      setBenchmarkResearchError("企業名を入力してから参考ESベンチマークを作成してください。");
      return;
    }
    setApplicationTarget(normalizedTarget);
    if (companyResearchStatus !== "accepted") {
      setBenchmarkResearchError("企業調査を採用してから参考ESベンチマークを作成してください。");
      setPage("research");
      return;
    }

    setBenchmarkResearchError(null);
    setIsResearchingBenchmark(true);

    try {
      const response = await requestBenchmarkResearch({
        applicationTarget: normalizedTarget,
        acceptedCompanyResearch,
      });
      setBenchmarkResearch(response);
      setUserContext((current) => ({
        ...normalizeUserContext(current),
        benchmarkNotes: response.benchmarkNotes,
      }));
      setReviewResponse(null);
      setReviewRequest(null);
      setDrawerItem(null);
      setSuggestionStatuses({});
    } catch (error) {
      setBenchmarkResearchError(
        error instanceof Error
          ? error.message
          : "参考ESベンチマークの生成に失敗しました。",
      );
    } finally {
      setIsResearchingBenchmark(false);
    }
  }

  function handleEssayTextChange(value: string) {
    setEssayText(value);
    if (essaySourceType === "sample") {
      setSelectedSampleId("custom-edited-essay");
      setEssayTitle("Edited ES");
      setEssaySourceType("text");
    }
  }

  async function handleDocumentUpload(file: File) {
    setDocumentExtractionError(null);
    setIsExtractingDocument(true);

    try {
      const result = await requestDocumentExtraction(file);
      setDocumentExtraction(result);
      setEssaySourceType(result.sourceType);
      setEssayTitle(result.fileName);
      setSelectedSampleId(`uploaded-${result.sourceType}`);
      setReviewRequest(null);
      setReviewResponse(null);
      setDrawerItem(null);
      setSuggestionStatuses({});
    } catch (error) {
      setDocumentExtractionError(
        error instanceof Error
          ? error.message
          : "原稿ファイルの読み込みに失敗しました。",
      );
    } finally {
      setIsExtractingDocument(false);
    }
  }

  function acceptExtractedCandidate(candidate: DocumentExtractionCandidate) {
    setEssayText(candidate.text);
    setFinalDraft(candidate.text);
    setSelectedSampleId(`uploaded-${documentExtraction?.sourceType ?? "text"}`);
    setEssayTitle(
      documentExtraction
        ? `${documentExtraction.fileName} / ${candidate.label}`
        : candidate.label,
    );
    setReviewRequest(null);
    setReviewResponse(null);
    setDrawerItem(null);
    setReviewError(null);
    setSuggestionStatuses({});
    setPage("context");
  }

  function acceptExtractedFullText() {
    if (!documentExtraction) return;

    setEssayText(documentExtraction.cleanedText);
    setFinalDraft(documentExtraction.cleanedText);
    setSelectedSampleId(`uploaded-${documentExtraction.sourceType}`);
    setEssayTitle(documentExtraction.fileName);
    setReviewRequest(null);
    setReviewResponse(null);
    setDrawerItem(null);
    setReviewError(null);
    setSuggestionStatuses({});
    setPage("context");
  }

  async function runReview() {
    if (!canRunReview) {
      setReviewError(reviewBlockReason || "レビューに必要な前提情報が不足しています。");
      setPage(
        !isContextReady ? "context" : !isCompanyReady ? "research" : "benchmark",
      );
      return;
    }

    const normalizedTarget = normalizeApplicationTarget(applicationTarget);
    if (normalizedTarget !== applicationTarget) {
      setApplicationTarget(normalizedTarget);
    }

    const request = createReviewRequest({
      essayId: selectedSampleId,
      title: essayTitle,
      rawText: essayText,
      sourceType: essaySourceType,
      targetCharacterCount: targetCount,
      applicationTarget: normalizedTarget,
      userContext: normalizeUserContext(userContext),
      reviewCriteria: criteria,
    });

    setReviewRequest(request);
    setReviewError(null);
    setIsReviewing(true);

    try {
      const response = await requestReview(request);
      setReviewResponse(response);
      setFinalDraft(response.finalDraft?.text ?? essayText);
      setSuggestionStatuses(createInitialSuggestionStatuses(response.suggestions));
      setDrawerItem(
        response.evidenceAudit[0]
          ? { kind: "audit", item: response.evidenceAudit[0] }
          : null,
      );
      setPage("review");
    } catch (error) {
      setReviewResponse(null);
      setSuggestionStatuses({});
      setDrawerItem(null);
      setReviewError(
        error instanceof Error
          ? error.message
          : "レビュー生成に失敗しました。少し待ってから再実行してください。",
      );
      setPage("review");
    } finally {
      setIsReviewing(false);
    }
  }

  function updateSuggestionStatus(
    suggestionId: string,
    status: SuggestionStatus,
  ) {
    setSuggestionStatuses((current) => ({
      ...current,
      [suggestionId]: status,
    }));
  }

  function applySuggestion(suggestion: Suggestion, replacement?: string) {
    const nextText = replacement ?? suggestion.diffHint.after;
    setFinalDraft((current) => {
      if (current.includes(nextText)) return removeDuplicateJapaneseSentences(current);
      if (current.includes(suggestion.diffHint.before)) {
        return removeDuplicateJapaneseSentences(
          current.replace(suggestion.diffHint.before, nextText),
        );
      }
      const partialReplacement = applyPartialDiff(
        current,
        suggestion.diffHint.before,
        nextText,
      );
      if (partialReplacement) {
        return removeDuplicateJapaneseSentences(partialReplacement);
      }
      return removeDuplicateJapaneseSentences(current);
    });
  }

  function acceptSuggestion(suggestion: Suggestion) {
    applySuggestion(suggestion);
    updateSuggestionStatus(suggestion.id, "accepted");
  }

  function rejectSuggestion(suggestion: Suggestion) {
    updateSuggestionStatus(suggestion.id, "rejected");
  }

  function editSuggestion(suggestion: Suggestion, editedText: string) {
    const edited = editedText.trim();
    if (!edited) return;
    applySuggestion(suggestion, edited);
    updateSuggestionStatus(suggestion.id, "edited");
  }

  async function addDiscussionNote(suggestion: Suggestion) {
    const question = discussionDraft.trim();
    if (!question) return;

    setDiscussionNotes((current) => ({
      ...current,
      [suggestion.id]: [
        ...(current[suggestion.id] ?? []),
        `あなた: ${question}`,
      ],
    }));
    setDiscussionDraft("");

    setIsDiscussingSuggestion(true);
    try {
      const response = await requestSuggestionDiscussion({
        suggestion,
        question,
        applicationTarget,
        acceptedCompanyResearch,
        history: (discussionNotes[suggestion.id] ?? []).map((content) => ({
          role: content.startsWith("あなた:") ? "user" : "assistant",
          content,
        })),
      });

      setDiscussionNotes((current) => ({
        ...current,
        [suggestion.id]: [
          ...(current[suggestion.id] ?? []),
          `Sidus: ${response.answer}`,
          `再提案: ${response.revisedSuggestion.diffHint.changeSummary}`,
          ...response.evidenceNotes.map((note) => `根拠メモ: ${note}`),
          ...response.userConfirmationNeeded.map(
            (item) => `確認事項: ${item}`,
          ),
        ],
      }));
      setDraftEditText(response.revisedSuggestion.diffHint.after);
      updateSuggestionStatus(suggestion.id, "revised");
    } catch (error) {
      setDiscussionNotes((current) => ({
        ...current,
        [suggestion.id]: [
          ...(current[suggestion.id] ?? []),
          `Sidus: ${
            error instanceof Error
              ? error.message
              : "再検討に失敗しました。もう一度試してください。"
          }`,
        ],
      }));
    } finally {
      setIsDiscussingSuggestion(false);
    }
  }

  function startNavResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsNavCollapsed(false);

    const startX = event.clientX;
    const startWidth = navWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextWidth = startWidth + moveEvent.clientX - startX;
      setNavWidth(Math.min(maxNavWidth, Math.max(minNavWidth, nextWidth)));
    }

    function handleMouseUp() {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <main className="min-h-screen bg-[#f3f6fb] text-[#101828]">
      <div className="flex h-screen overflow-hidden">
        <AppNav
          page={page}
          setPage={setPage}
          companyName={applicationTarget.companyName}
          isReviewing={isReviewing}
          canRunReview={canRunReview}
          reviewBlockReason={reviewBlockReason}
          workflowStatus={workflowStatus}
          onRunReview={runReview}
          onNewReview={startNewEssayReview}
          openCount={openCount}
          acceptedCount={acceptedCount}
          width={navWidth}
          isCollapsed={isNavCollapsed}
          onToggleCollapsed={() => setIsNavCollapsed((current) => !current)}
          onResizeStart={startNavResize}
        />

        <section className="grid min-w-0 flex-1 grid-rows-[56px_minmax(0,1fr)]">
          <TopBar
            page={page}
            companyName={applicationTarget.companyName}
            position={applicationTarget.position}
            reviewResponse={reviewResponse}
            characterCount={essayText.length}
            targetCount={targetCount}
            saveStatus={saveStatus}
            onSave={saveCurrentEssay}
          />

          <div
            className={`grid min-h-0 ${
              drawerItem
                ? "grid-cols-[minmax(0,1fr)_400px]"
                : "grid-cols-[minmax(0,1fr)]"
            }`}
          >
            <div key={page} className="sidus-page-transition min-h-0 overflow-y-auto bg-white">
              {page === "library" && (
                <LibraryPage
                  selectedSampleId={selectedSampleId}
                  savedDrafts={savedDrafts}
                  saveStatus={saveStatus}
                  onSaveCurrentEssay={saveCurrentEssay}
                  onLoadSavedDraft={loadSavedDraft}
                  onLoadSample={loadSample}
                />
              )}

              {page === "context" && (
                <ContextPage
                  essayText={essayText}
                  essaySourceType={essaySourceType}
                  documentExtraction={documentExtraction}
                  isExtractingDocument={isExtractingDocument}
                  documentExtractionError={documentExtractionError}
                  setEssayText={handleEssayTextChange}
                  onDocumentUpload={handleDocumentUpload}
                  onAcceptExtractedCandidate={acceptExtractedCandidate}
                  onAcceptExtractedFullText={acceptExtractedFullText}
                  applicationTarget={applicationTarget}
                  setApplicationTarget={setApplicationTarget}
                  userContext={userContext}
                  setUserContext={setUserContext}
                  acceptedCompanyResearch={acceptedCompanyResearch}
                  targetCount={targetCount}
                  setTargetCount={setTargetCount}
                  companyResearchStatus={companyResearchStatus}
                  onOpenCompanyResearch={() => setPage("research")}
                />
              )}

              {page === "research" && (
                <CompanyResearchPage
                  applicationTarget={applicationTarget}
                  setApplicationTarget={setApplicationTarget}
                  companyResearch={companyResearch}
                  companyResearchStatus={companyResearchStatus}
                  isResearchingCompany={isResearchingCompany}
                  companyResearchProgressStep={
                    companyResearchProgressSteps[companyResearchProgressIndex]
                  }
                  companyResearchError={companyResearchError}
                  onRunCompanyResearch={runCompanyResearch}
                  onAcceptCompanyResearch={acceptCompanyResearch}
                  onDiscardCompanyResearch={discardCompanyResearch}
                />
              )}

              {page === "benchmark" && (
                <BenchmarkPage
                  applicationTarget={applicationTarget}
                  userContext={userContext}
                  setUserContext={setUserContext}
                  companyResearchStatus={companyResearchStatus}
                  acceptedCompanyResearch={acceptedCompanyResearch}
                  benchmarkResearch={benchmarkResearch}
                  isResearchingBenchmark={isResearchingBenchmark}
                  benchmarkResearchError={benchmarkResearchError}
                  onOpenCompanyResearch={() => setPage("research")}
                  onRunBenchmarkResearch={runBenchmarkResearch}
                />
              )}

              {page === "review" && (
                <ReviewPage
                  reviewRequest={reviewRequest}
                  reviewResponse={reviewResponse}
                  reviewError={reviewError}
                  acceptedCompanyResearch={acceptedCompanyResearch}
                  onSelectAudit={(item) => setDrawerItem({ kind: "audit", item })}
                />
              )}

              {page === "suggestions" && (
                <SuggestionsPage
                  reviewResponse={activeReview}
                  suggestionStatuses={suggestionStatuses}
                  onSelectSuggestion={(item) => {
                    setDraftEditText(item.diffHint.after);
                    setDrawerItem({ kind: "suggestion", item });
                  }}
                />
              )}

              {page === "final" && (
                <FinalPage
                  finalDraft={finalDraft}
                  setFinalDraft={setFinalDraft}
                  targetCount={targetCount}
                  acceptedCount={acceptedCount}
                  openCount={openCount}
                />
              )}
            </div>

            {drawerItem && (
              <DetailDrawer
                item={drawerItem}
                draftEditText={draftEditText}
                setDraftEditText={setDraftEditText}
                onClose={() => setDrawerItem(null)}
                onAccept={acceptSuggestion}
                onReject={rejectSuggestion}
                onEdit={editSuggestion}
                discussionDraft={discussionDraft}
                setDiscussionDraft={setDiscussionDraft}
                discussionNotes={discussionNotes}
                isDiscussingSuggestion={isDiscussingSuggestion}
                onAddDiscussionNote={addDiscussionNote}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function AppNav({
  page,
  setPage,
  companyName,
  isReviewing,
  canRunReview,
  reviewBlockReason,
  workflowStatus,
  onRunReview,
  onNewReview,
  openCount,
  acceptedCount,
  width,
  isCollapsed,
  onToggleCollapsed,
  onResizeStart,
}: {
  page: PageId;
  setPage: (page: PageId) => void;
  companyName: string;
  isReviewing: boolean;
  canRunReview: boolean;
  reviewBlockReason: string;
  workflowStatus: Record<PageId, WorkflowStatus>;
  onRunReview: () => void;
  onNewReview: () => void;
  openCount: number;
  acceptedCount: number;
  width: number;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <aside
      className="relative shrink-0 border-r border-[#1d3552] bg-[#0b1220] text-[#eef4fb] shadow-[12px_0_32px_rgba(15,23,42,0.08)] transition-[width] duration-200 ease-out"
      style={{ width: isCollapsed ? collapsedNavWidth : width }}
    >
      <div className={`border-b border-white/10 ${isCollapsed ? "p-3" : "p-4"}`}>
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center">
            <SidusMark />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="font-serif text-[19px] font-semibold leading-none text-white">
                Sidus
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="grid size-7 place-items-center rounded-md text-[#9fb0c3] hover:bg-white/10 hover:text-white"
            title={isCollapsed ? "サイドバーを開く" : "サイドバーを閉じる"}
          >
            {isCollapsed ? (
              <PanelLeftOpen size={15} />
            ) : (
              <PanelLeftClose size={15} />
            )}
          </button>
        </div>

        {!isCollapsed && (
          <>
            <p className="mt-4 truncate text-xs text-[#9fb0c3]">
              {companyName || "応募先未設定"}
            </p>
            <button
              type="button"
              onClick={onNewReview}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              <Plus size={14} />
              新しいES校正
            </button>
            <button
              type="button"
              onClick={onRunReview}
              disabled={isReviewing || !canRunReview}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-[#d8e8ff] px-3 py-2 text-sm font-semibold text-[#0b1220] hover:bg-white disabled:cursor-not-allowed disabled:bg-[#64748b] disabled:text-[#dbe5ef]"
            >
              <SearchCheck size={14} />
              {isReviewing
                ? "レビュー中"
                : canRunReview
                  ? "レビューを実行"
                  : "準備中"}
            </button>
            {!canRunReview && (
              <p className="mt-2 text-xs leading-5 text-[#f7d58a]">
                {reviewBlockReason}
              </p>
            )}
          </>
        )}

        {isCollapsed && (
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={onNewReview}
              className="grid size-9 place-items-center rounded-md border border-white/10 bg-white/5 text-white hover:bg-white/10"
              title="新しいES校正"
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              onClick={onRunReview}
              disabled={isReviewing || !canRunReview}
              className="grid size-9 place-items-center rounded-md bg-[#d8e8ff] text-[#0b1220] hover:bg-white disabled:cursor-not-allowed disabled:bg-[#64748b] disabled:text-[#dbe5ef]"
              title="レビューを実行"
            >
              <SearchCheck size={15} />
            </button>
          </div>
        )}
      </div>

      <nav className="p-2">
        {navItems.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={page === item.id}
            isCollapsed={isCollapsed}
            openCount={openCount}
            acceptedCount={acceptedCount}
            status={workflowStatus[item.id]}
            onClick={() => setPage(item.id)}
          />
        ))}
      </nav>

      {!isCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={onResizeStart}
          className="absolute right-[-4px] top-0 z-20 h-full w-2 cursor-col-resize"
        >
          <div className="mx-auto h-full w-px bg-transparent transition-colors hover:bg-[#7aa7d9]" />
        </div>
      )}
    </aside>
  );
}

function NavButton({
  item,
  active,
  isCollapsed,
  openCount,
  acceptedCount,
  status,
  onClick,
}: {
  item: (typeof navItems)[number];
  active: boolean;
  isCollapsed: boolean;
  openCount: number;
  acceptedCount: number;
  status: WorkflowStatus;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const locked = status === "locked";
  const isNext = status === "next";
  const count =
    item.id === "suggestions"
      ? openCount
      : item.id === "final"
        ? acceptedCount
        : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      title={isCollapsed ? item.label : undefined}
      className={`group relative flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition ${
        active
          ? "bg-white/12 text-white shadow-sm"
          : isNext
            ? "border border-[#79b8ff]/50 bg-[#10233b] text-white shadow-[0_0_0_1px_rgba(125,184,255,0.22),0_0_18px_rgba(125,184,255,0.22)]"
            : locked
              ? "cursor-not-allowed text-[#5f6f83]"
              : "text-[#b7c5d6] hover:bg-white/8 hover:text-white"
      } ${isNext ? "sidus-next-step" : ""} ${isCollapsed ? "justify-center px-0" : ""}`}
    >
      <Icon size={16} />
      {!isCollapsed && (
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{item.label}</span>
          <span className="mt-1 block text-xs text-[#8fa1b6]">
            {item.description}
          </span>
        </span>
      )}
      {!isCollapsed && isNext && (
        <span className="rounded-md bg-[#d8e8ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#0b1220]">
          NEXT
        </span>
      )}
      {count !== null && (
        <span
          className={`rounded-md px-1.5 py-0.5 text-[11px] ${
            active
              ? "bg-white/18 text-white"
              : "bg-[#17324d] text-[#cfe1f8]"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function SidusMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className="size-7 text-[#f7f2df]"
    >
      <path
        d="M8.2 18.6 15.6 13.4 22.7 17.7 26 10.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="0.9"
        opacity="0.58"
      />
      <path
        d="M5.5 23.8c4.4-1.8 8.8-2.3 13.2-1.2 3.1.8 5.9.4 8.1-1.3"
        fill="none"
        stroke="currentColor"
        strokeDasharray="1.2 2.6"
        strokeLinecap="round"
        strokeWidth="0.75"
        opacity="0.42"
      />
      <path
        d="M16 6.6v9M11.5 11.1h9M12.8 7.9l6.4 6.4M19.2 7.9l-6.4 6.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="0.75"
      />
      <circle cx="16" cy="11.1" r="2.05" fill="currentColor" />
      <circle cx="8.2" cy="18.6" r="1.2" fill="currentColor" />
      <circle cx="15.6" cy="13.4" r="0.85" fill="currentColor" />
      <circle cx="22.7" cy="17.7" r="1.1" fill="currentColor" />
      <circle cx="26" cy="10.2" r="0.95" fill="currentColor" />
      <circle cx="6.2" cy="8" r="0.62" fill="currentColor" opacity="0.88" />
      <circle cx="10.5" cy="5.6" r="0.45" fill="currentColor" opacity="0.75" />
      <circle cx="23.5" cy="5.2" r="0.52" fill="currentColor" opacity="0.82" />
      <circle cx="28" cy="24" r="0.56" fill="currentColor" opacity="0.78" />
      <circle cx="12.4" cy="25.6" r="0.42" fill="currentColor" opacity="0.7" />
      <circle cx="5" cy="26.5" r="0.5" fill="currentColor" opacity="0.72" />
    </svg>
  );
}

function TopBar({
  page,
  companyName,
  position,
  reviewResponse,
  characterCount,
  targetCount,
  saveStatus,
  onSave,
}: {
  page: PageId;
  companyName: string;
  position: string;
  reviewResponse: ReviewResponse | null;
  characterCount: number;
  targetCount: number;
  saveStatus: "idle" | "saved" | "failed";
  onSave: () => void;
}) {
  const title = navItems.find((item) => item.id === page)?.label ?? "Sidus";
  const remainingCharacters = targetCount - characterCount;
  const lengthLabel =
    targetCount > 0
      ? remainingCharacters >= 0
        ? `あと${remainingCharacters}字`
        : `${Math.abs(remainingCharacters)}字超過`
      : `${characterCount}字`;
  const reviewLabel = reviewResponse
    ? `${renderStars(reviewResponse.summary.starRating)} ${reviewResponse.summary.headline}`
    : "レビュー前";

  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-[#e4e4e7] bg-white px-5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#71717a]">
          {title}
        </p>
        <h1 className="mt-1 truncate text-base font-semibold">
          {companyName || "応募先未設定"}
          {position ? ` / ${position}` : ""}
        </h1>
      </div>
      <div className="hidden min-w-0 items-center gap-3 text-xs text-[#52525b] md:flex">
        <button
          type="button"
          onClick={onSave}
          className={`inline-flex items-center gap-1.5 rounded-md border border-[#d4d4d8] bg-white px-2.5 py-1 font-semibold text-[#18181b] transition hover:bg-[#f8fafc] ${
            saveStatus === "saved" ? "sidus-pop border-[#86efac] bg-[#f0fdf4] text-[#14532d]" : ""
          }`}
        >
          <Save size={13} />
          {saveStatus === "saved"
            ? "保存済み"
            : saveStatus === "failed"
              ? "保存失敗"
              : "保存"}
        </button>
        <span
          className={`rounded-md px-2.5 py-1 font-semibold ${
            reviewResponse
              ? "bg-[#e7f5ea] text-[#14532d]"
              : "bg-[#f4f4f5] text-[#52525b]"
          }`}
        >
          {reviewLabel}
        </span>
        <span className="rounded-md bg-[#f8fafc] px-2.5 py-1 font-semibold text-[#334155]">
          {characterCount}/{targetCount}字
        </span>
        <span
          className={`rounded-md px-2.5 py-1 font-semibold ${
            remainingCharacters >= 0
              ? "bg-[#f8fafc] text-[#334155]"
              : "bg-[#fff8e1] text-[#7c4a03]"
          }`}
        >
          {lengthLabel}
        </span>
      </div>
    </header>
  );
}

function ContextPage({
  essayText,
  essaySourceType,
  documentExtraction,
  isExtractingDocument,
  documentExtractionError,
  setEssayText,
  onDocumentUpload,
  onAcceptExtractedCandidate,
  onAcceptExtractedFullText,
  applicationTarget,
  setApplicationTarget,
  userContext,
  setUserContext,
  acceptedCompanyResearch,
  targetCount,
  setTargetCount,
  companyResearchStatus,
  onOpenCompanyResearch,
}: {
  essayText: string;
  essaySourceType: EssaySourceType;
  documentExtraction: DocumentExtractionResult | null;
  isExtractingDocument: boolean;
  documentExtractionError: string | null;
  setEssayText: (value: string) => void;
  onDocumentUpload: (file: File) => void;
  onAcceptExtractedCandidate: (candidate: DocumentExtractionCandidate) => void;
  onAcceptExtractedFullText: () => void;
  applicationTarget: ApplicationTarget;
  setApplicationTarget: (target: ApplicationTarget) => void;
  userContext: UserContext;
  setUserContext: (context: UserContext) => void;
  acceptedCompanyResearch: CompanyResearchResponse | null;
  targetCount: number;
  setTargetCount: (count: number) => void;
  companyResearchStatus: CompanyResearchStatus;
  onOpenCompanyResearch: () => void;
}) {
  const reusableRisk = getReusableCompanyRisk(essayText, applicationTarget);
  const directionSuggestions = createEssayDirectionSuggestions({
    applicationTarget,
    userContext,
    acceptedCompanyResearch,
  });

  function updateTarget<K extends keyof ApplicationTarget>(
    key: K,
    value: ApplicationTarget[K],
  ) {
    setApplicationTarget({ ...applicationTarget, [key]: value });
  }

  function updateContext<K extends keyof UserContext>(
    key: K,
    value: UserContext[K],
  ) {
    setUserContext({ ...userContext, [key]: value });
  }

  function updateTargetCount(value: string) {
    const numericValue = Number(value.replace(/[^\d]/g, ""));
    setTargetCount(Number.isFinite(numericValue) ? numericValue : 0);
  }

  function applyDirectionSuggestion(direction: EssayDirectionSuggestion) {
    setUserContext({
      ...normalizeUserContext(userContext),
      motivationAxis: direction.motivationAxis,
      selfPr: direction.selfPr,
      studentExperience: direction.studentExperience,
    });
  }

  return (
    <PageBody>
      <PageHeader
        label="前提情報"
        title="レビューの前提情報"
        description="ES本文、応募先、根拠ソース、本人文脈をここで管理します。"
      />

      {essayText.trim().length === 0 && (
        <div className="mb-4 rounded-md border border-[#f0c36a] bg-[#fff8e1] px-4 py-3 text-sm leading-6 text-[#7c4a03]">
          まず設問条件とES本文を入力してください。入力後は、企業調査、参考ES、レビューの順に進みます。
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <div className="mb-4 rounded-md border border-[#e4e4e7] bg-[#fafafa] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <SectionHeader title="設問条件" icon={PenLine} />
                <p className="mt-2 text-xs leading-5 text-[#71717a]">
                  企業ごとの指定字数を先に設定します。レビューと最終稿はこの文字数を基準にします。
                </p>
              </div>
              <div className="w-full sm:w-44">
                <Field
                  label="目標文字数"
                  value={targetCount > 0 ? String(targetCount) : ""}
                  onChange={updateTargetCount}
                  placeholder="例: 400"
                />
              </div>
            </div>
          </div>

          <SectionHeader title="ES本文" icon={FileText} />
          <DocumentIntakePanel
            essaySourceType={essaySourceType}
            documentExtraction={documentExtraction}
            isExtractingDocument={isExtractingDocument}
            documentExtractionError={documentExtractionError}
            onDocumentUpload={onDocumentUpload}
            onAcceptExtractedCandidate={onAcceptExtractedCandidate}
            onAcceptExtractedFullText={onAcceptExtractedFullText}
          />
          <textarea
            value={essayText}
            onChange={(event) => setEssayText(event.target.value)}
            placeholder="ここにES本文を貼ってください。例: 志望動機、ガクチカ、自己PRなど。"
            className="mt-3 min-h-[560px] w-full resize-none rounded-md border border-[#e4e4e7] bg-white px-4 py-4 text-[15px] leading-8 outline-none focus:border-[#18181b]"
          />
          {reusableRisk && (
            <div className="mt-3 rounded-md border border-[#f0c36a] bg-[#fff8e1] px-3 py-3">
              <p className="text-sm font-semibold text-[#7c4a03]">
                この文は他社にも使い回せる可能性があります
              </p>
              <p className="mt-1 text-xs leading-5 text-[#7c4a03]">
                理由: {reusableRisk.reason}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reusableRisk.matchedTerms.slice(0, 5).map((term) => (
                  <span
                    key={term}
                    className="rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-[#7c4a03]"
                  >
                    検出: {term}
                  </span>
                ))}
                {reusableRisk.genericSignals.slice(0, 4).map((term) => (
                  <span
                    key={term}
                    className="rounded-md border border-[#f0c36a] px-2 py-0.5 text-[11px] font-semibold text-[#7c4a03]"
                  >
                    汎用表現: {term}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section>
            <SectionHeader title="応募先" icon={ShieldCheck} />
            <div className="mt-3 space-y-3">
              <CompanyIdentityCard
                applicationTarget={applicationTarget}
                status={companyResearchStatus}
              />
              <CompanyScopeControl
                value={applicationTarget.companyScope ?? "auto"}
                onChange={(value) => updateTarget("companyScope", value)}
              />
              <Field label="業界" value={applicationTarget.industry} onChange={(value) => updateTarget("industry", value)} />
              <Field label="企業名" value={applicationTarget.companyName} onChange={(value) => updateTarget("companyName", value)} />
              <Field label="職種" value={applicationTarget.position} onChange={(value) => updateTarget("position", value)} />
              <Field
                label="法人番号"
                value={applicationTarget.corporateNumber ?? ""}
                onChange={(value) => updateTarget("corporateNumber", value)}
              />
              <TextArea label="企業メモ" value={applicationTarget.companyMemo} onChange={(value) => updateTarget("companyMemo", value)} />
              <button
                type="button"
                onClick={onOpenCompanyResearch}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#18181b] px-3 py-2 text-sm font-semibold text-white hover:bg-[#27272a]"
              >
                <ShieldCheck size={14} />
                企業調査ページへ
              </button>
            </div>
          </section>

          <section>
            <SectionHeader title="本人文脈" icon={PenLine} />
            <div className="mt-3 space-y-2">
              {directionSuggestions.map((direction) => (
                <button
                  key={direction.id}
                  type="button"
                  onClick={() => applyDirectionSuggestion(direction)}
                  className="w-full rounded-md border border-[#e4e4e7] bg-[#fafafa] px-3 py-2 text-left hover:bg-white"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#18181b]">
                      {direction.title}
                    </span>
                    <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-semibold text-[#52525b]">
                      {direction.evidenceLabel}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[#71717a]">
                    {direction.reason}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-3">
              <Field label="志望軸" value={userContext.motivationAxis} onChange={(value) => updateContext("motivationAxis", value)} />
              <Field label="自己PR" value={userContext.selfPr} onChange={(value) => updateContext("selfPr", value)} />
              <TextArea label="ガクチカ" value={userContext.studentExperience} onChange={(value) => updateContext("studentExperience", value)} />
            </div>
          </section>

        </aside>
      </div>
    </PageBody>
  );
}

function LibraryPage({
  selectedSampleId,
  savedDrafts,
  saveStatus,
  onSaveCurrentEssay,
  onLoadSavedDraft,
  onLoadSample,
}: {
  selectedSampleId: string;
  savedDrafts: SavedEssayDraft[];
  saveStatus: "idle" | "saved" | "failed";
  onSaveCurrentEssay: () => void;
  onLoadSavedDraft: (draft: SavedEssayDraft) => void;
  onLoadSample: (sample: SampleEssay) => void;
}) {
  return (
    <PageBody wide>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          label="保存ファイル"
          title="保存済みESとサンプル"
          description="保存したES一式を復元したり、サンプルから作業を始めたりできます。"
        />
        <button
          type="button"
          onClick={onSaveCurrentEssay}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#18181b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#27272a]"
        >
          <Save size={14} />
          {saveStatus === "saved"
            ? "保存しました"
            : saveStatus === "failed"
              ? "保存できませんでした"
              : "現在のESを保存"}
        </button>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section>
          <SectionHeader title="保存済みES" icon={Save} />
          {savedDrafts.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-5 text-sm leading-6 text-[#475569]">
              保存したESはまだありません。レビュー中でも上の保存ボタンから保存できます。
            </p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {savedDrafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => onLoadSavedDraft(draft)}
                  className={`rounded-md border px-4 py-3 text-left hover:bg-white ${
                    selectedSampleId === draft.id
                      ? "border-[#18181b] bg-white"
                      : "border-[#e4e4e7] bg-[#fafafa]"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {draft.title}
                  </span>
                  <span className="mt-1 block text-xs text-[#71717a]">
                    {draft.applicationTarget.companyName || "応募先未設定"}
                    {draft.applicationTarget.position
                      ? ` / ${draft.applicationTarget.position}`
                      : ""}
                  </span>
                  <span className="mt-3 grid grid-cols-3 gap-2 text-xs text-[#52525b]">
                    <Metric label="本文" value={`${draft.essayText.length}字`} />
                    <Metric label="目標" value={`${draft.targetCount}字`} />
                    <Metric
                      label="レビュー"
                      value={draft.reviewResponse ? "あり" : "なし"}
                    />
                  </span>
                  <span className="mt-3 block text-xs text-[#71717a]">
                    保存:{" "}
                    {new Date(draft.savedAt).toLocaleString("ja-JP", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside>
          <SectionHeader title="サンプルES" icon={FileText} />
            <div className="mt-3 space-y-2">
              {sampleEssays.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => onLoadSample(sample)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-xs leading-5 ${
                    selectedSampleId === sample.id
                      ? "border-[#18181b] bg-white"
                      : "border-[#e4e4e7] bg-[#fafafa] hover:bg-white"
                  }`}
                >
                  <span className="font-semibold">{sample.title}</span>
                  <span className="mt-1 block text-[#71717a]">
                    {sample.description}
                  </span>
                </button>
              ))}
          </div>
        </aside>
      </div>
    </PageBody>
  );
}

function CompanyResearchPage({
  applicationTarget,
  setApplicationTarget,
  companyResearch,
  companyResearchStatus,
  isResearchingCompany,
  companyResearchProgressStep,
  companyResearchError,
  onRunCompanyResearch,
  onAcceptCompanyResearch,
  onDiscardCompanyResearch,
}: {
  applicationTarget: ApplicationTarget;
  setApplicationTarget: (target: ApplicationTarget) => void;
  companyResearch: CompanyResearchResponse | null;
  companyResearchStatus: CompanyResearchStatus;
  isResearchingCompany: boolean;
  companyResearchProgressStep: CompanyResearchProgressStep;
  companyResearchError: string | null;
  onRunCompanyResearch: () => void;
  onAcceptCompanyResearch: () => void;
  onDiscardCompanyResearch: () => void;
}) {
  function updateTarget<K extends keyof ApplicationTarget>(
    key: K,
    value: ApplicationTarget[K],
  ) {
    setApplicationTarget({ ...applicationTarget, [key]: value });
  }

  function getReferenceUrl(fieldId: string) {
    const fixedSource = applicationTarget.referenceUrls.find(
      (source) => source.id === fieldId,
    );
    if (fixedSource?.url) return fixedSource.url;

    if (fieldId !== "extra-reference") return "";

    return (
      applicationTarget.referenceUrls.find(
        (source) =>
          source.url &&
          !companyReferenceFields.some((field) => field.id === source.id),
      )?.url ?? ""
    );
  }

  function updateReferenceUrl(fieldId: string, title: string, value: string) {
    const existingExtra =
      fieldId === "extra-reference"
        ? applicationTarget.referenceUrls.find(
            (source) =>
              source.url &&
              !companyReferenceFields.some((field) => field.id === source.id),
          )
        : null;
    const targetId = existingExtra?.id ?? fieldId;
    const nextReferences = applicationTarget.referenceUrls.filter(
      (source) => source.id !== targetId,
    );

    if (value.trim()) {
      nextReferences.push({
        id: targetId,
        title,
        url: value,
        memo: "",
        sourceType: "url",
      });
    }

    updateTarget("referenceUrls", nextReferences);
  }

  return (
    <PageBody wide>
      <PageHeader
        label="企業調査"
        title="企業調査"
        description="参照元URLを指定し、公式・公的情報・日経系の会社情報URL候補を優先してESレビューの前提を作ります。"
      />

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="space-y-4">
          <SectionHeader title="調査条件" icon={ShieldCheck} />
          <div className="space-y-3 rounded-md border border-[#e4e4e7] bg-white p-4">
            <CompanyIdentityCard
              applicationTarget={applicationTarget}
              status={companyResearchStatus}
            />
            <CompanyScopeControl
              value={applicationTarget.companyScope ?? "auto"}
              onChange={(value) => updateTarget("companyScope", value)}
            />
            <Field
              label="業界"
              value={applicationTarget.industry}
              onChange={(value) => updateTarget("industry", value)}
            />
            <Field
              label="企業名"
              value={applicationTarget.companyName}
              onChange={(value) => updateTarget("companyName", value)}
            />
            <Field
              label="職種"
              value={applicationTarget.position}
              onChange={(value) => updateTarget("position", value)}
            />
            <Field
              label="法人番号"
              value={applicationTarget.corporateNumber ?? ""}
              onChange={(value) => updateTarget("corporateNumber", value)}
            />
            <TextArea
              label="企業メモ"
              value={applicationTarget.companyMemo}
              onChange={(value) => updateTarget("companyMemo", value)}
            />
          </div>

          <div className="rounded-md border border-[#e4e4e7] bg-[#fafafa] p-4">
            <p className="text-sm font-semibold text-[#18181b]">参照元URL</p>
            <p className="mt-1 text-xs leading-5 text-[#71717a]">
              ここに入れたURLを最優先で読みます。空欄の場合は信頼DBと公式URLを探索します。
            </p>
            <div className="mt-4 space-y-3">
              {companyReferenceFields.map((field) => (
                <Field
                  key={field.id}
                  label={field.label}
                  value={getReferenceUrl(field.id)}
                  onChange={(value) =>
                    updateReferenceUrl(field.id, field.title, value)
                  }
                />
              ))}
            </div>
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          <div className="rounded-md border border-[#e4e4e7] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <SectionHeader title="調査実行" icon={SearchCheck} />
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71717a]">
                  指定URL、公式サイト、公的情報、日経系の会社情報URL候補を確認します。
                </p>
              </div>
              <button
                type="button"
                onClick={onRunCompanyResearch}
                disabled={isResearchingCompany || !applicationTarget.companyName.trim()}
                className="flex items-center justify-center gap-2 rounded-md bg-[#18181b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#27272a] disabled:cursor-not-allowed disabled:bg-[#8b948f]"
              >
                <SearchCheck size={14} />
                {isResearchingCompany ? "企業情報を調査中" : "企業情報を調査"}
              </button>
            </div>

            {isResearchingCompany && (
              <div className="mt-4">
                <CompanyResearchProgress
                  companyName={applicationTarget.companyName}
                  step={companyResearchProgressStep}
                />
              </div>
            )}

            {companyResearchError && (
              <p className="mt-4 rounded-md border border-[#f0c36a] bg-[#fff8e1] px-3 py-2 text-xs leading-5 text-[#7c4a03]">
                {companyResearchError}
              </p>
            )}
          </div>

          {companyResearch ? (
            <CompanyResearchPanel
              research={companyResearch}
              status={companyResearchStatus}
              onAccept={onAcceptCompanyResearch}
              onDiscard={onDiscardCompanyResearch}
            />
          ) : (
            <div className="rounded-md border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-6 text-sm leading-6 text-[#475569]">
              企業調査を実行すると、固定欄、出典、未確認事項、ESレビューで見る観点をここに表示します。
            </div>
          )}
        </section>
      </div>
    </PageBody>
  );
}

function BenchmarkPage({
  applicationTarget,
  userContext,
  setUserContext,
  companyResearchStatus,
  acceptedCompanyResearch,
  benchmarkResearch,
  isResearchingBenchmark,
  benchmarkResearchError,
  onOpenCompanyResearch,
  onRunBenchmarkResearch,
}: {
  applicationTarget: ApplicationTarget;
  userContext: UserContext;
  setUserContext: (context: UserContext) => void;
  companyResearchStatus: CompanyResearchStatus;
  acceptedCompanyResearch: CompanyResearchResponse | null;
  benchmarkResearch: BenchmarkResearchResponse | null;
  isResearchingBenchmark: boolean;
  benchmarkResearchError: string | null;
  onOpenCompanyResearch: () => void;
  onRunBenchmarkResearch: () => void;
}) {
  const normalizedContext = normalizeUserContext(userContext);
  const benchmarkNotes = normalizedContext.benchmarkNotes ?? {
    passedEssayPatterns: "",
    strongPhrases: "",
    weakGenericPhrases: "",
    structureHints: "",
  };
  const companyReady = companyResearchStatus === "accepted";

  function updateBenchmarkNote(
    key: keyof NonNullable<UserContext["benchmarkNotes"]>,
    value: string,
  ) {
    setUserContext({
      ...normalizedContext,
      benchmarkNotes: {
        ...benchmarkNotes,
        [key]: value,
      },
    });
  }

  return (
    <PageBody wide>
      <PageHeader
        label="参考ES"
        title="参考ESベンチマーク"
        description="通過ES本文をコピーせず、構成・語彙・弱い汎用表現だけをレビュー基準に変換します。"
      />

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="rounded-md border border-[#e4e4e7] bg-white p-4">
            <SectionHeader title="実行条件" icon={SearchCheck} />
            <div className="mt-3 space-y-3">
              <CompanyIdentityCard
                applicationTarget={applicationTarget}
                status={companyResearchStatus}
                compact
              />
              {!companyReady && (
                <div className="rounded-md border border-[#f0c36a] bg-[#fff8e1] px-3 py-3 text-xs leading-5 text-[#7c4a03]">
                  まず企業調査を採用してください。参考ESの型は、採用済みの企業理解を前提に作ります。
                </div>
              )}
              <button
                type="button"
                onClick={onRunBenchmarkResearch}
                disabled={isResearchingBenchmark || !companyReady}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#18181b] px-3 py-2 text-sm font-semibold text-white hover:bg-[#27272a] disabled:cursor-not-allowed disabled:bg-[#8b948f]"
              >
                <SearchCheck size={14} />
                {isResearchingBenchmark ? "参考ESを調査中" : "参考ESの型を自動生成"}
              </button>
              {!companyReady && (
                <button
                  type="button"
                  onClick={onOpenCompanyResearch}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-[#d4d4d8] bg-white px-3 py-2 text-sm font-semibold text-[#18181b] hover:bg-[#f8fafc]"
                >
                  <ShieldCheck size={14} />
                  企業調査へ戻る
                </button>
              )}
            </div>
          </div>

          <div className="rounded-md border border-[#dbeafe] bg-[#f8fbff] p-4">
            <p className="text-sm font-semibold text-[#1d4ed8]">扱い方</p>
            <p className="mt-2 text-xs leading-5 text-[#334155]">
              ワンキャリア等の通過ES本文は転載せず、設問への入り方、企業理解の接続、強い語彙、避けるべき汎用表現だけを抽出します。
            </p>
            <p className="mt-2 text-xs leading-5 text-[#334155]">
              ここで作ったメモは、レビューと最終稿の企業適合・語彙品質に強く反映します。
            </p>
          </div>

          {acceptedCompanyResearch && (
            <div className="rounded-md border border-[#e4e4e7] bg-white p-4">
              <p className="text-sm font-semibold text-[#18181b]">
                採用済み企業理解
              </p>
              <p className="mt-2 line-clamp-6 text-xs leading-5 text-[#52525b]">
                {acceptedCompanyResearch.companyUnderstandingMemo}
              </p>
            </div>
          )}

          {benchmarkResearchError && (
            <p className="rounded-md border border-[#f0c36a] bg-[#fff8e1] px-3 py-2 text-xs leading-5 text-[#7c4a03]">
              {benchmarkResearchError}
            </p>
          )}
        </section>

        <section className="min-w-0 space-y-4">
          {isResearchingBenchmark && (
            <div className="rounded-md border border-[#dbeafe] bg-[#f8fbff] px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-[#93c5fd] bg-white">
                  <span className="size-2 animate-pulse rounded-full bg-[#2563eb]" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#1d4ed8]">
                    参考ESの構成を探索中
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#334155]">
                    通過ES本文の再現を避けながら、公開情報から型・語彙・弱い表現だけを抽出しています。
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-md border border-[#e4e4e7] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionHeader title="ベンチマークメモ" icon={FileText} />
              {benchmarkResearch && (
                <span className="rounded-md bg-[#e7f5ea] px-2 py-1 text-xs font-semibold text-[#14532d]">
                  自動生成済み
                </span>
              )}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <TextArea
                label="通過ESの型"
                value={benchmarkNotes.passedEssayPatterns}
                onChange={(value) => updateBenchmarkNote("passedEssayPatterns", value)}
              />
              <TextArea
                label="強い語彙・言い回し"
                value={benchmarkNotes.strongPhrases}
                onChange={(value) => updateBenchmarkNote("strongPhrases", value)}
              />
              <TextArea
                label="弱い汎用表現"
                value={benchmarkNotes.weakGenericPhrases}
                onChange={(value) => updateBenchmarkNote("weakGenericPhrases", value)}
              />
              <TextArea
                label="構成ヒント"
                value={benchmarkNotes.structureHints}
                onChange={(value) => updateBenchmarkNote("structureHints", value)}
              />
            </div>
          </div>

          {benchmarkResearch && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-md border border-[#e4e4e7] bg-white p-4">
                <SectionHeader title="参照ソース" icon={Link2} />
                {benchmarkResearch.sources.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {benchmarkResearch.sources.map((source) => (
                      <a
                        key={`${source.title}-${source.url}`}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-md border border-[#e4e4e7] bg-[#fafafa] px-3 py-2 hover:border-[#18181b] hover:bg-white"
                      >
                        <span className="block text-sm font-semibold text-[#18181b]">
                          {source.title}
                        </span>
                        <span className="mt-1 block text-xs text-[#71717a]">
                          {getSourceDomain(source.url)}
                        </span>
                        {source.note && (
                          <span className="mt-2 block text-xs leading-5 text-[#52525b]">
                            {source.note}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-md border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-3 py-3 text-xs leading-5 text-[#475569]">
                    検索なしの雛形、または参照ソース未取得の結果です。必要なら手動メモで補強してください。
                  </p>
                )}
              </div>

              <div className="rounded-md border border-[#e4e4e7] bg-white p-4">
                <SectionHeader title="注意事項" icon={CircleAlert} />
                <div className="mt-3 space-y-2">
                  {benchmarkResearch.warnings.map((warning) => (
                    <p
                      key={warning}
                      className="rounded-md border border-[#f0c36a] bg-[#fff8e1] px-3 py-2 text-xs leading-5 text-[#7c4a03]"
                    >
                      {warning}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </PageBody>
  );
}

function DocumentIntakePanel({
  essaySourceType,
  documentExtraction,
  isExtractingDocument,
  documentExtractionError,
  onDocumentUpload,
  onAcceptExtractedCandidate,
  onAcceptExtractedFullText,
}: {
  essaySourceType: EssaySourceType;
  documentExtraction: DocumentExtractionResult | null;
  isExtractingDocument: boolean;
  documentExtractionError: string | null;
  onDocumentUpload: (file: File) => void;
  onAcceptExtractedCandidate: (candidate: DocumentExtractionCandidate) => void;
  onAcceptExtractedFullText: () => void;
}) {
  const sourceLabel: Record<EssaySourceType, string> = {
    sample: "サンプル",
    text: "本文",
    markdown: "Markdown",
    pdf: "PDF",
  };

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onDocumentUpload(file);
    event.target.value = "";
  }

  return (
    <div className="mt-3 rounded-md border border-[#e4e4e7] bg-[#fafafa] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#71717a]">
            原稿ファイル
          </p>
          <p className="mt-1 text-sm text-[#27272a]">
            PDF / Markdown / テキストを読み込み、抽出結果を確認してからES本文に採用します。
          </p>
        </div>
        <span className="rounded-full border border-[#d4d4d8] bg-white px-3 py-1 text-xs font-semibold text-[#27272a]">
          入力: {sourceLabel[essaySourceType]}
        </span>
      </div>

      <label className="mt-3 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-[#a1a1aa] bg-white px-3 py-3 text-sm font-semibold text-[#18181b] hover:border-[#18181b] hover:bg-[#f4faf6]">
        {isExtractingDocument
          ? "原稿を読み込み中"
          : "PDF / Markdown / テキスト原稿を選択"}
        <input
          aria-label="ES原稿ファイル"
          type="file"
          accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
          className="hidden"
          disabled={isExtractingDocument}
          onChange={handleFileChange}
        />
      </label>

      {documentExtractionError && (
        <p className="mt-3 rounded-md border border-[#f0c36a] bg-[#fff8e1] px-3 py-2 text-xs leading-5 text-[#7c4a03]">
          {documentExtractionError}
        </p>
      )}

      {documentExtraction && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 text-xs text-[#71717a] sm:grid-cols-3">
            <Metric label="ファイル" value={documentExtraction.fileName} />
            <Metric
              label="抽出文字数"
              value={`${documentExtraction.cleanedText.length}字`}
            />
            <Metric
              label="ページ"
              value={
                documentExtraction.pageCount
                  ? `${documentExtraction.pageCount}`
                  : "-"
              }
            />
          </div>

          {documentExtraction.warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-md border border-[#f0c36a] bg-[#fff8e1] px-3 py-2 text-xs leading-5 text-[#7c4a03]"
            >
              {warning}
            </p>
          ))}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#71717a]">
              抽出候補
            </p>
            {documentExtraction.candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => onAcceptExtractedCandidate(candidate)}
                className="w-full rounded-md border border-[#e4e4e7] bg-white px-3 py-2 text-left hover:border-[#18181b]"
              >
                <span className="text-xs font-semibold text-[#18181b]">
                  {candidate.label} / 抽出信頼度:{" "}
                  {getConfidenceLabel(candidate.confidence)}
                </span>
                <span className="mt-1 block text-xs text-[#71717a]">
                  {candidate.question}
                </span>
                <span className="mt-2 block text-sm leading-6 text-[#27272a]">
                  {candidate.text.slice(0, 180)}
                  {candidate.text.length > 180 ? "..." : ""}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onAcceptExtractedFullText}
            className="w-full rounded-md border border-[#18181b] bg-[#18181b] px-3 py-2 text-sm font-semibold text-white hover:bg-[#27272a]"
          >
            抽出全文をES本文として採用
          </button>
        </div>
      )}
    </div>
  );
}

function CompanyIdentityCard({
  applicationTarget,
  status = "idle",
  compact = false,
  identityUrl,
}: {
  applicationTarget: ApplicationTarget;
  status?: CompanyResearchStatus;
  compact?: boolean;
  identityUrl?: string;
}) {
  const referenceUrl = identityUrl || getCompanyReferenceUrl(applicationTarget);
  const domain = getSourceDomain(referenceUrl);
  const initials =
    applicationTarget.companyName.trim().slice(0, 2).toUpperCase() || "Co";
  const statusLabel =
    status === "accepted"
      ? "企業調査済み"
      : referenceUrl
        ? "参考URLあり"
        : "手入力情報";

  return (
    <div
      className={`rounded-md border border-[#e4e4e7] bg-white ${
        compact ? "px-3 py-3" : "px-3 py-4"
      }`}
    >
      <div className="flex items-start gap-3">
        <CompanyLogo
          key={domain || applicationTarget.companyName}
          url={referenceUrl}
          companyName={applicationTarget.companyName}
          fallback={initials}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">
              {applicationTarget.companyName || "企業名未入力"}
            </p>
            <span className="rounded-md border border-[#d4d4d8] bg-[#fafafa] px-2 py-0.5 text-[11px] font-semibold text-[#71717a]">
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-[#71717a]">
            {applicationTarget.industry || "業界未入力"}
            {applicationTarget.position ? ` / ${applicationTarget.position}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#71717a]">
            <span className="rounded-md bg-[#f4f4f5] px-2 py-1">
              ドメイン: {domain || "未設定"}
            </span>
            {applicationTarget.corporateNumber && (
              <span className="rounded-md bg-[#e7f5ea] px-2 py-1 text-[#14532d]">
                法人番号: {applicationTarget.corporateNumber}
              </span>
            )}
            <span className="rounded-md bg-[#f4f4f5] px-2 py-1">
              ロゴ取得: {domain ? "候補あり" : "未確認"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompanyScopeControl({
  value,
  onChange,
}: {
  value: NonNullable<ApplicationTarget["companyScope"]>;
  onChange: (value: NonNullable<ApplicationTarget["companyScope"]>) => void;
}) {
  const options: Array<{
    value: NonNullable<ApplicationTarget["companyScope"]>;
    label: string;
    description: string;
  }> = [
    {
      value: "auto",
      label: "自動判定",
      description: "社名とURLから国内法人/外資ブランドを推定",
    },
    {
      value: "domestic",
      label: "国内法人",
      description: "法人番号・日経会社情報・IRを固定欄に強く反映",
    },
    {
      value: "foreign",
      label: "外資ブランド",
      description: "公式サイト/公式採用を優先し、日本法人DBは補助扱い",
    },
  ];

  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-[#52525b]">企業区分</p>
      <div className="grid gap-1 rounded-md border border-[#e4e4e7] bg-[#fafafa] p-1 sm:grid-cols-3">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded px-2 py-2 text-left transition ${
                active
                  ? "bg-[#18181b] text-white"
                  : "bg-white text-[#52525b] hover:bg-[#f4f4f5]"
              }`}
            >
              <span className="block text-xs font-semibold">{option.label}</span>
              <span
                className={`mt-1 block text-[10px] leading-4 ${
                  active ? "text-[#e4e4e7]" : "text-[#71717a]"
                }`}
              >
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompanyLogo({
  url,
  companyName,
  fallback,
}: {
  url?: string;
  companyName: string;
  fallback: string;
}) {
  const logoUrls = getCompanyLogoUrls(url, companyName);
  const [logoIndex, setLogoIndex] = useState(0);
  const src = logoUrls[logoIndex];

  return (
    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#e4e4e7] bg-white text-sm font-semibold text-[#18181b]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="max-h-8 max-w-9 object-contain"
          referrerPolicy="no-referrer"
          onError={() => setLogoIndex((current) => current + 1)}
        />
      ) : (
        fallback
      )}
    </div>
  );
}

function CompanyResearchProgress({
  companyName,
  step,
}: {
  companyName: string;
  step: CompanyResearchProgressStep;
}) {
  return (
    <div className="rounded-md border border-[#dbeafe] bg-[#f8fbff] px-3 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-[#93c5fd] bg-white">
          <span className="size-2 animate-pulse rounded-full bg-[#2563eb]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[#1d4ed8]">
            {companyName} / {step.label}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#334155]">{step.detail}</p>
          <p className="mt-2 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-[#475569]">
            確認対象: {step.searchFocus}
          </p>
        </div>
      </div>
    </div>
  );
}

function SourceIcon({ url, title }: { url?: string; title: string }) {
  const faviconUrl = getFaviconUrl(url);
  const fallback = title.trim().slice(0, 1).toUpperCase() || "S";

  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#e4e4e7] bg-[#f4f4f5] text-[10px] font-semibold text-[#18181b]">
      {faviconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={faviconUrl}
          alt=""
          className="size-4 rounded-sm"
          referrerPolicy="no-referrer"
        />
      ) : (
        fallback
      )}
    </span>
  );
}

function CompanyResearchPanel({
  research,
  status,
  onAccept,
  onDiscard,
}: {
  research: CompanyResearchResponse;
  status: CompanyResearchStatus;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const isAccepted = status === "accepted";
  const fetchedCount = research.sources.filter(
    (source) => source.accessStatus === "fetched",
  ).length;
  const failedCount = research.sources.filter(
    (source) => source.accessStatus === "failed",
  ).length;
  const primaryCount = research.sources.filter(
    (source) => source.sourceTier === "primary",
  ).length;
  const cautionCount =
    research.recentDevelopments.filter((item) =>
      ["use_with_caution", "do_not_use"].includes(item.esUseRecommendation),
    ).length +
    research.evidenceDigest.filter((item) =>
      ["use_with_caution", "do_not_use"].includes(item.useRecommendation),
    ).length;
  const identity = research.identitySummary;
  const primaryCompanyUrl = getPrimaryCompanyUrl(research);
  const sourceLookup = createCompanySourceLookup(research);
  const directEvidence = research.evidenceDigest.filter(
    (item) => item.useRecommendation === "direct_use",
  );
  const leadEvidence =
    directEvidence.length > 0
      ? directEvidence.slice(0, 2)
      : research.evidenceDigest.slice(0, 2);
  const companyClaims = research.companyClaims ?? [];
  const adoptedClaims = companyClaims.filter((claim) => claim.adopted);
  const businessClaims = adoptedClaims.filter(
    (claim) => claim.claimType === "business_summary",
  );
  const roleFitClaims = adoptedClaims.filter(
    (claim) => claim.claimType === "role_fit",
  );
  const claimSignals = [
    ["確認済み", adoptedClaims.filter((claim) => claim.verification === "supported").length],
    ["要確認", companyClaims.filter((claim) => claim.verification === "weak").length],
    ["未確認", companyClaims.filter((claim) => claim.verification === "unverified").length],
    ["矛盾", companyClaims.filter((claim) => claim.verification === "conflicted").length],
  ] as const;
  const sourceSignals = [
    ["取得", fetchedCount],
    ["失敗", failedCount],
    ["一次情報", primaryCount],
    ["公的", research.sourceCoverage.publicRegistry],
    ["公式", research.sourceCoverage.official],
    ["注意", cautionCount],
    ["未確認", research.unknowns.length],
  ] as const;

  return (
    <div
      className={`rounded-md border ${
        isAccepted
          ? "border-[#bbf7d0] bg-[#f7fdf9]"
          : "border-[#e4e4e7] bg-[#fafafa]"
      }`}
    >
      <div className="border-b border-[#e4e4e7] bg-white px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">企業情報レポート</p>
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                  isAccepted
                    ? "bg-[#18181b] text-white"
                    : "bg-[#e7f5ea] text-[#18181b]"
                }`}
              >
                {isAccepted ? "採用済み" : "確認待ち"}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#71717a]">
              {getResearchAccessModeLabel(research.accessMode)} / 信頼度:{" "}
              {getConfidenceLabel(research.confidence)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAccept}
              disabled={isAccepted}
              className="flex items-center justify-center gap-2 rounded-md bg-[#18181b] px-3 py-2 text-xs font-semibold text-white hover:bg-[#27272a] disabled:cursor-not-allowed disabled:bg-[#8b948f]"
            >
              <Check size={13} />
              {isAccepted ? "採用済み" : "レビューに採用"}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="flex items-center justify-center gap-2 rounded-md border border-[#e4e4e7] bg-white px-3 py-2 text-xs font-semibold hover:bg-[#f4f4f5]"
            >
              <X size={13} />
              破棄
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            <CompanyIdentityCard
              applicationTarget={{
                industry: research.industry,
                companyName: research.companyName,
                corporateNumber: research.identitySummary.corporateNumber,
                position: research.position,
                companyMemo: research.companyUnderstandingMemo,
                referenceUrls: primaryCompanyUrl
                  ? [
                      {
                        id: "primary-company-identity",
                        title: "企業公式サイト",
                        url: primaryCompanyUrl,
                        sourceType: "url" as const,
                      },
                    ]
                  : [],
              }}
              status={status}
              compact
              identityUrl={primaryCompanyUrl}
            />
            <p className="text-sm leading-6 text-[#3f3f46]">
              {research.companyUnderstandingMemo}
            </p>
          </div>

          <div className="rounded-md border border-[#e4e4e7] bg-[#fafafa] px-3 py-3">
            <p className="text-xs font-semibold text-[#71717a]">出典の状態</p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {sourceSignals.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-[#ececef] pb-1 last:border-b-0">
                  <span className="text-[11px] text-[#71717a]">{label}</span>
                  <span className="text-sm font-semibold text-[#18181b]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!isAccepted && (
        <p className="mx-4 mt-4 rounded-md border border-[#f0c36a] bg-[#fff8e1] px-3 py-2 text-xs leading-5 text-[#7c4a03]">
          この企業理解はまだESレビューに採用されていません。内容を確認してから採用してください。
        </p>
      )}

      <div className="grid gap-4 border-t border-[#e4e4e7] px-4 py-4 xl:grid-cols-[0.9fr_1.1fr]">
        <ResearchSection title="証拠台帳">
          <div className="grid grid-cols-4 gap-2">
            {claimSignals.map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-[#ececef] bg-white px-2 py-2 text-center"
              >
                <p className="text-[10px] font-semibold text-[#71717a]">
                  {label}
                </p>
                <p className="mt-1 text-sm font-semibold text-[#18181b]">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {companyClaims.slice(0, 8).map((claim) => (
              <CompanyClaimCard
                key={claim.id}
                claim={claim}
                sourceLookup={sourceLookup}
              />
            ))}
          </div>
        </ResearchSection>

        <ResearchSection title="出典にもとづく使える材料">
          <div className="space-y-2">
            {leadEvidence.map((item) => (
              <EvidenceDigestCard
                key={`${item.category}-${item.title}`}
                item={item}
                sourceLookup={sourceLookup}
              />
            ))}
          </div>
        </ResearchSection>
      </div>

      <div className="grid gap-4 px-4 py-4 xl:grid-cols-[0.9fr_1.1fr]">
        <ResearchSection title="ESレビューで見る観点">
          <div className="space-y-2">
            {research.esReviewFocus.map((focus) => (
              <p
                key={focus}
                className="border-l-2 border-[#18181b] bg-white px-3 py-2 text-sm leading-6 text-[#1f2937]"
              >
                {focus}
              </p>
            ))}
          </div>
        </ResearchSection>

        <ResearchSection title="Claimから作るES論点">
          <div className="space-y-2">
            {[...businessClaims, ...roleFitClaims]
              .slice(0, 4)
              .map((claim) => (
                <p
                  key={claim.id}
                  className="rounded-md border border-[#ececef] bg-white px-3 py-2 text-xs leading-5 text-[#3f3f46]"
                >
                  {claim.text}
                </p>
              ))}
          </div>
        </ResearchSection>
      </div>

      <div className="grid gap-4 border-t border-[#e4e4e7] px-4 py-4 xl:grid-cols-[0.9fr_1.1fr]">
        <ResearchSection title="法人・基本情報">
          <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
            <ResearchInfo label="正式名称" value={identity.legalName} />
            <ResearchInfo label="管轄" value={identity.jurisdiction} />
            <ResearchInfo label="法人種別" value={identity.entityKind} />
            <ResearchInfo label="法人番号" value={identity.corporateNumber} />
            <ResearchInfo label="所在地" value={identity.headquarters} />
            <ResearchInfo label="業種分類" value={identity.industryClassification} />
            <ResearchInfo label="証券コード" value={identity.securitiesCode} />
            <ResearchInfo label="上場市場" value={identity.listingMarket} />
          </div>
        </ResearchSection>

        <ResearchSection title="事業説明">
          <div className="space-y-2">
            {(businessClaims.length > 0
              ? businessClaims.map((claim) => claim.text)
              : research.businessSummary
            ).map((item) => (
              <p
                key={item}
                className="rounded-md border border-[#ececef] bg-white px-3 py-2 text-xs leading-5"
              >
                {item}
              </p>
            ))}
          </div>
        </ResearchSection>
      </div>

      <div className="grid gap-4 px-4 pb-4 xl:grid-cols-2">
        <ResearchSection title="財務情報">
          {research.financialHighlights.length === 0 ? (
            <p className="rounded-md border border-[#ececef] bg-white px-3 py-2 text-xs text-[#71717a]">
              財務情報は未確認です。
            </p>
          ) : (
            research.financialHighlights.map((item) => (
              <div
                key={`${item.label}-${item.period}`}
                className="rounded-md border border-[#ececef] bg-white px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{item.label}</p>
                  <span className="rounded-md bg-[#f4f4f5] px-2 py-0.5 text-[10px] text-[#52525b]">
                    信頼度: {getConfidenceLabel(item.confidence)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold">{item.value}</p>
                <p className="mt-1 text-[11px] text-[#71717a]">
                  {item.period} / 出典:{" "}
                  {item.sourceId
                    ? getSourceDisplayName(item.sourceId, sourceLookup)
                    : "未確認"}
                </p>
              </div>
            ))
          )}
        </ResearchSection>

        <ResearchSection title="最近の動向">
          {research.recentDevelopments.length === 0 ? (
            <p className="rounded-md border border-[#ececef] bg-white px-3 py-2 text-xs text-[#71717a]">
              最近の動向は未確認です。
            </p>
          ) : (
            research.recentDevelopments.map((item) => (
              <div
                key={`${item.title}-${item.date}`}
                className="rounded-md border border-[#ececef] bg-white px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold">{item.title}</p>
                      <UseRecommendationBadge value={item.esUseRecommendation} />
                    </div>
                    <p className="mt-1 text-[11px] text-[#71717a]">
                      {item.date || "日付未確認"} /{" "}
                      {getSourceTypeLabel(item.sourceType)}
                    </p>
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold underline"
                    >
                      <Link2 size={12} />
                      出典を開く
                    </a>
                  )}
                </div>
                <p className="mt-2 text-xs leading-5 text-[#3f3f46]">
                  {item.summary}
                </p>
                {item.riskNote && (
                  <p className="mt-2 rounded-md bg-[#fff8e1] px-2 py-1 text-[11px] leading-5 text-[#7c4a03]">
                    {item.riskNote}
                  </p>
                )}
              </div>
            ))
          )}
        </ResearchSection>
      </div>

      <details className="border-t border-[#e4e4e7] px-4 py-3 text-xs">
        <summary className="cursor-pointer font-semibold">
          参照ソースと未確認事項
        </summary>
        <div className="mt-2 space-y-2">
          {research.sources.map((source) => (
            <div
              key={source.id}
              className="rounded-md border border-[#ececef] bg-white px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <SourceIcon url={source.url} title={source.title} />
                    <p className="font-semibold">{source.title}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <SourceAccessBadge status={source.accessStatus} />
                    <SourceTierBadge tier={source.sourceTier} />
                    <span className="text-[#71717a]">
                      {getSourceTypeLabel(source.sourceType)}
                    </span>
                  </div>
                </div>
                {source.url && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold underline"
                  >
                    <Link2 size={12} />
                    {getSourceLinkLabel(source)}
                  </a>
                )}
              </div>
              <p className="mt-2 line-clamp-4 leading-5 text-[#71717a]">
                {source.excerpt}
              </p>
            </div>
          ))}
          {research.unknowns.map((unknown) => (
            <p
              key={unknown}
              className="rounded-md border border-[#f0c36a] bg-[#fff8e1] px-3 py-2 leading-5 text-[#7c4a03]"
            >
              未確認: {unknown}
            </p>
          ))}
        </div>
      </details>
    </div>
  );
}

function ResearchSection({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-xs font-semibold text-[#71717a]">
        {title}
      </p>
      {children}
    </div>
  );
}

function ResearchInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#ececef] bg-white px-3 py-2">
      <p className="text-[10px] font-semibold text-[#71717a]">
        {label}
      </p>
      <p className="mt-1 min-h-5 text-xs font-semibold text-[#18181b]">
        {getDisplayValue(value)}
      </p>
    </div>
  );
}

function CompanyClaimCard({
  claim,
  sourceLookup,
}: {
  claim: CompanyResearchResponse["companyClaims"][number];
  sourceLookup: Map<string, CompanyResearchSource>;
}) {
  const sourceNames = claim.sourceIds
    .map((sourceId) => getSourceDisplayName(sourceId, sourceLookup))
    .filter(Boolean);

  return (
    <div className="rounded-md border border-[#ececef] bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#18181b]">
            {claim.label}
          </span>
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${getClaimVerificationClassName(
              claim.verification,
            )}`}
          >
            {getClaimVerificationLabel(claim.verification)}
          </span>
        </div>
        <span className="text-[10px] font-semibold text-[#71717a]">
          {claim.confidence}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#3f3f46]">{claim.text}</p>
      <p className="mt-1 text-[11px] leading-5 text-[#71717a]">
        出典: {sourceNames.length > 0 ? sourceNames.join(" / ") : "未確認"}
      </p>
      {claim.note && (
        <p className="mt-1 text-[11px] leading-5 text-[#71717a]">
          {claim.note}
        </p>
      )}
    </div>
  );
}

function getClaimVerificationLabel(
  verification: CompanyResearchResponse["companyClaims"][number]["verification"],
) {
  const labels = {
    supported: "確認済み",
    weak: "要確認",
    unverified: "未確認",
    conflicted: "矛盾あり",
  };
  return labels[verification];
}

function getClaimVerificationClassName(
  verification: CompanyResearchResponse["companyClaims"][number]["verification"],
) {
  const classNames = {
    supported: "bg-[#e7f5ea] text-[#14532d]",
    weak: "bg-[#fff8e1] text-[#7c4a03]",
    unverified: "bg-[#f4f4f5] text-[#52525b]",
    conflicted: "bg-[#fee2e2] text-[#991b1b]",
  };
  return classNames[verification];
}

function EvidenceDigestCard({
  item,
  sourceLookup,
}: {
  item: CompanyResearchResponse["evidenceDigest"][number];
  sourceLookup: Map<string, CompanyResearchSource>;
}) {
  const sourceNames = item.sourceIds
    .map((sourceId) => getSourceDisplayName(sourceId, sourceLookup))
    .filter(Boolean);

  return (
    <div className="rounded-md border border-[#ececef] bg-white px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-[#f4f4f5] px-2 py-0.5 text-[10px] font-semibold text-[#52525b]">
          {getEvidenceCategoryLabel(item.category)}
        </span>
        <UseRecommendationBadge value={item.useRecommendation} />
      </div>
      <p className="mt-2 text-sm font-semibold text-[#18181b]">{item.title}</p>
      <p className="mt-2 text-xs leading-5 text-[#3f3f46]">{item.summary}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-md bg-[#f8fafc] px-2 py-2">
          <p className="text-[10px] font-semibold text-[#64748b]">ESでの使い方</p>
          <p className="mt-1 text-[11px] leading-5 text-[#334155]">
            {item.userRelevance || "企業理解の背景として確認します。"}
          </p>
        </div>
        <div className="rounded-md bg-[#fff8e1] px-2 py-2">
          <p className="text-[10px] font-semibold text-[#7c4a03]">注意点</p>
          <p className="mt-1 text-[11px] leading-5 text-[#7c4a03]">
            {item.riskNote || "ES本文では出典と文脈を確認してから使います。"}
          </p>
        </div>
      </div>
      {sourceNames.length > 0 && (
        <p className="mt-2 text-[11px] leading-5 text-[#71717a]">
          出典: {sourceNames.join(" / ")}
        </p>
      )}
    </div>
  );
}

function UseRecommendationBadge({
  value,
}: {
  value:
    | "direct_use"
    | "background_only"
    | "use_with_caution"
    | "do_not_use";
}) {
  const config = {
    direct_use: {
      label: "直接使用可",
      className: "bg-[#e7f5ea] text-[#14532d]",
    },
    background_only: {
      label: "背景理解",
      className: "bg-[#e8f1ff] text-[#1e3a8a]",
    },
    use_with_caution: {
      label: "注意",
      className: "bg-[#fff8e1] text-[#7c4a03]",
    },
    do_not_use: {
      label: "非推奨",
      className: "bg-[#fee2e2] text-[#991b1b]",
    },
  }[value];

  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function SourceTierBadge({
  tier,
}: {
  tier: "primary" | "public" | "secondary" | "user" | "model";
}) {
  const config = {
    primary: { label: "一次情報", className: "bg-[#e8f1ff] text-[#1e3a8a]" },
    public: { label: "公的", className: "bg-[#e7f5ea] text-[#14532d]" },
    secondary: { label: "二次情報", className: "bg-[#f4f4f5] text-[#52525b]" },
    user: { label: "ユーザー", className: "bg-[#f4f4f5] text-[#52525b]" },
    model: { label: "未検証", className: "bg-[#fff8e1] text-[#7c4a03]" },
  }[tier];

  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function ReviewPage({
  reviewRequest,
  reviewResponse,
  reviewError,
  acceptedCompanyResearch,
  onSelectAudit,
}: {
  reviewRequest: ReviewRequest | null;
  reviewResponse: ReviewResponse | null;
  reviewError: string | null;
  acceptedCompanyResearch: CompanyResearchResponse | null;
  onSelectAudit: (item: EvidenceAuditItem) => void;
}) {
  const [expandedCriterion, setExpandedCriterion] = useState<
    ReviewCriterion | "none" | null
  >(null);

  if (reviewError) {
    return (
      <PageBody>
        <EmptyState title="レビュー生成に失敗しました" description={reviewError} />
      </PageBody>
    );
  }

  if (!reviewResponse) {
    return (
      <PageBody>
        <EmptyState
          title="レビューはまだ生成されていません"
          description="左ナビのレビュー実行ボタンから開始してください。"
        />
      </PageBody>
    );
  }

  const reviewTarget = reviewRequest?.applicationTarget;
  const activeExpandedCriterion =
    expandedCriterion === "none"
      ? null
      : expandedCriterion ?? reviewResponse.criterionReviews[0]?.criterion ?? null;
  const activeCriterionReview = reviewResponse.criterionReviews.find(
    (criterion) => criterion.criterion === activeExpandedCriterion,
  );

  return (
    <PageBody>
      <PageHeader
        label="レビュー"
        title={reviewResponse.summary.headline}
        description={reviewResponse.summary.overallComment}
      />

      <div className="grid gap-6">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {reviewResponse.criterionReviews.map((criterion) => {
            const isExpanded = activeExpandedCriterion === criterion.criterion;
            return (
              <button
                key={criterion.criterion}
                type="button"
                className={`rounded-md border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-[#93c5fd] hover:shadow-sm ${
                  isExpanded ? "border-[#2563eb] shadow-sm ring-2 ring-[#dbeafe]" : "border-[#e4e4e7]"
                }`}
                onClick={() =>
                  setExpandedCriterion(isExpanded ? "none" : criterion.criterion)
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[#71717a]">
                      {criterionLabel(criterion.criterion)}
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {renderStars(criterion.starRating)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#f4f4f5] px-2 py-1 text-[11px] font-semibold text-[#52525b]">
                    {criterion.evidence.length}件
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#52525b]">
                  {criterion.comment}
                </p>
                {criterion.deductionReason && (
                  <p className="mt-2 rounded-md bg-[#fff7ed] px-2 py-1.5 text-[11px] leading-5 text-[#9a3412]">
                    {truncateText(criterion.deductionReason, 56)}
                  </p>
                )}
              </button>
            );
          })}
        </section>
        {activeCriterionReview && (
          <section className="rounded-md border border-[#93c5fd] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#2563eb]">
                  詳細診断 / {criterionLabel(activeCriterionReview.criterion)}
                </p>
                <h3 className="mt-1 text-base font-semibold">
                  {activeCriterionReview.comment}
                </h3>
              </div>
              <span className="rounded-md bg-[#eff6ff] px-2 py-1 text-xs font-semibold text-[#1d4ed8]">
                根拠 {activeCriterionReview.evidence.length}件
              </span>
            </div>
            <CriterionDetail criterion={activeCriterionReview} />
          </section>
        )}

        <section className="rounded-md border border-[#e4e4e7] bg-[#fafafa] p-4">
          <SectionHeader title="企業理解" icon={SearchCheck} />
          {reviewTarget && (
            <div className="mt-3">
              <CompanyIdentityCard
                applicationTarget={reviewTarget}
                status={acceptedCompanyResearch ? "accepted" : "idle"}
                compact
                identityUrl={
                  acceptedCompanyResearch
                    ? getPrimaryCompanyUrl(acceptedCompanyResearch)
                    : undefined
                }
              />
            </div>
          )}
          {acceptedCompanyResearch && (
            <div className="mt-3 rounded-md border border-[#bbf7d0] bg-white px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    採用済み企業情報レポート
                  </p>
                  <p className="mt-1 text-xs text-[#71717a]">
                    {getResearchAccessModeLabel(
                      acceptedCompanyResearch.accessMode,
                    )}{" "}
                    / 信頼度:{" "}
                    {getConfidenceLabel(acceptedCompanyResearch.confidence)}
                  </p>
                </div>
                <span className="rounded-md bg-[#18181b] px-2 py-1 text-[11px] font-semibold text-white">
                  レビューに採用
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#3f3f46]">
                {acceptedCompanyResearch.companyUnderstandingMemo}
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <ResearchInfo
                  label="法人番号"
                  value={acceptedCompanyResearch.identitySummary.corporateNumber}
                />
                <ResearchInfo
                  label="業種分類"
                  value={
                    acceptedCompanyResearch.identitySummary.industryClassification
                  }
                />
                <ResearchInfo
                  label="証券コード"
                  value={acceptedCompanyResearch.identitySummary.securitiesCode}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 lg:grid-cols-6">
                <Metric
                  label="公的情報"
                  value={String(
                    acceptedCompanyResearch.sourceCoverage.publicRegistry,
                  )}
                />
                <Metric
                  label="公式"
                  value={String(acceptedCompanyResearch.sourceCoverage.official)}
                />
                <Metric
                  label="IR・開示"
                  value={String(acceptedCompanyResearch.sourceCoverage.financial)}
                />
                <Metric
                  label="メディア"
                  value={String(acceptedCompanyResearch.sourceCoverage.media)}
                />
                <Metric
                  label="本人入力"
                  value={String(
                    acceptedCompanyResearch.sourceCoverage.userProvided,
                  )}
                />
                <Metric
                  label="未検証"
                  value={String(
                    acceptedCompanyResearch.sourceCoverage.modelKnowledge,
                  )}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {acceptedCompanyResearch.sources.map((source) => (
                  <span
                    key={source.id}
                    className="inline-flex items-center gap-1 rounded-md border border-[#ececef] bg-[#fafafa] px-2 py-1 text-[11px]"
                  >
                    <SourceIcon url={source.url} title={source.title} />
                    <SourceAccessBadge status={source.accessStatus} />
                    {source.title}
                  </span>
                ))}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {acceptedCompanyResearch.esReviewFocus.map((focus) => (
                  <p
                    key={focus}
                    className="rounded-md border border-[#ececef] bg-[#fafafa] px-3 py-2 text-xs leading-5"
                  >
                    {focus}
                  </p>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-xs font-semibold text-[#71717a]">
                参照した情報
              </p>
              <div className="mt-2 overflow-hidden rounded-md border border-[#e4e4e7] bg-white">
                {reviewResponse.sources.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-[#71717a]">
                    参照ソースはまだありません。企業メモまたは参考URLを追加してください。
                  </p>
                ) : (
                  reviewResponse.sources.map((source) => (
                    <div
                      key={source.id}
                      className="border-t border-[#ececef] px-3 py-3 first:border-t-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{source.title}</p>
                          <p className="mt-1 text-xs text-[#71717a]">
                            {getSourceTypeLabel(source.sourceType)} / 確認項目:{" "}
                            {source.usedFor.map(getUsedForLabel).join("、")}
                          </p>
                        </div>
                        {source.url && (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold underline"
                          >
                            <Link2 size={12} />
                            {getSourceLinkLabel(source)}
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-[#71717a]">
                企業理解の状態
              </p>
              <div className="mt-2 space-y-2">
                <div className="rounded-md border border-[#e4e4e7] bg-white px-3 py-3">
                  <p className="text-sm font-semibold">
                    {acceptedCompanyResearch
                      ? `企業情報レポート: ${getResearchAccessModeLabel(
                          acceptedCompanyResearch.accessMode,
                        )}`
                      : reviewResponse.sources.some((source) => source.sourceType === "model_knowledge")
                      ? "未検証情報を含む"
                      : "入力情報のみ"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#71717a]">
                    {acceptedCompanyResearch
                      ? "採用済み企業情報レポート、企業メモ、参考URLを根拠として扱っています。URL本文の取得成否は参照ソース欄で確認できます。"
                      : "入力された企業メモと参考URLを根拠として扱います。企業情報レポートを採用すると、URL取得状況と未確認事項もレビュー根拠として表示されます。"}
                  </p>
                </div>
                {reviewResponse.warnings.map((warning) => (
                  <div
                    key={`${warning.code}-${warning.message}`}
                    className="rounded-md border border-[#f0c36a] bg-[#fff8e1] px-3 py-3"
                  >
                    <p className="text-xs font-semibold text-[#7c4a03]">
                      {getWarningSeverityLabel(warning.severity)} /{" "}
                      {getWarningCodeLabel(warning.code)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#7c4a03]">
                      {warning.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader title="根拠監査" icon={ShieldCheck} />
          <div className="mt-3 overflow-hidden rounded-md border border-[#e4e4e7]">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-[#fafafa] text-left text-xs text-[#71717a]">
                <tr>
                  <th className="px-3 py-2">確認する主張</th>
                  <th className="px-3 py-2">確認状態</th>
                  <th className="px-3 py-2">信頼度</th>
                  <th className="px-3 py-2">出典種別</th>
                </tr>
              </thead>
              <tbody>
                {reviewResponse.evidenceAudit.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onSelectAudit(item)}
                    className="cursor-pointer border-t border-[#ececef] hover:bg-[#fafafa]"
                  >
                    <td className="px-3 py-3">{item.claimText}</td>
                    <td className="px-3 py-3">
                      <VerificationBadge status={item.verificationStatus} />
                    </td>
                    <td className="px-3 py-3">
                      {getConfidenceLabel(item.confidence)}
                    </td>
                    <td className="px-3 py-3">
                      {getSourceQualityLabel(item.sourceQuality)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {reviewRequest && (
          <details className="rounded-md border border-[#e4e4e7] bg-[#fafafa] p-3 text-xs">
            <summary className="cursor-pointer font-semibold">
              レビュー送信データを確認
            </summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap leading-5">
              {JSON.stringify(reviewRequest, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </PageBody>
  );
}

function CriterionDetail({
  criterion,
}: {
  criterion: ReviewResponse["criterionReviews"][number];
}) {
  const targetText =
    criterion.targetText || criterion.evidence[0]?.quotedOrParaphrasedEvidence || "";
  const evidenceReasoning =
    criterion.evidenceReasoning ||
    "ES本文、企業調査、本人文脈、参考ESベンチマークのうち確認できる根拠を照合して評価しています。";
  const deductionReason =
    criterion.deductionReason ||
    criterion.weaknesses.join("。") ||
    "満点にするには、本文中の根拠と企業・職種情報の接続をもう一段明確にする必要があります。";
  const revisionDirection =
    criterion.revisionDirection ||
    "対象文を、本人の行動、企業固有の論点、入社後の貢献が同じ流れで読めるように直します。";

  return (
    <div className="mt-4 grid gap-3 border-t border-[#ececef] pt-4">
      <CriterionDetailBlock label="対象文" value={targetText} tone="quote" />
      <div className="grid gap-3 xl:grid-cols-3">
        <CriterionDetailBlock label="評価理由" value={criterion.ratingRationale} />
        <CriterionDetailBlock label="減点理由" value={deductionReason} tone="warning" />
        <CriterionDetailBlock label="修正方向" value={revisionDirection} tone="action" />
      </div>
      <CriterionDetailBlock label="根拠の読み方" value={evidenceReasoning} />
      <div className="grid gap-2 md:grid-cols-2">
        <CriterionListBlock label="良い点" items={criterion.strengths} />
        <CriterionListBlock label="弱い点" items={criterion.weaknesses} />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {criterion.evidence.slice(0, 4).map((evidence, index) => (
          <p
            key={`${criterion.criterion}-${evidence.sourceId ?? index}`}
            className="rounded-md border border-[#ececef] bg-[#fafafa] px-2 py-1.5 text-[11px] leading-5 text-[#52525b]"
          >
            <span className="font-semibold">
              {getSourceQualityLabel(evidence.sourceQuality)}:
            </span>{" "}
            {evidence.quotedOrParaphrasedEvidence}
          </p>
        ))}
      </div>
    </div>
  );
}

function CriterionDetailBlock({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "quote" | "warning" | "action";
}) {
  if (!value) return null;

  const toneClass =
    tone === "quote"
      ? "border border-[#dbeafe] bg-[#eff6ff] text-[#1e3a8a]"
      : tone === "warning"
        ? "border border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]"
        : tone === "action"
          ? "border border-[#bbf7d0] bg-[#f0fdf4] text-[#14532d]"
          : "bg-[#fafafa] text-[#3f3f46]";

  return (
    <div>
      <p className="text-[11px] font-semibold text-[#71717a]">{label}</p>
      <p
        className={`mt-1 rounded-md px-3 py-2 text-xs leading-5 ${toneClass}`}
      >
        {value}
      </p>
    </div>
  );
}

function CriterionListBlock({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-md border border-[#ececef] p-3">
      <p className="text-[11px] font-semibold text-[#71717a]">{label}</p>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-[#3f3f46]">
        {items.map((item) => (
          <li key={item}>・{item}</li>
        ))}
      </ul>
    </div>
  );
}

function SuggestionsPage({
  reviewResponse,
  suggestionStatuses,
  onSelectSuggestion,
}: {
  reviewResponse: ReviewResponse;
  suggestionStatuses: Record<string, SuggestionStatus>;
  onSelectSuggestion: (item: Suggestion) => void;
}) {
  function getEvidenceSummary(suggestion: Suggestion) {
    const officialCount = suggestion.evidence.filter((evidence) =>
      ["official", "company_provided"].includes(evidence.sourceQuality),
    ).length;
    if (officialCount > 0) return `公式系 ${officialCount}件`;
    if (suggestion.evidence.length > 0) return `${suggestion.evidence.length}件`;
    return "要確認";
  }

  return (
    <PageBody>
      <PageHeader
        label="改善提案"
        title="改善提案"
        description="直すべき一文、置換案、根拠を先に確認できます。提案を選ぶと右側で採用・編集できます。"
      />
      <div className="grid gap-3 xl:grid-cols-2">
        {reviewResponse.suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => onSelectSuggestion(suggestion)}
            className="rounded-md border border-[#e4e4e7] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#93c5fd] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#71717a]">
                  {getSuggestionTypeLabel(suggestion.type)} / {getSuggestionSeverityLabel(suggestion.severity)}
                </p>
                <h3 className="mt-1 text-sm font-semibold">{suggestion.title}</h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-md bg-[#f4f4f5] px-2 py-1 text-[11px] font-semibold text-[#52525b]">
                  {getSuggestionStatusLabel(suggestionStatuses[suggestion.id])}
                </span>
                <span
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                    suggestion.evidence.length > 0
                      ? "bg-[#e7f5ea] text-[#14532d]"
                      : "bg-[#fff8e1] text-[#7c4a03]"
                  }`}
                >
                  根拠 {getEvidenceSummary(suggestion)}
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#71717a]">
              {suggestion.problem}
            </p>
            <div className="mt-3 grid gap-2">
              <p className="rounded-md border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs leading-5 text-[#9a3412]">
                <span className="font-semibold">修正前: </span>
                {truncateText(suggestion.diffHint.before, 90)}
              </p>
              <p className="rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-xs leading-5 text-[#14532d]">
                <span className="font-semibold">修正案: </span>
                {truncateText(suggestion.diffHint.after, 110)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </PageBody>
  );
}

function FinalPage({
  finalDraft,
  setFinalDraft,
  targetCount,
  acceptedCount,
  openCount,
}: {
  finalDraft: string;
  setFinalDraft: (value: string) => void;
  targetCount: number;
  acceptedCount: number;
  openCount: number;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copyFinalDraft() {
    if (!finalDraft.trim()) return;

    try {
      await copyTextToClipboard(finalDraft);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    } catch {
      setCopyStatus("failed");
      window.setTimeout(() => setCopyStatus("idle"), 2200);
    }
  }

  return (
    <PageBody>
      <PageHeader
        label="最終稿"
        title="最終稿"
        description="採用済み提案を反映した文面を、最後は自分の判断で編集します。"
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        <textarea
          value={finalDraft}
          onChange={(event) => setFinalDraft(event.target.value)}
          className="min-h-[620px] w-full resize-none rounded-md border border-[#e4e4e7] bg-white px-4 py-4 text-[15px] leading-8 outline-none focus:border-[#18181b]"
        />
        <aside className="space-y-3">
          <Metric label="文字数" value={`${finalDraft.length}/${targetCount}字`} />
          <Metric label="反映済み" value={`${acceptedCount}`} />
          <Metric label="未処理" value={`${openCount}`} />
          <button
            type="button"
            onClick={copyFinalDraft}
            disabled={!finalDraft.trim()}
            className="w-full rounded-md bg-[#18181b] px-3 py-2 text-sm font-semibold text-white hover:bg-[#27272a] disabled:cursor-not-allowed disabled:bg-[#8b948f]"
          >
            {copyStatus === "copied"
              ? "コピーしました"
              : copyStatus === "failed"
                ? "コピーに失敗"
                : "最終稿をコピー"}
          </button>
        </aside>
      </div>
    </PageBody>
  );
}

async function copyTextToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall back to the textarea path below when browser permissions reject Clipboard API.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Copy command failed");
}

function DetailDrawer({
  item,
  draftEditText,
  setDraftEditText,
  onClose,
  onAccept,
  onReject,
  onEdit,
  discussionDraft,
  setDiscussionDraft,
  discussionNotes,
  isDiscussingSuggestion,
  onAddDiscussionNote,
}: {
  item: Exclude<DrawerItem, null>;
  draftEditText: string;
  setDraftEditText: (value: string) => void;
  onClose: () => void;
  onAccept: (suggestion: Suggestion) => void;
  onReject: (suggestion: Suggestion) => void;
  onEdit: (suggestion: Suggestion, editedText: string) => void;
  discussionDraft: string;
  setDiscussionDraft: (value: string) => void;
  discussionNotes: Record<string, string[]>;
  isDiscussingSuggestion: boolean;
  onAddDiscussionNote: (suggestion: Suggestion) => void;
}) {
  return (
    <aside className="min-h-0 overflow-y-auto border-l border-[#e4e4e7] bg-[#fafafa]">
      <div className="flex items-center justify-between border-b border-[#e4e4e7] px-4 py-3">
        <p className="text-sm font-semibold">詳細</p>
        <button onClick={onClose} className="rounded p-1 hover:bg-white">
          <X size={15} />
        </button>
      </div>

      {item.kind === "audit" ? (
        <AuditDrawer item={item.item} />
      ) : (
        <SuggestionDrawer
          suggestion={item.item}
          draftEditText={draftEditText}
          setDraftEditText={setDraftEditText}
          onAccept={onAccept}
          onReject={onReject}
          onEdit={onEdit}
          discussionDraft={discussionDraft}
          setDiscussionDraft={setDiscussionDraft}
          discussionNotes={discussionNotes[item.item.id] ?? []}
          isDiscussingSuggestion={isDiscussingSuggestion}
          onAddDiscussionNote={onAddDiscussionNote}
        />
      )}
    </aside>
  );
}

function AuditDrawer({ item }: { item: EvidenceAuditItem }) {
  return (
    <div className="space-y-5 p-4">
      <div>
        <VerificationBadge status={item.verificationStatus} />
        <h2 className="mt-3 text-base font-semibold leading-6">{item.claimText}</h2>
        <p className="mt-2 text-sm leading-6 text-[#71717a]">{item.assessment}</p>
      </div>
      <Metric label="信頼度" value={getConfidenceLabel(item.confidence)} />
      <Metric label="出典品質" value={getSourceQualityLabel(item.sourceQuality)} />
      <Metric
        label="確認状況"
        value={`${Object.values(item.checkedBy).filter(Boolean).length}/3項目`}
      />
      <div>
        <p className="mb-2 text-xs font-semibold text-[#71717a]">
          根拠
        </p>
        {item.evidence.map((evidence) => (
          <div key={evidence.sourceId ?? evidence.sourceTitle} className="rounded-md border border-[#e4e4e7] bg-white p-3 text-sm">
            <p className="font-semibold">{evidence.sourceTitle}</p>
            <p className="mt-2 text-xs leading-5 text-[#71717a]">
              {evidence.quotedOrParaphrasedEvidence}
            </p>
            {evidence.url && (
              <a href={evidence.url} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline" target="_blank" rel="noreferrer">
                <Link2 size={12} />
                出典を開く
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SuggestionDrawer({
  suggestion,
  draftEditText,
  setDraftEditText,
  onAccept,
  onReject,
  onEdit,
  discussionDraft,
  setDiscussionDraft,
  discussionNotes,
  isDiscussingSuggestion,
  onAddDiscussionNote,
}: {
  suggestion: Suggestion;
  draftEditText: string;
  setDraftEditText: (value: string) => void;
  onAccept: (suggestion: Suggestion) => void;
  onReject: (suggestion: Suggestion) => void;
  onEdit: (suggestion: Suggestion, editedText: string) => void;
  discussionDraft: string;
  setDiscussionDraft: (value: string) => void;
  discussionNotes: string[];
  isDiscussingSuggestion: boolean;
  onAddDiscussionNote: (suggestion: Suggestion) => void;
}) {
  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="text-xs font-semibold text-[#71717a]">
          {getSuggestionTypeLabel(suggestion.type)} / {getSuggestionSeverityLabel(suggestion.severity)}
        </p>
        <h2 className="mt-2 text-base font-semibold">{suggestion.title}</h2>
        <p className="mt-2 rounded-md border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-sm leading-6 text-[#9a3412]">
          {suggestion.problem}
        </p>
        <p className="mt-2 text-sm leading-6 text-[#52525b]">{suggestion.rationale}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="改善効果" value={suggestion.expectedImpact} />
        <Metric
          label="根拠数"
          value={
            suggestion.evidence.length > 0
              ? `${suggestion.evidence.length}件`
              : "要確認"
          }
        />
      </div>
      <DiffBlock label="修正前" tone="remove" text={suggestion.diffHint.before} />
      <DiffBlock label="修正案" tone="add" text={suggestion.diffHint.after} />
      <div>
        <p className="mb-2 text-xs font-semibold text-[#71717a]">
          この提案の根拠
        </p>
        {suggestion.evidence.length > 0 ? (
          <div className="space-y-2">
            {suggestion.evidence.map((evidence, index) => (
              <div
                key={`${evidence.sourceId ?? evidence.sourceTitle}-${index}`}
                className="rounded-md border border-[#e4e4e7] bg-white p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {evidence.sourceTitle || "根拠ソース"}
                  </p>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      evidence.supportsClaim
                        ? "bg-[#e7f5ea] text-[#14532d]"
                        : "bg-[#fff8e1] text-[#7c4a03]"
                    }`}
                  >
                    {evidence.supportsClaim ? "支持" : "要確認"} /{" "}
                    {getSourceQualityLabel(evidence.sourceQuality)}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#71717a]">
                  {evidence.quotedOrParaphrasedEvidence}
                </p>
                {evidence.url && (
                  <a
                    href={evidence.url}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Link2 size={12} />
                    出典を開く
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-[#f0c36a] bg-[#fff8e1] px-3 py-2 text-xs leading-5 text-[#7c4a03]">
            この提案にはまだ出典が紐づいていません。採用前に企業調査または本人情報で確認してください。
          </p>
        )}
      </div>
      {suggestion.userConfirmationNeeded.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-[#71717a]">
            採用前に確認すること
          </p>
          <div className="space-y-2">
            {suggestion.userConfirmationNeeded.map((item) => (
              <p
                key={item}
                className="rounded-md border border-[#f0c36a] bg-[#fff8e1] px-3 py-2 text-xs leading-5 text-[#7c4a03]"
              >
                {item}
              </p>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-2 text-xs font-semibold text-[#71717a]">
          反映前に調整
        </p>
        <textarea
          value={draftEditText}
          onChange={(event) => setDraftEditText(event.target.value)}
          className="min-h-32 w-full resize-none rounded-md border border-[#e4e4e7] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#18181b]"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ActionButton icon={Check} label="採用" onClick={() => onAccept(suggestion)} />
        <ActionButton icon={X} label="却下" onClick={() => onReject(suggestion)} />
        <ActionButton icon={PenLine} label="編集反映" onClick={() => onEdit(suggestion, draftEditText)} />
      </div>
      <div className="rounded-md border border-[#e4e4e7] bg-[#fafafa] p-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} />
          <p className="text-sm font-semibold">この提案について議論</p>
        </div>
        <div className="mt-3 space-y-2">
          {discussionNotes.length === 0 ? (
            <p className="text-xs leading-5 text-[#71717a]">
              追加質問を書くと、この提案を再検討するためのメモが残ります。
            </p>
          ) : (
            discussionNotes.map((note, index) => (
              <p
                key={`${suggestion.id}-note-${index}`}
                className="rounded-md border border-[#ececef] bg-white px-3 py-2 text-xs leading-5 text-[#3f3f46]"
              >
                {note}
              </p>
            ))
          )}
        </div>
        <textarea
          value={discussionDraft}
          onChange={(event) => setDiscussionDraft(event.target.value)}
          placeholder="例: この改善案だと日経らしさが弱くない？根拠をもう少し企業理解に寄せたい。"
          className="mt-3 min-h-24 w-full resize-none rounded-md border border-[#e4e4e7] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#18181b]"
        />
        <button
          type="button"
          onClick={() => onAddDiscussionNote(suggestion)}
          disabled={isDiscussingSuggestion || !discussionDraft.trim()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-[#18181b] px-3 py-2 text-sm font-semibold text-white hover:bg-[#27272a] disabled:cursor-not-allowed disabled:bg-[#8b948f]"
        >
          <MessageSquare size={14} />
          {isDiscussingSuggestion ? "再検討中" : "質問して再検討"}
        </button>
      </div>
    </div>
  );
}

function PageBody({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`mx-auto px-6 py-6 ${wide ? "max-w-[1500px]" : "max-w-7xl"}`}>
      {children}
    </div>
  );
}

function PageHeader({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 border-b border-[#e4e4e7] pb-4">
      <p className="text-xs font-medium text-[#71717a]">{label}</p>
      <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71717a]">{description}</p>
    </div>
  );
}

function SectionHeader({ title, icon: Icon }: { title: string; icon: typeof FileText }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={15} />
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs">
      <span className="font-medium text-[#71717a]">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-[#e4e4e7] bg-white px-2.5 py-2 text-sm outline-none focus:border-[#18181b]"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs">
      <span className="font-medium text-[#71717a]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-24 resize-none rounded-md border border-[#e4e4e7] bg-white px-2.5 py-2 text-sm leading-6 outline-none focus:border-[#18181b]"
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-[#e4e4e7] pl-3">
      <p className="text-[11px] font-medium text-[#71717a]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[#27272a]">{value}</p>
    </div>
  );
}

function DiffBlock({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "add" | "remove";
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        tone === "add"
          ? "border-[#bbf7d0] bg-[#f7fdf9]"
          : "border-[#fecaca] bg-[#fff7ed]"
      }`}
    >
      <p className="text-xs font-semibold text-[#71717a]">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6">{text}</p>
    </div>
  );
}

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const labels: Record<VerificationStatus, string> = {
    verified_by_source: "出典確認済み",
    partially_verified: "一部確認",
    unverified: "未確認",
    conflicting_sources: "出典に矛盾",
    needs_user_confirmation: "本人確認",
  };
  const className =
    status === "verified_by_source"
      ? "bg-[#e7f5ea] text-[#27272a]"
      : status === "needs_user_confirmation"
        ? "bg-[#fef3c7] text-[#92400e]"
        : "bg-[#f4f4f5] text-[#71717a]";

  return (
    <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${className}`}>
      {labels[status]}
    </span>
  );
}

function SourceAccessBadge({
  status,
}: {
  status: "fetched" | "provided" | "model_based" | "failed";
}) {
  const labels = {
    fetched: "取得済み",
    provided: "入力情報",
    model_based: "未検証",
    failed: "取得失敗",
  };
  const className =
    status === "fetched"
      ? "bg-[#e7f5ea] text-[#27272a]"
      : status === "failed"
        ? "bg-[#fee2e2] text-[#991b1b]"
        : status === "model_based"
          ? "bg-[#f4f4f5] text-[#71717a]"
          : "bg-[#fef3c7] text-[#92400e]";

  return (
    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${className}`}>
      {labels[status]}
    </span>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Check;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-md border border-[#e4e4e7] bg-white px-2 py-2 text-xs font-semibold hover:border-[#18181b]"
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-[520px] place-items-center">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-10 place-items-center rounded-md border border-[#e4e4e7] bg-[#fafafa]">
          <CircleAlert size={18} />
        </div>
        <h2 className="mt-4 text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#71717a]">{description}</p>
      </div>
    </div>
  );
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function renderStars(rating: number) {
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

function criterionLabel(criterion: ReviewCriterion) {
  const labels: Record<ReviewCriterion, string> = {
    logical_structure: "論理構成",
    specificity_and_original_experience: "具体性",
    company_understanding_and_fit: "企業理解",
    expression_quality: "表現品質",
    authenticity_and_ai_likeness: "本人性",
  };
  return labels[criterion];
}

function createInitialSuggestionStatuses(suggestions: Suggestion[]) {
  return Object.fromEntries(
    suggestions.map((suggestion) => [suggestion.id, "unreviewed"]),
  ) as Record<string, SuggestionStatus>;
}
