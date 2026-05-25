import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getOpenAIErrorPayload } from "@/lib/api-error";
import { buildDiscussPrompt } from "@/lib/discuss-prompt";
import { discussSuggestionResponseJsonSchema } from "@/lib/discuss-response-schema";
import type {
  DiscussSuggestionRequest,
  DiscussSuggestionResponse,
} from "@/types/sidus";

const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const requestTimeoutMs = 45_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DiscussSuggestionRequest;

    if (!body?.suggestion?.id || !body?.question?.trim()) {
      return NextResponse.json(
        {
          error: "suggestion and question are required",
          code: "invalid_discussion_request",
        },
        { status: 400 },
      );
    }

    if (process.env.OPENAI_API_KEY) {
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const completion = await client.chat.completions.create(
        {
          model,
          messages: [
            {
              role: "system",
              content:
                "You are Sidus, an ES review discussion agent. Return only structured JSON.",
            },
            {
              role: "user",
              content: buildDiscussPrompt(body),
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "sidus_discuss_suggestion_response",
              strict: true,
              schema: discussSuggestionResponseJsonSchema,
            },
          },
        },
        {
          signal: AbortSignal.timeout(requestTimeoutMs),
        },
      );

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        return NextResponse.json(
          {
            error: "OpenAI returned an empty discussion response",
            code: "openai_empty_response",
          },
          { status: 502 },
        );
      }

      try {
        return NextResponse.json(JSON.parse(content));
      } catch {
        return NextResponse.json(
          {
            error: "OpenAI returned invalid discussion JSON",
            code: "openai_invalid_json",
          },
          { status: 502 },
        );
      }
    }

    return NextResponse.json(createMockDiscussion(body));
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json(
        {
          error: "Suggestion discussion timed out. Please try again.",
          code: "discussion_timeout",
        },
        { status: 504 },
      );
    }

    const openAIError = getOpenAIErrorPayload(error);
    if (openAIError) {
      return NextResponse.json(openAIError.body, {
        status: openAIError.status,
      });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid discussion request",
        code: "discussion_failed",
      },
      { status: 400 },
    );
  }
}

function createMockDiscussion(
  request: DiscussSuggestionRequest,
): DiscussSuggestionResponse {
  const companyName = request.applicationTarget.companyName || "応募先企業";
  const hasAcceptedResearch = Boolean(request.acceptedCompanyResearch);
  const evidenceNote = hasAcceptedResearch
    ? `採用済みCompany Researchの観点を踏まえると、${companyName}固有の提供価値と本人経験の接続を強めるのが自然です。`
    : "採用済みCompany Researchがないため、企業理解に関する断定は控えめにしてください。";
  const after =
    request.suggestion.diffHint.after +
    ` ${companyName}で特に重視される文脈に寄せる場合は、企業情報として確認済みの表現だけを使うのが安全です。`;

  return {
    discussionId: `mock-discussion-${request.suggestion.id}-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    answer:
      `質問の意図は妥当です。現在の提案は方向性として使えますが、${companyName}らしさを強めるなら、企業理解を一般論で足すのではなく、確認済みの事業・読者/顧客・職種要件に接続する形に絞るべきです。`,
    revisedSuggestion: {
      title: `${request.suggestion.title}（再検討）`,
      rationale:
        "ユーザーの懸念を踏まえ、企業固有性を強めつつ、未確認情報を断定しない表現に調整しました。",
      diffHint: {
        before: request.suggestion.diffHint.before,
        after,
        changeSummary:
          "企業理解を強める一方で、未確認の公開情報を断定しない形に調整",
      },
    },
    evidenceNotes: [evidenceNote],
    userConfirmationNeeded: [
      `${companyName}について、どの事業・媒体・顧客を最も重視して書きたいか`,
      "追加した企業理解の表現が、公式情報または採用済みCompany Researchで確認できるか",
    ],
  };
}
