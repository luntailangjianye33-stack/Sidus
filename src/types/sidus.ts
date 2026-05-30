export type ReviewCriterion =
  | "logical_structure"
  | "specificity_and_original_experience"
  | "company_understanding_and_fit"
  | "expression_quality"
  | "authenticity_and_ai_likeness";

export type SourceInput = {
  id: string;
  title: string;
  url?: string;
  memo?: string;
  sourceType: "url" | "user_memo";
};

export type ApplicationTarget = {
  industry: string;
  companyName: string;
  companyScope?: "auto" | "domestic" | "foreign";
  corporateNumber?: string;
  position: string;
  companyMemo: string;
  referenceUrls: SourceInput[];
};

export type CompanyResearchRequest = {
  applicationTarget: ApplicationTarget;
};

export type BenchmarkResearchRequest = {
  applicationTarget: ApplicationTarget;
  acceptedCompanyResearch?: CompanyResearchResponse | null;
};

export type BenchmarkResearchSource = {
  title: string;
  url: string;
  note: string;
};

export type BenchmarkResearchResponse = {
  generatedAt: string;
  companyName: string;
  position: string;
  benchmarkNotes: BenchmarkNotes;
  sources: BenchmarkResearchSource[];
  warnings: string[];
};

export type CompanyResearchSource = {
  id: string;
  title: string;
  url?: string;
  sourceType:
    | "url"
    | "official_site"
    | "recruiting"
    | "company_database"
    | "public_registry"
    | "financial_disclosure"
    | "major_media"
    | "user_memo"
    | "model_knowledge";
  sourceTier: "primary" | "public" | "secondary" | "user" | "model";
  accessStatus: "fetched" | "provided" | "model_based" | "failed";
  usedFor: string[];
  excerpt: string;
};

export type CompanyIdentitySummary = {
  legalName: string;
  jurisdiction: string;
  entityKind: string;
  corporateNumber: string;
  headquarters: string;
  industryClassification: string;
  officialWebsite: string;
  securitiesCode: string;
  listingMarket: string;
};

export type CompanyFinancialHighlight = {
  label: string;
  value: string;
  period: string;
  sourceId: string;
  confidence: "high" | "medium" | "low";
};

export type CompanyRecentDevelopment = {
  title: string;
  summary: string;
  date: string;
  sourceId: string;
  sourceType: CompanyResearchSource["sourceType"];
  esUseRecommendation:
    | "direct_use"
    | "background_only"
    | "use_with_caution"
    | "do_not_use";
  riskNote: string;
  url: string;
  confidence: "high" | "medium" | "low";
};

export type CompanyEvidenceDigest = {
  category:
    | "public_registry"
    | "official_company"
    | "financial"
    | "major_media"
    | "user_context"
    | "unverified";
  title: string;
  summary: string;
  sourceIds: string[];
  userRelevance: string;
  useRecommendation:
    | "direct_use"
    | "background_only"
    | "use_with_caution"
    | "do_not_use";
  riskNote: string;
};

export type CompanySourceChunk = {
  chunkId: string;
  sourceId: string;
  lineStart: number;
  lineEnd: number;
  text: string;
};

export type CompanySourceManifestEntry = {
  sourceId: string;
  title: string;
  url?: string;
  sourceType: CompanyResearchSource["sourceType"];
  sourceTier: CompanyResearchSource["sourceTier"];
  retrievedAt: string;
  chunks: CompanySourceChunk[];
};

export type CompanyClaimType =
  | "legal_name"
  | "corporate_number"
  | "headquarters"
  | "industry"
  | "official_website"
  | "securities_code"
  | "listing_market"
  | "capital"
  | "revenue"
  | "employees"
  | "business_summary"
  | "role_fit"
  | "recent_development";

export type CompanyClaimVerification =
  | "supported"
  | "weak"
  | "unverified"
  | "conflicted";

export type CompanyClaim = {
  id: string;
  claimType: CompanyClaimType;
  label: string;
  text: string;
  value?: string;
  sourceIds: string[];
  chunkIds: string[];
  verification: CompanyClaimVerification;
  confidence: "high" | "medium" | "low";
  adopted: boolean;
  note: string;
};

export type CompanySourceCoverage = {
  publicRegistry: number;
  official: number;
  financial: number;
  media: number;
  userProvided: number;
  modelKnowledge: number;
};

export type CompanyResearchResponse = {
  researchId: string;
  generatedAt: string;
  companyName: string;
  industry: string;
  position: string;
  accessMode: "fetched_sources" | "user_sources_only" | "model_knowledge_only";
  confidence: "high" | "medium" | "low";
  companyUnderstandingMemo: string;
  identitySummary: CompanyIdentitySummary;
  businessSummary: string[];
  financialHighlights: CompanyFinancialHighlight[];
  recentDevelopments: CompanyRecentDevelopment[];
  evidenceDigest: CompanyEvidenceDigest[];
  sourceCoverage: CompanySourceCoverage;
  roleFitHypotheses: string[];
  esReviewFocus: string[];
  sources: CompanyResearchSource[];
  sourceManifest: CompanySourceManifestEntry[];
  companyClaims: CompanyClaim[];
  unknowns: string[];
  warnings: ReviewWarning[];
};

export type UserContext = {
  selfPr: string;
  studentExperience: string;
  motivationAxis: string;
  skills: string;
  values: string;
  seminarMemo: string;
  obOgMemo: string;
  additionalNotes: string;
  benchmarkNotes?: BenchmarkNotes;
};

export type BenchmarkNotes = {
  passedEssayPatterns: string;
  strongPhrases: string;
  weakGenericPhrases: string;
  structureHints: string;
};

