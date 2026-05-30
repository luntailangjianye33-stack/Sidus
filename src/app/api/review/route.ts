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

      const parsed = parseReviewResponseContent(content);
      if (parsed) {
        return NextResponse.json(enhanceReviewResponse(parsed, body));
      }

      const fallback = createContextualMockReview(body);
      return NextResponse.json({
        ...enhanceReviewResponse(fallback, body),
        warnings: [
          ...fallback.warnings,
          {
            code: "possible_hallucination",
            message:
              "AIの構造化JSON生成が不安定だったため、入力済みの企業情報・本人情報・参考ESメモにもとづく安全なレビューに切り替えました。",
            severity: "warning",
          },
        ],
      });
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

function parseReviewResponseContent(content: string): ReviewResponse | null {
  const candidates = [
    content,
    content.replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, ""),
    content.match(/\{[\s\S]*\}/u)?.[0] ?? "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as ReviewResponse;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
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
  const targetText = getPrimaryTargetText(reviewRequest.essay.rawText);
  const sourceId = firstSource?.id ?? "user-company-context";
  const sourceTitle = firstSource?.title || `${companyName}に関するユーザー提供情報`;
  const sourceUrl = firstSource?.url ?? "";
  const benchmark = reviewRequest.userContext.benchmarkNotes;
  const hasBenchmark = Boolean(
    benchmark &&
      [
        benchmark.passedEssayPatterns,
        benchmark.strongPhrases,
        benchmark.weakGenericPhrases,
        benchmark.structureHints,
      ].some((value) => value.trim()),
  );
  const benchmarkSummary = hasBenchmark
    ? [
        benchmark?.passedEssayPatterns && `通過ESの型: ${benchmark.passedEssayPatterns}`,
        benchmark?.strongPhrases && `強い語彙: ${benchmark.strongPhrases}`,
        benchmark?.weakGenericPhrases && `弱い汎用表現: ${benchmark.weakGenericPhrases}`,
        benchmark?.structureHints && `構成ヒント: ${benchmark.structureHints}`,
      ]
        .filter(Boolean)
        .join(" / ")
    : "";

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
        ...(hasBenchmark ? ["通過ESベンチマークの構成に照らして、志望理由の流れを整える"] : []),
        "企業名だけを差し替えても成立する表現を減らす",
        "抽象語を、本人の行動と企業の提供価値が結びつく語彙に置き換える",
        "成果や行動の具体性を一段増やす",
      ],
      targetCompanyFitSummary: companyMemo
        ? `ユーザー提供の企業メモでは「${companyMemo.slice(0, 80)}」とされており、この文脈に本人経験を結びつける余地があります。`
        : "企業メモが不足しているため、応募先固有の理解はユーザー確認が必要です。",
    },
    criterionReviews: createContextualCriterionReviews({
      companyName,
      position,
      targetText,
      companyMemo,
      benchmarkSummary,
      hasBenchmark,
      sourceId,
      sourceTitle,
      sourceUrl,
    }),
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
      ...(hasBenchmark
        ? [
            {
              id: "audit-benchmark-notes",
              claimText: "通過ESベンチマークとして入力された構造メモ",
              status: "supported" as const,
              verificationStatus: "needs_user_confirmation" as const,
              confidence: "medium" as const,
              sourceQuality: "user_provided" as const,
              checkedBy: {
                research: false,
                verifier: true,
                reviewer: true,
              },
              assessment:
                "参考ES本文ではなく、ユーザーが抽出した構造・語彙メモとして扱います。丸写しせず、本人経験と企業理解に合う範囲でレビュー基準に使います。",
              evidence: [
                {
                  sourceId: "benchmark-notes",
                  sourceTitle: "ユーザー入力: 通過ESベンチマーク",
                  url: "",
                  quotedOrParaphrasedEvidence: benchmarkSummary,
                  reliability: "user_provided" as const,
                  supportsClaim: true,
                  sourceQuality: "user_provided" as const,
                },
              ],
              caution:
                "他人のES本文そのものを再現しないでください。構造、観点、語彙水準だけを参照します。",
              userCheckRequired: true,
            },
          ]
        : []),
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
        title: "他社にも使い回せる志望理由を企業固有にする",
        targetText,
        problem: `この文は他社にも使い回せる可能性があります。理由: ${companyName}固有の事業・顧客・提供価値がまだ本文に十分入っていません。`,
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
        id: "suggestion-vocabulary-quality",
        type: "expression",
        severity: "medium",
        title: "語彙を企業理解に耐える精度へ上げる",
        targetText,
        problem:
          "抽象的な言葉だけで締めると、企業研究を踏まえた志望理由ではなく、一般的な就活文に見えます。",
        suggestedRevision:
          "企業が提供する価値、読み手・顧客、本人が実際に行った行動を一文の中で接続できる語彙に置き換えてください。",
        rationale:
          "語彙の精度が上がると、AIが整えた文章ではなく、本人が企業を理解したうえで選んだ言葉に見えます。",
        expectedImpact:
          "企業理解、本人性、表現品質の三つが同時に上がります。",
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
          "この語彙が自分の普段の言葉として説明できるか",
          `${companyName}の確認済み企業情報と矛盾しないか`,
        ],
        diffHint: {
          before: targetText,
          after: `${targetText}その際、単に分かりやすく伝えるだけでなく、相手が次の判断に移れるように論点を整理することを意識しました。`,
          changeSummary: "抽象的な熱意表現を、行動と価値に結びつく語彙へ寄せる",
        },
      },
      ...(hasBenchmark
        ? [
            {
              id: "suggestion-benchmark-structure",
              type: "logic" as const,
              severity: "medium" as const,
              title: "通過ESの型に沿って構成を締める",
              targetText,
              problem:
                "企業理解、本人経験、入社後の行動像の接続が一文ずつ並んでおり、通過ESで見られるような流れの強さがまだ足りません。",
              suggestedRevision:
                "参考ESの構造メモをそのまま写すのではなく、原体験、企業固有の課題、入行後の行動像の順に並べ替えてください。",
              rationale:
                "通過ESベンチマークは文章を真似るためではなく、読み手が納得しやすい構成の基準として使うと効果があります。",
              expectedImpact:
                "企業情報と本人経験が分断されず、志望理由としての必然性が強まります。",
              evidence: [
                {
                  sourceId: "benchmark-notes",
                  sourceTitle: "ユーザー入力: 通過ESベンチマーク",
                  url: "",
                  quotedOrParaphrasedEvidence: benchmarkSummary,
                  reliability: "user_provided" as const,
                  supportsClaim: true,
                  sourceQuality: "user_provided" as const,
                },
              ],
              userConfirmationNeeded: [
                "参考にした通過ESの本文をそのまま使っていないか",
                "自分の経験として説明できる構成になっているか",
              ],
              diffHint: {
                before: targetText,
                after: `${targetText}この経験を出発点に、応募先の事業や顧客課題に対して自分がどう貢献したいのかを、原体験、企業理解、入社後の行動像の順に整理すると説得力が増します。`,
                changeSummary:
                  "参考ESの構造メモを、本人経験に合わせた構成改善へ変換",
              },
            },
          ]
        : []),
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
      ...(hasBenchmark
        ? [
            {
              id: "benchmark-notes",
              title: "ユーザー入力: 通過ESベンチマーク",
              url: "",
              sourceType: "user_memo" as const,
              usedFor: ["通過ESの構造比較", "語彙品質", "使い回し検出"],
            },
          ]
        : []),
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

