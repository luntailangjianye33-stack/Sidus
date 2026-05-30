import type {
  BenchmarkResearchRequest,
  BenchmarkResearchResponse,
} from "@/types/sidus";
import { createClientErrorMessage } from "@/lib/client-error";

export async function requestBenchmarkResearch(
  benchmarkRequest: BenchmarkResearchRequest,
): Promise<BenchmarkResearchResponse> {
  const response = await fetch("/api/benchmark-research", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(benchmarkRequest),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { code?: string; error?: string }
      | null;
    throw new Error(
      createClientErrorMessage(errorBody, "参考ESベンチマークの生成に失敗しました。"),
    );
  }

  return (await response.json()) as BenchmarkResearchResponse;
}
