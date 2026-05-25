const baseUrl = process.env.SIDUS_BASE_URL ?? "http://localhost:3000";

const applicationTarget = {
  industry: "Media / Digital Subscription / Business Information",
  companyName: "日本経済新聞社",
  position: "記者職 / デジタルメディア職 インターン",
  companyMemo:
    "日本経済新聞社は、日本経済新聞、日経電子版、Nikkei Asia、データ・情報サービスなどを展開するビジネスメディア企業。",
  referenceUrls: [
    {
      id: "nikkei-digital",
      title: "日本経済新聞電子版",
      url: "https://marketing.nikkei.com/media/web/nikkei_online_edition/",
      memo: "日経電子版の媒体説明。",
      sourceType: "url",
    },
  ],
};

const essayText =
  "私は複雑な情報を読み手の意思決定に役立つ形で届ける仕事に関心があります。大学ではゼミの広報担当として研究内容を学生向けに発信し、構成と見出しを見直しました。貴社でも経済や企業活動の変化を深く捉え、読者の判断を支える情報発信に挑戦したいです。";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return json;
}

const companyResearch = await postJson("/api/company-research", {
  applicationTarget,
});

assert(companyResearch.companyName === "日本経済新聞社", "company research company mismatch");
assert(companyResearch.companyUnderstandingMemo, "company research memo missing");
assert(Array.isArray(companyResearch.sources), "company research sources missing");

const adoptedApplicationTarget = {
  ...applicationTarget,
  companyMemo: companyResearch.companyUnderstandingMemo,
};

const review = await postJson("/api/review", {
  essay: {
    id: "nikkei-real-api-smoke",
    title: "日経新聞ES",
    sourceType: "text",
    rawText: essayText,
    targetCharacterCount: 400,
    language: "ja",
  },
  applicationTarget: adoptedApplicationTarget,
  userContext: {
    selfPr: "専門的な内容を読者に合わせて構造化できる。",
    studentExperience: "ゼミの広報担当として、研究内容を学生向けに記事化した。",
    motivationAxis: "正確な情報を人の意思決定に役立つ形に編集して届けたい。",
    skills: "",
    values: "",
    seminarMemo: "",
    obOgMemo: "",
    additionalNotes: "",
  },
  reviewCriteria: [
    "logical_structure",
    "specificity_and_original_experience",
    "company_understanding_and_fit",
    "expression_quality",
    "authenticity_and_ai_likeness",
  ],
  options: {
    tone: "natural",
    strictness: "normal",
    includeEvidenceAudit: true,
    includeFinalDraft: true,
  },
});

assert(review.summary?.headline, "review headline missing");
assert(Array.isArray(review.suggestions) && review.suggestions.length > 0, "review suggestions missing");
assert(Array.isArray(review.evidenceAudit), "review evidence audit missing");

const firstSuggestion = review.suggestions[0];
const discussion = await postJson("/api/discuss", {
  suggestion: firstSuggestion,
  question: "この改善案だと日経らしさが弱くない？根拠をもっと会社理解に寄せたい。",
  applicationTarget: adoptedApplicationTarget,
  acceptedCompanyResearch: companyResearch,
  history: [],
});

assert(discussion.answer, "discussion answer missing");
assert(discussion.revisedSuggestion?.diffHint?.after, "discussion revised diff missing");

const result = {
  baseUrl,
  companyResearch: {
    accessMode: companyResearch.accessMode,
    confidence: companyResearch.confidence,
    sourceStatuses: companyResearch.sources.map((source) => ({
      title: source.title,
      accessStatus: source.accessStatus,
    })),
    usesMock: String(companyResearch.researchId ?? "").startsWith("mock-"),
  },
  review: {
    headline: review.summary.headline,
    suggestionCount: review.suggestions.length,
    auditCount: review.evidenceAudit.length,
    usesMock: String(review.reviewId ?? "").startsWith("mock-"),
  },
  discussion: {
    answerPreview: discussion.answer.slice(0, 120),
    usesMock: String(discussion.discussionId ?? "").startsWith("mock-"),
  },
};

console.log(JSON.stringify(result, null, 2));

if (
  result.companyResearch.usesMock ||
  result.review.usesMock ||
  result.discussion.usesMock
) {
  console.warn(
    "WARNING: One or more routes used mock fallback. Set OPENAI_API_KEY in .env.local and restart the dev server for real API verification.",
  );
  process.exitCode = 2;
}