function enhanceReviewResponse(
  reviewResponse: ReviewResponse,
  reviewRequest: ReviewRequest,
): ReviewResponse {
  const context = createReviewContext(reviewRequest);
  const fallbackReviews = createContextualCriterionReviews(context);
  const essayText = reviewRequest.essay.rawText;

  return {
    ...reviewResponse,
    criterionReviews: reviewResponse.criterionReviews.map((criterion) => {
      const fallback = fallbackReviews.find(
        (item) => item.criterion === criterion.criterion,
      );
      if (!fallback) return criterion;
      const targetText = normalizeExactTargetText(
        criterion.targetText,
        essayText,
        fallback.targetText ?? context.targetText,
      );
      const evidence = enrichCriterionEvidence(
        criterion.evidence.length > 0 ? criterion.evidence : fallback.evidence,
        criterion.criterion,
        targetText,
        context,
      );

      return {
        ...criterion,
        comment: isThinReviewText(criterion.comment)
          ? fallback.comment
          : criterion.comment,
        targetText,
        evidenceReasoning: isThinReviewText(criterion.evidenceReasoning)
          ? fallback.evidenceReasoning
          : criterion.evidenceReasoning,
        deductionReason: isThinReviewText(criterion.deductionReason)
          ? fallback.deductionReason
          : criterion.deductionReason,
        revisionDirection: isThinReviewText(criterion.revisionDirection)
          ? fallback.revisionDirection
          : criterion.revisionDirection,
        ratingRationale: isThinReviewText(criterion.ratingRationale, 120)
          ? fallback.ratingRationale
          : criterion.ratingRationale,
        strengths:
          criterion.strengths.length > 0 ? criterion.strengths : fallback.strengths,
        weaknesses:
          criterion.weaknesses.length > 0
            ? criterion.weaknesses
            : fallback.weaknesses,
        evidence,
      };
    }),
    suggestions: enhanceSuggestions(
      ensureSuggestionCoverage(
        reviewResponse.suggestions,
        createContextualMockReview(reviewRequest).suggestions,
      ),
      reviewRequest,
      context,
    ),
  };
}

