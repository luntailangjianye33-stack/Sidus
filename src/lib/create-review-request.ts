import type {
  ApplicationTarget,
  EssaySourceType,
  ReviewCriterion,
  ReviewRequest,
  UserContext,
} from "@/types/sidus";

type CreateReviewRequestInput = {
  essayId: string;
  title: string;
  rawText: string;
  sourceType: EssaySourceType;
  targetCharacterCount: number;
  applicationTarget: ApplicationTarget;
  userContext: UserContext;
  reviewCriteria: ReviewCriterion[];
};

export function createReviewRequest({
  essayId,
  title,
  rawText,
  sourceType,
  targetCharacterCount,
  applicationTarget,
  userContext,
  reviewCriteria,
}: CreateReviewRequestInput): ReviewRequest {
  return {
    essay: {
      id: essayId,
      title,
      sourceType,
      rawText,
      targetCharacterCount,
      language: "ja",
    },
    applicationTarget,
    userContext,
    reviewCriteria,
    options: {
      tone: "professional",
      strictness: "normal",
      includeEvidenceAudit: true,
      includeFinalDraft: true,
    },
  };
}
