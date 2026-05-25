import { NextResponse } from "next/server";
import OpenAI from "openai";
import { mockReviewResponse } from "@/data/mock-review-response";
import { getOpenAIErrorPayload } from "@/lib/api-error";
import { buildReviewPrompt } from "@/lib/review-prompt";
import { reviewResponseJsonSchema } from "@/lib/review-response-schema";
import type { ReviewRequest, ReviewResponse } from "@/types/sidus";

const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const requestTimeoutMs = 90_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReviewRequest;

    if (!body?.essay?.rawText?.trim()) {
      return NextResponse.json(
        {
          error: "essay.rawText is required",
        },
        { status: 400 },
      );
    }

    if (process.env.OPENAI_API_KEY) {
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are Sidus, an evidence-linked ES review system. Return only structured JSON.",
          },
          {
            role: "user",
            content: buildReviewPrompt(body),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "sidus_review_response",
            strict: true,
            schema: reviewResponseJsonSchema,
          },
        },
      }, {
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        return NextResponse.json(
          {
            error: "OpenAI returned an empty response",
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
            error: "OpenAI returned invalid JSON",
            code: "openai_invalid_json",
          },
          { status: 502 },
        );
      }
    }

    return NextResponse.json(createContextualMockReview(body));
  } catch (error) {
    if (isTimeoutOrAbortError(error)) {
      return NextResponse.json(
        {
          error:
            "AIレビューの生成が時間内に完了しませんでした。企業情報やES本文が長い場合は、少し待ってから再実行してください。",
          code: "openai_timeout",
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
          error instanceof Error ? error.message : "Invalid review request",
        code: "review_request_failed",
      },
      { status: 400 },
    );
  }
}

function isTimeoutOrAbortError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === "TimeoutError" || error.name === "AbortError";
  }

  if (error instanceof Error) {
    return /timed out|aborted|abort/i.test(error.message);
  }

  return false;
}