function ensureSuggestionCoverage(
  suggestions: ReviewResponse["suggestions"],
  fallbackSuggestions: ReviewResponse["suggestions"],
) {
  const requiredTypes: ReviewResponse["suggestions"][number]["type"][] = [
    "company_fit",
    "expression",
    "logic",
    "specificity",
  ];
  const coveredTypes = new Set(suggestions.map((suggestion) => suggestion.type));
  const supplements = requiredTypes
    .filter((type) => !coveredTypes.has(type))
    .map((type) => fallbackSuggestions.find((suggestion) => suggestion.type === type))
    .filter((suggestion): suggestion is ReviewResponse["suggestions"][number] =>
      Boolean(suggestion),
    );

  return [...suggestions, ...supplements].slice(0, 4);
}

function createReviewContext(reviewRequest: ReviewRequest) {
  const companyName = reviewRequest.applicationTarget.companyName || "応募先企業";
  const position = reviewRequest.applicationTarget.position || "応募職種";
  const companyMemo = reviewRequest.applicationTarget.companyMemo.trim();
  const firstSource = reviewRequest.applicationTarget.referenceUrls[0];
  const targetText = getPrimaryTargetText(reviewRequest.essay.rawText);
  const sourceId = firstSource?.id ?? "user-company-context";
  const sourceTitle = firstSource?.title || `${companyName}に関するユーザー提供情報`;
  const sourceUrl = firstSource?.url ?? "";
  const benchmark = reviewRequest.userContext.benchmarkNotes;
  const hasBenchmark = Boolean(
    benchmark &&
      [
        benchmark.passedEssayPatterns,
        benchmark.strongPhrases,
        benchmark.weakGenericPhrases,
        benchmark.structureHints,
      ].some((value) => value.trim()),
  );
  const benchmarkSummary = hasBenchmark
    ? [
        benchmark?.passedEssayPatterns && `通過ESの型: ${benchmark.passedEssayPatterns}`,
        benchmark?.strongPhrases && `強い語彙: ${benchmark.strongPhrases}`,
        benchmark?.weakGenericPhrases && `弱い汎用表現: ${benchmark.weakGenericPhrases}`,
        benchmark?.structureHints && `構成ヒント: ${benchmark.structureHints}`,
      ]
        .filter(Boolean)
        .join(" / ")
    : "";

  return {
    companyName,
    position,
    targetText,
    companyMemo,
    motivationAxis: (reviewRequest.userContext.motivationAxis ?? "").trim(),
    selfPr: (reviewRequest.userContext.selfPr ?? "").trim(),
    studentExperience: (reviewRequest.userContext.studentExperience ?? "").trim(),
    skills: (reviewRequest.userContext.skills ?? "").trim(),
    values: (reviewRequest.userContext.values ?? "").trim(),
    benchmarkSummary,
    hasBenchmark,
    sourceId,
    sourceTitle,
    sourceUrl,
  };
}

function isThinReviewText(value: unknown, minLength = 70) {
  return typeof value !== "string" || value.trim().length < minLength;
}

function getPrimaryTargetText(rawText: string) {
  const text = rawText.trim();
  if (!text) return "";
  const match = text.match(/[^。.!?！？]+[。.!?！？]/u);
  return match?.[0]?.trim() || text;
}

function normalizeExactTargetText(
  value: unknown,
  essayText: string,
  fallback: string,
) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (candidate && essayText.includes(candidate)) return candidate;

  const withoutEllipsis = candidate.replace(/[.…]+$/u, "").trim();
  if (withoutEllipsis && essayText.includes(withoutEllipsis)) return withoutEllipsis;
  if (fallback && essayText.includes(fallback)) return fallback;
  return getPrimaryTargetText(essayText);
}

type ReviewContext = ReturnType<typeof createReviewContext>;

function enrichCriterionEvidence(
  evidence: ReviewResponse["criterionReviews"][number]["evidence"],
  criterion: ReviewResponse["criterionReviews"][number]["criterion"],
  targetText: string,
  context: ReviewContext,
) {
  const enriched = [...evidence];
  if (!enriched.some((item) => item.sourceId === "essay-text")) {
    enriched.unshift(createEssayEvidence(targetText));
  }
  if (
    criterion === "company_understanding_and_fit" &&
    context.companyMemo &&
    !enriched.some((item) => item.sourceId === context.sourceId)
  ) {
    enriched.push(createCompanyEvidence(context));
  }
  if (
    ["logical_structure", "expression_quality"].includes(criterion) &&
    context.hasBenchmark &&
    !enriched.some((item) => item.sourceId === "benchmark-notes")
  ) {
    enriched.push(createBenchmarkEvidence(context));
  }
  return enriched.slice(0, 4);
}

