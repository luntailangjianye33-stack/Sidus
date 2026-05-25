import type {
  CompanyResearchRequest,
  CompanyResearchResponse,
} from "@/types/sidus";
import { createClientErrorMessage } from "@/lib/client-error";

export async function requestCompanyResearch(
  researchRequest: CompanyResearchRequest,
): Promise<CompanyResearchResponse> {
  const response = await fetch("/api/company-research", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(researchRequest),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { code?: string; error?: string }
      | null;
    throw new Error(
      createClientErrorMessage(errorBody, "企業情報のAI調査に失敗しました。"),
    );
  }

  return (await response.json()) as CompanyResearchResponse;
}