function createContextualMockReview(reviewRequest: ReviewRequest): ReviewResponse {
  const companyName = reviewRequest.applicationTarget.companyName || "応募先企業";
  const position = reviewRequest.applicationTarget.position || "応募職種";
  const companyMemo = reviewRequest.applicationTarget.companyMemo.trim();
  const firstSource = reviewRequest.applicationTarget.referenceUrls[0];
  const firstSentence =
    reviewRequest.essay.rawText
      .split(/[。.!?]/)
      .map((sentence) => sentence.trim())
      .find(Boolean) ?? reviewRequest.essay.rawText.trim();
  const targetText = firstSentence ? `${firstSentence}。` : reviewRequest.essay.rawText;
  const sourceId = firstSource?.id ?? "user-company-context";
  const sourceTitle = firstSource?.title || `${companyName}に関するユーザー提供情報`;
  const sourceUrl = firstSource?.url ?? "";

  return {
    ...mockReviewResponse,
    reviewId: `mock-review-${reviewRequest.essay.id}`,
    generatedAt: new Date().toISOString(),
    summary: {
      starRating: 3,
      headline: `${companyName}向けに、本人経験と企業理解の接続を強めたい`,
      overallComment: `${position}への応募文として、経験の方向性は読み取れます。一方で、現状では${companyName}を選ぶ理由がやや一般的に見えるため、企業情報と本人経験をもう一段具体的に接続すると説得力が増します。`,
      strengths: [
        "本人の経験や関心の軸が文章に入っている",
        "読み手に届けたい価値が大きく外れていない",
      ],
      priorityFixes: [
        `${companyName}固有の事業・読者・顧客との接続を補う`,
        "成果や行動の具体性を一段増やす",
      ],
      targetCompanyFitSummary: companyMemo
        ? `ユーザー提供の企業メモでは「${companyMemo.slice(0, 80)}」とされており、この文脈に本人経験を結びつける余地があります。`
        : "企業メモが不足しているため、応募先固有の理解はユーザー確認が必要です。",
    },
    evidenceAudit: [
      {
        id: "audit-company-context",
        claimText: `${companyName}に関する企業理解`,
        status: companyMemo ? "weakly_supported" : "needs_user_confirmation",
        verificationStatus: companyMemo
          ? "partially_verified"
          : "needs_user_confirmation",
        confidence: companyMemo ? "medium" : "low",
        sourceQuality: firstSource ? "user_provided" : "unknown",
        checkedBy: {
          research: Boolean(companyMemo || firstSource),
          verifier: Boolean(companyMemo || firstSource),
          reviewer: true,
        },
        assessment: companyMemo
          ? "企業理解はユーザー提供情報に基づいて一部確認できます。公開情報との照合は実API/検索接続後に追加確認が必要です。"
          : "企業メモまたは参考URLが不足しているため、企業理解の正確性は確認できません。",
        evidence: [
          {
            sourceId,
            sourceTitle,
            url: sourceUrl,
            quotedOrParaphrasedEvidence:
              companyMemo || "ユーザー提供の企業情報が未入力です。",
            reliability: firstSource ? "user_provided" : "low",
            supportsClaim: Boolean(companyMemo),
            sourceQuality: firstSource ? "user_provided" : "unknown",
          },
        ],
        caution:
          "Review APIのmock fallback自体は外部Web検索を行いません。Company Researchで採用した企業理解メモ、企業メモ、参考URLを根拠として扱います。",
        userCheckRequired: true,
      },
      {
        id: "audit-user-experience",
        claimText: targetText,
        status: "needs_user_confirmation",
        verificationStatus: "needs_user_confirmation",
        confidence: "medium",
        sourceQuality: "user_provided",
        checkedBy: {
          research: false,
          verifier: true,
          reviewer: true,
        },
        assessment:
          "本人経験はES本文とユーザー文脈から読み取れますが、成果の数値や事実関係は本人確認が必要です。",
        evidence: [
          {
            sourceId: "essay-text",
            sourceTitle: "ES本文",
            url: "",
            quotedOrParaphrasedEvidence: targetText,
            reliability: "user_provided",
            supportsClaim: true,
            sourceQuality: "user_provided",
          },
        ],
        caution: "成果や役割の大きさは、誇張せず本人が説明できる範囲に留める必要があります。",
        userCheckRequired: true,
      },
    ],
    suggestions: [
      {
        id: "suggestion-company-fit",
        type: "company_fit",
        severity: "high",
        title: `${companyName}を選ぶ理由を具体化する`,
        targetText,
        problem: `現状では、経験から得た関心が${companyName}の事業・読者・顧客にどう接続するかがやや一般的です。`,
        suggestedRevision: `${targetText}この経験を、${companyName}が向き合う読者や顧客の意思決定を支える情報提供に接続して語ると、志望理由としての必然性が強まります。`,
        rationale:
          "企業名を入れるだけでは差別化にならないため、企業が提供する価値と本人経験の接点を明示する必要があります。",
        expectedImpact: "応募先固有の理解と本人性が同時に伝わりやすくなります。",
        evidence: [
          {
            sourceId,
            sourceTitle,
            url: sourceUrl,
            quotedOrParaphrasedEvidence:
              companyMemo || "企業メモまたは参考URLが不足しています。",
            reliability: firstSource ? "user_provided" : "low",
            supportsClaim: Boolean(companyMemo),
            sourceQuality: firstSource ? "user_provided" : "unknown",
          },
        ],
        userConfirmationNeeded: [
          `${companyName}のどの事業・媒体・顧客に特に関心があるか`,
          "本人経験の成果をどこまで具体的に書けるか",
        ],
        diffHint: {
          before: targetText,
          after: `${targetText}この経験を通じて、情報を受け取る相手の判断を支える形に編集することに関心を持ちました。${companyName}でも、読者や顧客が社会や企業の変化を理解し、次の行動を考えられる情報発信に挑戦したいです。`,
          changeSummary: "本人経験を応募先の提供価値に接続",
        },
      },
      {
        id: "suggestion-specificity",
        type: "specificity",
        severity: "medium",
        title: "成果と行動の具体性を補う",
        targetText,
        problem:
          "行動の方向性は分かりますが、どのような工夫をし、どの程度変化が出たのかがまだ曖昧です。",
        suggestedRevision:
          "改善前後の変化、読者・参加者の反応、自分が担った役割を一つ加えると説得力が増します。",
        rationale:
          "ESでは価値観だけでなく、実際にどう動いたかを示すことで再現性が伝わります。",
        expectedImpact: "読み手が本人の強みを具体的に想像しやすくなります。",
        evidence: [
          {
            sourceId: "essay-text",
            sourceTitle: "ES本文",
            url: "",
            quotedOrParaphrasedEvidence: targetText,
            reliability: "user_provided",
            supportsClaim: true,
            sourceQuality: "user_provided",
          },
        ],
        userConfirmationNeeded: [
          "改善前後の数値や具体的な反応があるか",
          "自分が主導した範囲はどこまでか",
        ],
        diffHint: {
          before: targetText,
          after: `${targetText}特に、読者が最初に知りたい論点を見出しに置き、本文では背景、課題、示唆の順に整理しました。`,
          changeSummary: "行動の具体性を補足",
        },
      },
    ],
    finalDraft: {
      text: reviewRequest.essay.rawText,
      characterCount: reviewRequest.essay.rawText.length,
      notes: [
        "mock fallbackのため、最終稿は自動全面修正せず原文を保持しています。",
        "提案を採用しながら最終稿に反映してください。",
      ],
    },
    sources: [
      {
        id: sourceId,
        title: sourceTitle,
        url: sourceUrl,
        sourceType: firstSource ? "url" : "user_memo",
        usedFor: [`${companyName}に関する企業理解`],
      },
    ],
    warnings: [
      {
        code: firstSource || companyMemo ? "possible_hallucination" : "source_missing",
        message:
          "現在はOpenAI APIキー未設定時のmock fallbackです。実在企業の公開情報は、採用済みCompany Researchまたは公式情報で確認してください。",
        severity: "warning",
      },
    ],
  };
}