function enhanceSuggestions(
  suggestions: ReviewResponse["suggestions"],
  reviewRequest: ReviewRequest,
  context: ReviewContext,
): ReviewResponse["suggestions"] {
  const essayText = reviewRequest.essay.rawText;
  return suggestions.map((suggestion) => {
    const targetText = normalizeExactTargetText(
      suggestion.targetText,
      essayText,
      context.targetText,
    );
    const before = normalizeExactTargetText(
      suggestion.diffHint.before || suggestion.targetText,
      essayText,
      targetText,
    );
    const evidence = enrichSuggestionEvidence(suggestion.evidence, suggestion.type, targetText, context);
    const rationale = isThinReviewText(suggestion.rationale, 120)
      ? createSuggestionRationale(suggestion, targetText, context)
      : suggestion.rationale;
    const suggestedRevision = createSafeSuggestedRevision(
      suggestion,
      targetText,
      context,
    );

    return {
      ...suggestion,
      title: refineSuggestionTitle(suggestion),
      targetText,
      rationale,
      problem: refineSuggestionProblem(suggestion, context),
      suggestedRevision,
      evidence,
      diffHint: {
        ...suggestion.diffHint,
        before,
        after: suggestedRevision,
      },
    };
  });
}

function refineSuggestionTitle(suggestion: ReviewResponse["suggestions"][number]) {
  if (suggestion.type === "company_fit") return "企業固有性を本人経験に接続";
  if (suggestion.type === "expression") return "抽象語を本人の行動に置換";
  if (suggestion.type === "logic") return "原体験から企業接続へ並べ替え";
  if (suggestion.type === "specificity") return "行動と成果を一段具体化";
  if (suggestion.type === "authenticity") return "本人の判断を戻す";
  return suggestion.title || "文字数と密度を調整";
}

function refineSuggestionProblem(
  suggestion: ReviewResponse["suggestions"][number],
  context: ReviewContext,
) {
  if (suggestion.type === "company_fit") {
    return `${context.companyName}の事業・職種情報と、本人経験の接続がまだ弱いです。企業名を差し替えても成立する状態を避けます。`;
  }
  if (suggestion.type === "expression") {
    return "抽象語が残っており、本人が実際に扱った対象や判断よりも、整った一般論が前に出ています。";
  }
  if (suggestion.type === "logic") {
    return "原体験、企業を選ぶ理由、入社後の使い道の順序がやや散らばっています。";
  }
  if (suggestion.type === "specificity") {
    return "行動の方向性はありますが、場面、判断、変化が足りず、強みの再現性が伝わりにくいです。";
  }
  return suggestion.problem;
}

function createSafeSuggestedRevision(
  suggestion: ReviewResponse["suggestions"][number],
  targetText: string,
  context: ReviewContext,
) {
  const candidates = [
    suggestion.suggestedRevision,
    suggestion.diffHint.after,
  ].map((value) => cleanJapaneseRevision(value));

  const usableCandidate = candidates.find(
    (value) => value && !isWeakSuggestedRevision(value, suggestion.type, targetText, context),
  );
  if (usableCandidate) return ensureJapaneseSentence(usableCandidate);

  return createConcreteSuggestedRevision(suggestion, targetText, context);
}

function isWeakSuggestedRevision(
  value: string,
  type: ReviewResponse["suggestions"][number]["type"],
  targetText: string,
  context: ReviewContext,
) {
  const text = value.trim();
  if (!text) return true;
  if (text.length < Math.min(42, Math.max(28, targetText.length * 0.45))) return true;
  if (!/[。.!?！？]$/u.test(text)) return true;
  if (looksLikeInstruction(text)) return true;
  if (hasRepeatedCompanyPhrase(text, context)) return true;
  if (
    type === "specificity" &&
    /読者|見出し|記事|取材/u.test(text) &&
    !/日経|新聞|記者|報道|メディア/u.test(
      `${context.companyName} ${context.position} ${context.companyMemo}`,
    )
  ) {
    return true;
  }

  const hasCompanyAnchor =
    text.includes(context.companyName) ||
    getCompanyFocusPhrase(context)
      .split(/[、・/／\s]/u)
      .filter((part) => part.length >= 2)
      .some((part) => text.includes(part));
  const hasUserAnchor =
    getUserExperiencePhrase(context)
      .split(/[、・/／\s]/u)
      .filter((part) => part.length >= 2)
      .some((part) => text.includes(part)) ||
    [context.selfPr, context.studentExperience, context.skills]
      .filter(Boolean)
      .some((part) => text.includes(part.slice(0, Math.min(12, part.length))));

  if (["company_fit", "logic"].includes(type)) {
    return !hasCompanyAnchor || !hasUserAnchor;
  }
  if (context.companyName !== "応募先企業" && type === "expression") {
    return !hasCompanyAnchor && !hasUserAnchor;
  }
  return false;
}

