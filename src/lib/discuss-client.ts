import type {
  DiscussSuggestionRequest,
  DiscussSuggestionResponse,
} from "@/types/sidus";
import { createClientErrorMessage } from "@/lib/client-error";

export async function requestSuggestionDiscussion(
  discussRequest: DiscussSuggestionRequest,
): Promise<DiscussSuggestionResponse> {
  const response = await fetch("/api/discuss", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(discussRequest),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { code?: string; error?: string }
      | null;
    throw new Error(
      createClientErrorMessage(errorBody, "提案の再検討に失敗しました。"),
    );
  }

  return (await response.json()) as DiscussSuggestionResponse;
}
