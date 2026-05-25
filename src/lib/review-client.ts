import type { ReviewRequest, ReviewResponse } from "@/types/sidus";
import { createClientErrorMessage } from "@/lib/client-error";

export async function requestReview(
  reviewRequest: ReviewRequest,
): Promise<ReviewResponse> {
  const response = await fetch("/api/review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reviewRequest),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { code?: string; error?: string }
      | null;
    throw new Error(
      createClientErrorMessage(errorBody, "ESレビューの生成に失敗しました。"),
    );
  }

  return (await response.json()) as ReviewResponse;
}