function looksLikeInstruction(text: string) {
  return /してください|書いてください|示してください|補ってください|置き換えてください|並べ替えてください|加えると|書くと|示したい|必要があります|べきです|よいでしょう|してください。$/u.test(
    text,
  );
}

function cleanJapaneseRevision(value: string) {
  return value
    .replace(/\s+/gu, " ")
    .replace(/具体的な事業に貢献する形を具体的に/u, "事業に貢献する形を")
    .replace(/具体的に示したいと考えています。?$/u, "示したいです。")
    .trim();
}

function createConcreteSuggestedRevision(
  suggestion: ReviewResponse["suggestions"][number],
  targetText: string,
  context: ReviewContext,
) {
  const company = context.companyName;
  const experience = getUserExperiencePhrase(context);
  const companyFocus = getCompanyFocusPhrase(context);

  if (suggestion.type === "company_fit") {
    return ensureJapaneseSentence(
      `私が${company}を志望する理由は、${experience}を生かし、${companyFocus}に関わりたいからです。`,
    );
  }

  if (suggestion.type === "expression") {
    if (/私が.+志望する理由/u.test(targetText)) {
      return ensureJapaneseSentence(
        `私が${company}を志望する理由は、${experience}を、${companyFocus}に生かしたいからです。`,
      );
    }
    const rewritten = replaceGenericExpressions(targetText, experience, companyFocus);
    if (rewritten !== targetText && !looksLikeInstruction(rewritten)) {
      return ensureJapaneseSentence(rewritten);
    }
    return ensureJapaneseSentence(
      `${experience}を、${company}の${companyFocus}に生かしたいです。`,
    );
  }

  if (suggestion.type === "specificity") {
    if (/私が.+志望する理由/u.test(targetText)) {
      return ensureJapaneseSentence(
        `私が${company}を志望する理由は、${experience}を、${companyFocus}に生かし、事業判断の前提をそろえる仕事に関わりたいからです。`,
      );
    }
    return ensureJapaneseSentence(
      `${targetText.replace(/[。.!?！？]+$/u, "")}。その過程で、課題を分解し、判断材料をそろえて周囲が動きやすい形に整えた経験を、${companyFocus}に生かしたいです。`,
    );
  }

  if (suggestion.type === "authenticity") {
    return ensureJapaneseSentence(
      `${experience}を通じて、単に成果を出すだけでなく、何を根拠に判断するかを丁寧にそろえる重要性を学びました。この姿勢を${company}の${companyFocus}で発揮したいです。`,
    );
  }

  return ensureJapaneseSentence(
    `${experience}で得た問題意識を出発点に、${company}の${companyFocus}へつなげたいです。`,
  );
}

function replaceGenericExpressions(
  targetText: string,
  experience: string,
  companyFocus: string,
) {
  return targetText
    .replace(
      /産業や地域を横断して事業を構想し、長期的に価値を生み出す仕事/u,
      `${companyFocus}に${experience}を生かす仕事`,
    )
    .replace(/社会に貢献したい/u, `${companyFocus}に貢献したい`)
    .replace(/成長したい/u, `${experience}をさらに磨きたい`)
    .replace(/長期的に価値を生み出す仕事/u, `${experience}を${companyFocus}に結びつける仕事`)
    .replace(/重要な役割を担っているので、その進化に貢献したいと考えています/u, `重要な役割を担っている点に惹かれ、${experience}をその進化に生かしたいと考えています`);
}

function hasRepeatedCompanyPhrase(text: string, context: ReviewContext) {
  const focus = getCompanyFocusPhrase(context);
  const anchors = [
    "産業や地域を横断",
    "半導体製造装置",
    "建設プロジェクト",
    "読者の意思決定",
    "資本市場",
    focus.length > 12 ? focus.slice(0, 12) : "",
  ].filter(Boolean);
  return anchors.some((anchor) => {
    const first = text.indexOf(anchor);
    return first >= 0 && text.indexOf(anchor, first + anchor.length) >= 0;
  });
}

function ensureJapaneseSentence(value: string) {
  const text = value.trim();
  if (!text) return text;
  if (/[。.!?！？]$/u.test(text)) return text;
  return `${text}。`;
}