export type SampleEssay = {
  id: string;
  title: string;
  description: string;
  essayText: string;
  applicationTarget: ApplicationTarget;
  userContext: UserContext;
  targetCharacterCount: number;
  expectedChecks: string[];
};

export type ReviewRequest = {
  essay: {
    id: string;
    title: string;
    sourceType: "pdf" | "markdown" | "text" | "sample";
    rawText: string;
    targetCharacterCount: number;
    language: "ja" | "en";
  };
  applicationTarget: ApplicationTarget;
  userContext: UserContext;
  reviewCriteria: ReviewCriterion[];
  options: {
    tone: "natural" | "professional" | "concise" | "assertive";
    strictness: "normal" | "strict";
    includeEvidenceAudit: boolean;
    includeFinalDraft: boolean;
  };
};

export type EssaySourceType = ReviewRequest["essay"]["sourceType"];

export type DocumentExtractionCandidate = {
  id: string;
  label: "志望動機" | "自己PR" | "ガクチカ" | "その他";
  question: string;
  text: string;
  confidence: "high" | "medium" | "low";
};

export type DocumentExtractionResult = {
  fileName: string;
  mimeType: string;
  sourceType: EssaySourceType;
  pageCount?: number;
  rawText: string;
  cleanedText: string;
  candidates: DocumentExtractionCandidate[];
  warnings: string[];
};

export type StarRating = 1 | 2 | 3 | 4 | 5;

export type EvidenceStatus =
  | "supported"
  | "weakly_supported"
  | "unsupported"
  | "possibly_inaccurate"
  | "needs_user_confirmation";

export type VerificationStatus =
  | "verified_by_source"
  | "partially_verified"
  | "unverified"
  | "conflicting_sources"
  | "needs_user_confirmation";

export type SourceQuality =
  | "official"
  | "company_provided"
  | "user_provided"
  | "third_party"
  | "model_knowledge"
  | "unknown";

export type EvidenceReference = {
  sourceId?: string;
  sourceTitle?: string;
  url?: string;
  quotedOrParaphrasedEvidence: string;
  reliability: "high" | "medium" | "low" | "user_provided";
  supportsClaim: boolean;
  sourceQuality: SourceQuality;
};

export type EvidenceAuditItem = {
  id: string;
  claimText: string;
  status: EvidenceStatus;
  verificationStatus: VerificationStatus;
  confidence: "high" | "medium" | "low";
  sourceQuality: SourceQuality;
  checkedBy: {
    research: boolean;
    verifier: boolean;
    reviewer: boolean;
  };
  assessment: string;
  evidence: EvidenceReference[];
  caution?: string;
  userCheckRequired: boolean;
};

export type OverallSummary = {
  starRating: StarRating;
  headline: string;
  overallComment: string;
  strengths: string[];
  priorityFixes: string[];
  targetCompanyFitSummary: string;
};

export type CriterionReview = {
  criterion: ReviewCriterion;
  starRating: StarRating;
  comment: string;
  ratingRationale: string;
  targetText?: string;
  evidenceReasoning?: string;
  deductionReason?: string;
  revisionDirection?: string;
  strengths: string[];
  weaknesses: string[];
  evidence: EvidenceReference[];
};

export type Suggestion = {
  id: string;
  type:
    | "logic"
    | "specificity"
    | "company_fit"
    | "expression"
    | "authenticity"
    | "length";
  severity: "high" | "medium" | "low";
  title: string;
  targetText: string;
  problem: string;
  suggestedRevision: string;
  rationale: string;
  expectedImpact: string;
  evidence: EvidenceReference[];
  userConfirmationNeeded: string[];
  diffHint: {
    before: string;
    after: string;
    changeSummary: string;
  };
};

export type UserQuestion = {
  id: string;
  question: string;
  reason: string;
  relatedSuggestionIds: string[];
};

export type FinalDraft = {
  text: string;
  characterCount: number;
  notes: string[];
};

export type SourceReference = {
  id: string;
  title: string;
  url?: string;
  sourceType: "url" | "user_memo" | "model_knowledge";
  usedFor: string[];
};

export type ReviewWarning = {
  code:
    | "insufficient_company_context"
    | "insufficient_user_context"
    | "possible_hallucination"
    | "source_missing"
    | "too_short"
    | "too_long"
    | "ambiguous_claim";
  message: string;
  severity: "info" | "warning" | "error";
};

export type ReviewResponse = {
  reviewId: string;
  generatedAt: string;
  summary: OverallSummary;
  criterionReviews: CriterionReview[];
  evidenceAudit: EvidenceAuditItem[];
  suggestions: Suggestion[];
  userQuestions: UserQuestion[];
  finalDraft?: FinalDraft;
  sources: SourceReference[];
  warnings: ReviewWarning[];
};

export type SuggestionStatus =
  | "unreviewed"
  | "accepted"
  | "rejected"
  | "edited"
  | "revised";

export type DiscussionMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DiscussSuggestionRequest = {
  suggestion: Suggestion;
  question: string;
  applicationTarget: ApplicationTarget;
  acceptedCompanyResearch?: CompanyResearchResponse | null;
  history: DiscussionMessage[];
};

export type DiscussSuggestionResponse = {
  discussionId: string;
  generatedAt: string;
  answer: string;
  revisedSuggestion: {
    title: string;
    rationale: string;
    diffHint: {
      before: string;
      after: string;
      changeSummary: string;
    };
  };
  evidenceNotes: string[];
  userConfirmationNeeded: string[];
};