function getUserExperiencePhrase(context: ReviewContext) {
  const source = [
    context.selfPr,
    context.studentExperience,
    context.skills,
    context.motivationAxis,
  ]
    .map((value) => compactText(value))
    .find(Boolean);

  if (source) {
    if (/企業分析|投資|金融研究会/u.test(source)) return "企業分析で培った情報整理力";
    if (/画像処理|異常検知|データ/u.test(source)) return "画像処理と異常検知の研究で培った、再現性と運用性を意識する姿勢";
    if (/取材|記者|記事|報道/u.test(source)) return "一次情報を集め、論点を読者に伝わる形へ整理する力";
    if (/接客|営業|顧客|提案/u.test(source)) return "相手の状況を聞き取り、課題を整理して提案する力";
    if (/IT|システム|プログラム|デジタル/u.test(source)) return "情報を構造化し、システムとして運用に落とし込む力";
    if (/複雑な情報|構造化|整理|議論|意思決定/u.test(source)) {
      return "複雑な情報を整理し、議論を意思決定に近づける力";
    }
    const phrase = source.replace(/[。.!?！？]+$/u, "");
    return phrase.length > 42 ? `${phrase.slice(0, 42)}力` : phrase;
  }

  return "課題を分解し、判断材料をそろえる力";
}

function getCompanyFocusPhrase(context: ReviewContext) {
  const text = `${context.companyName} ${context.position} ${context.companyMemo} ${context.benchmarkSummary}`;
  if (/三菱商事|総合商社|商社|事業投資|産業や地域/u.test(text)) {
    return "産業や地域を横断する事業投資の意思決定";
  }
  if (/東京エレクトロン|TEL|半導体|製造装置|ソフトウェア/u.test(text)) {
    return "半導体製造装置の価値向上";
  }
  if (/鹿島|建設|ゼネコン|都市開発|DX|IT戦略/u.test(text)) {
    return "建設プロジェクトのIT活用と業務高度化";
  }
  if (/日経|日本経済新聞|記者|報道|メディア/u.test(text)) {
    return "企業や経済の変化を読者の意思決定に資する情報として届けること";
  }
  if (/Goldman|ゴールドマン|投資銀行|アナリスト|金融/u.test(text)) {
    return "資本市場を通じた顧客の重要な意思決定支援";
  }
  if (context.companyMemo) {
    const sentence = compactText(context.companyMemo).split(/[。.!?！？]/u)[0];
    if (sentence.length >= 12) return sentence.slice(0, 54);
  }
  return `${context.position}で求められる課題解決`;
}

function compactText(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function enrichSuggestionEvidence(
  evidence: ReviewResponse["suggestions"][number]["evidence"],
  type: ReviewResponse["suggestions"][number]["type"],
  targetText: string,
  context: ReviewContext,
) {
  const enriched = evidence.length > 0 ? [...evidence] : [createEssayEvidence(targetText)];
  if (
    type === "company_fit" &&
    context.companyMemo &&
    !enriched.some((item) => item.sourceId === context.sourceId)
  ) {
    enriched.push(createCompanyEvidence(context));
  }
  if (
    ["logic", "expression", "authenticity"].includes(type) &&
    context.hasBenchmark &&
    !enriched.some((item) => item.sourceId === "benchmark-notes")
  ) {
    enriched.push(createBenchmarkEvidence(context));
  }
  if (!enriched.some((item) => item.sourceId === "essay-text")) {
    enriched.unshift(createEssayEvidence(targetText));
  }
  return enriched.slice(0, 4);
}

function createSuggestionRationale(
  suggestion: ReviewResponse["suggestions"][number],
  targetText: string,
  context: ReviewContext,
) {
  if (suggestion.type === "company_fit") {
    return `対象文「${targetText}」は志望理由の方向性を示していますが、採用済み企業調査で確認した「${context.companyMemo.slice(0, 120)}」との接続がまだ説明不足です。企業名や事業説明を足すだけではなく、${context.position}で自分の経験をどの課題に使うのかまで書くと、他社にも使い回せる印象を減らせます。`;
  }
  if (suggestion.type === "expression") {
    return `対象文「${targetText}」には意味の通る表現がありますが、参考ESベンチマークで弱い汎用表現として扱った語に近い抽象語が残っています。企業調査で確認した職種・事業の言葉に置き換え、本人が実際に扱った技術や判断を主語にすると、AIが整えた文章ではなく本人の言葉として読まれやすくなります。`;
  }
  if (suggestion.type === "logic") {
    return `対象文「${targetText}」は単独では読めますが、参考ESベンチマークの構成メモ「${context.benchmarkSummary.slice(0, 120)}」と比べると、原体験、企業固有の論点、入社後の貢献の順序がまだ弱いです。構成を並べ替えることで、企業理解と本人経験が分断されにくくなります。`;
  }
  return `対象文「${targetText}」について、ES本文、本人文脈、採用済み企業調査を照合すると、問題意識はありますが具体的な行動や確認済み根拠との接続がまだ薄いです。提案を反映する際は、本人が説明できる経験と出典で確認済みの企業情報だけを使うと、説得力と安全性が上がります。`;
}

function createEssayEvidence(targetText: string) {
  return {
    sourceId: "essay-text",
    sourceTitle: "ES本文",
    url: "",
    quotedOrParaphrasedEvidence: targetText,
    reliability: "user_provided" as const,
    supportsClaim: true,
    sourceQuality: "user_provided" as const,
  };
}

function createCompanyEvidence(context: ReviewContext) {
  return {
    sourceId: context.sourceId,
    sourceTitle: context.sourceTitle,
    url: context.sourceUrl,
    quotedOrParaphrasedEvidence:
      context.companyMemo || "採用済み企業調査または企業メモが不足しています。",
    reliability: context.sourceUrl ? ("user_provided" as const) : ("low" as const),
    supportsClaim: Boolean(context.companyMemo),
    sourceQuality: context.sourceUrl ? ("user_provided" as const) : ("unknown" as const),
  };
}

function createBenchmarkEvidence(context: ReviewContext) {
  return {
    sourceId: "benchmark-notes",
    sourceTitle: "参考ESベンチマーク",
    url: "",
    quotedOrParaphrasedEvidence:
      context.benchmarkSummary || "参考ESベンチマークは未入力です。",
    reliability: "user_provided" as const,
    supportsClaim: context.hasBenchmark,
    sourceQuality: "user_provided" as const,
  };
}

function createContextualCriterionReviews({
  companyName,
  position,
  targetText,
  companyMemo,
  benchmarkSummary,
  hasBenchmark,
  sourceId,
  sourceTitle,
  sourceUrl,
}: {
  companyName: string;
  position: string;
  targetText: string;
  companyMemo: string;
  benchmarkSummary: string;
  hasBenchmark: boolean;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
}): ReviewResponse["criterionReviews"] {
  const essayEvidence = {
    sourceId: "essay-text",
    sourceTitle: "ES本文",
    url: "",
    quotedOrParaphrasedEvidence: targetText,
    reliability: "user_provided" as const,
    supportsClaim: true,
    sourceQuality: "user_provided" as const,
  };
  const companyEvidence = {
    sourceId,
    sourceTitle,
    url: sourceUrl,
    quotedOrParaphrasedEvidence:
      companyMemo || "採用済み企業調査または企業メモが不足しています。",
    reliability: sourceUrl ? ("user_provided" as const) : ("low" as const),
    supportsClaim: Boolean(companyMemo),
    sourceQuality: sourceUrl ? ("user_provided" as const) : ("unknown" as const),
  };
  const benchmarkEvidence = {
    sourceId: "benchmark-notes",
    sourceTitle: "参考ESベンチマーク",
    url: "",
    quotedOrParaphrasedEvidence:
      benchmarkSummary || "参考ESベンチマークは未入力です。",
    reliability: "user_provided" as const,
    supportsClaim: hasBenchmark,
    sourceQuality: "user_provided" as const,
  };

  return [
    {
      criterion: "logical_structure",
      starRating: hasBenchmark ? 3 : 4,
      comment:
        "文章の流れは大きく破綻していませんが、企業理解、本人経験、入社後の行動像の接続がまだ並列的に見えます。",
      targetText,
      evidenceReasoning: hasBenchmark
        ? `ES本文の流れを、参考ESベンチマークの構成メモ「${benchmarkSummary.slice(0, 120)}」と照合しました。`
        : "ES本文の対象文を見て、課題、行動、志望理由の順序が読み手に自然に伝わるかを確認しました。",
      deductionReason:
        "経験から企業へ移る橋渡しが弱く、読み手が「なぜこの経験がこの企業の志望理由になるのか」を自力で補う必要があります。",
      revisionDirection:
        "関心の出発点、本人経験で得た再現性、応募先での使い道の順に並べ直すと、評価者が納得しやすくなります。",
      strengths: ["経験の出発点は読み取れる", "大きな論理破綻はない"],
      weaknesses: ["企業理解と本人経験の接続が一段浅い", "締めの行動像が抽象的"],
      ratingRationale:
        "対象文には本人の関心が含まれているため、構成の土台はあります。ただし、企業理解の文と本人経験の文が十分に噛み合っておらず、志望理由としての必然性はまだ弱いです。参考ESベンチマークがある場合は、原体験、企業固有の論点、入社後の行動像の順に沿っているかを見ています。この接続が明確になれば星4以上に上げられます。",
      evidence: hasBenchmark ? [essayEvidence, benchmarkEvidence] : [essayEvidence],
    },
    {
      criterion: "specificity_and_original_experience",
      starRating: 3,
      comment:
        "本人経験は入っていますが、行動の粒度、成果、判断理由がまだ薄く、他の学生との差が出にくい状態です。",
      targetText,
      evidenceReasoning:
        "ES本文の対象文を根拠に、経験が本人固有の行動として読めるか、成果や判断の具体性があるかを確認しました。",
      deductionReason:
        "何をしたかは分かっても、どの場面で、何を迷い、どう工夫したのかが不足しています。",
      revisionDirection:
        "一つの経験に絞り、課題の初期状態、自分の判断、実行した工夫、変化の順に一段詳しく書いてください。",
      strengths: ["本人経験の方向性はある", "志望職種に接続できる素材がある"],
      weaknesses: ["成果や変化の確認材料が少ない", "本人ならではの判断が見えにくい"],
      ratingRationale:
        "対象文から経験の存在は読み取れるため、最低限の本人性はあります。一方で、具体的な場面、役割、成果の変化が不足しているため、再現性の評価がしづらいです。難関企業向けESでは、抽象的な努力よりも、課題をどう捉えて行動を選んだかが見られます。その情報が補えれば、具体性と本人性の評価が上がります。",
      evidence: [essayEvidence],
    },
    {
      criterion: "company_understanding_and_fit",
      starRating: companyMemo ? 3 : 2,
      comment:
        `${companyName}への関心は示せていますが、${position}で使う経験と企業固有情報が同じ文脈で接続されるとさらに強くなります。`,
      targetText,
      evidenceReasoning:
        `採用済み企業調査または企業メモ「${(companyMemo || "未入力").slice(0, 140)}」とES本文の対象文を照合しました。`,
      deductionReason:
        "企業名や業界説明だけでは、他社にも使い回せる志望動機に見えやすいです。公式情報で確認した職種要件や事業課題と本人経験が一文内で接続されていません。",
      revisionDirection:
        `${companyName}の事業・職種情報を一つ選び、自分の経験がその業務のどの課題に使えるのかまで書いてください。`,
      strengths: ["企業理解を入れようとしている", "職種接続の余地がある"],
      weaknesses: ["企業固有性が弱い", "職種での貢献場面がまだ抽象的"],
      ratingRationale:
        `${companyName}に関する情報を使おうとしている点は評価できます。ただし、現状では企業理解が説明に留まり、本人経験と同じ文脈で結びついていません。企業理解は、単に事業名を入れるだけでは高評価にならず、経験がその企業の課題や職種要件にどう効くかまで書けて初めて強くなります。採用済み企業調査の根拠を使い、未確認の断定を避けながら接続を具体化すると評価が上がります。`,
      evidence: [essayEvidence, companyEvidence],
    },
    {
      criterion: "expression_quality",
      starRating: 3,
      comment:
        "文章は読めますが、抽象語と就活テンプレ語が残ると、企業研究を踏まえた言葉に見えにくくなります。",
      targetText,
      evidenceReasoning: hasBenchmark
        ? "ES本文の表現を、参考ESベンチマークの弱い汎用表現と照合しました。"
        : "ES本文の対象文を見て、抽象語、冗長な接続、企業研究に対して弱い語彙がないか確認しました。",
      deductionReason:
        "『貢献したい』『成長したい』型の表現は、本人の行動や企業固有の価値に変換されないとAIっぽく見えます。",
      revisionDirection:
        "抽象語を、本人が実際に行った行動、扱った対象、応募先で使う技術や業務の言葉に置き換えてください。",
      strengths: ["意味は取りやすい", "過度に飾った文章ではない"],
      weaknesses: ["語彙が一般的", "企業固有の言葉が少ない"],
      ratingRationale:
        "対象文は文法的には大きく崩れていません。しかし、語彙が一般的な就活文に寄っているため、企業理解の深さが表現から伝わりにくいです。参考ESベンチマークがある場合は、弱い汎用表現に近い語を減点対象にしています。本人の経験に根差した語彙へ置き換えることで、自然さと説得力を同時に上げられます。",
      evidence: hasBenchmark ? [essayEvidence, benchmarkEvidence] : [essayEvidence],
    },
    {
      criterion: "authenticity_and_ai_likeness",
      starRating: 3,
      comment:
        "本人の経験は残っていますが、きれいにまとまりすぎた一般論が増えると、AIが整えた文章のように見えます。",
      targetText,
      evidenceReasoning:
        "ES本文の対象文を根拠に、本人しか語れない判断、迷い、工夫が含まれているかを確認しました。",
      deductionReason:
        "企業名を置き換えても成立する表現や、経験と結びつかない理念語があると本人性が薄くなります。",
      revisionDirection:
        "自分が実際に見た課題、判断した理由、次に同じ状況でどう動くかを入れて、整いすぎた一般論を減らしてください。",
      strengths: ["原体験を残す余地がある", "過度な誇張は少ない"],
      weaknesses: ["本人の判断がまだ薄い", "一般論に寄る箇所がある"],
      ratingRationale:
        "対象文には本人の経験に接続できる要素があります。その一方で、表現がきれいに整理されすぎると、誰でも言える志望理由に近づきます。AI臭さは文体だけでなく、本人の判断や違和感が抜けることで出ます。経験の具体的な迷いと選択を戻すと、本人性が高まります。",
      evidence: [essayEvidence],
    },
  ];
}
