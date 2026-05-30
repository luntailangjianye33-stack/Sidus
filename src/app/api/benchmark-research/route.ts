import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getOpenAIErrorPayload } from "@/lib/api-error";
import type {
  BenchmarkNotes,
  BenchmarkResearchRequest,
  BenchmarkResearchResponse,
  BenchmarkResearchSource,
} from "@/types/sidus";

type BenchmarkDraft = {
  passedEssayPatterns?: string;
  strongPhrases?: string;
  weakGenericPhrases?: string;
  structureHints?: string;
  sources?: BenchmarkResearchSource[];
  warnings?: string[];
};

const searchModel =
  process.env.OPENAI_SEARCH_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const requestTimeoutMs = 60_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BenchmarkResearchRequest;
    const applicationTarget = body.applicationTarget;

    if (!applicationTarget?.companyName?.trim()) {
      return NextResponse.json(
        {
          error: "applicationTarget.companyName is required",
          code: "company_name_required",
        },
        { status: 400 },
      );
    }

    const client = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
    const response = client
      ? await createBenchmarkWithSearch(client, body)
      : createFallbackBenchmark(body);

    return NextResponse.json(response);
  } catch (error) {
    const openAIError = getOpenAIErrorPayload(error);
    if (openAIError) {
      return NextResponse.json(openAIError.body, {
        status: openAIError.status,
      });
    }

    if (isTimeoutOrAbortError(error)) {
      return NextResponse.json(
        {
          error: "Benchmark research timed out",
          code: "benchmark_research_timeout",
        },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid benchmark research request",
        code: "benchmark_research_failed",
      },
      { status: 400 },
    );
  }
}

async function createBenchmarkWithSearch(
  client: OpenAI,
  request: BenchmarkResearchRequest,
): Promise<BenchmarkResearchResponse> {
  const company = request.applicationTarget.companyName;
  const position = request.applicationTarget.position || "応募職種";
  const companyMemo =
    request.acceptedCompanyResearch?.companyUnderstandingMemo ||
    request.applicationTarget.companyMemo ||
    "";

  const prompt = `
${company} / ${position} 向けのESレビュー用ベンチマークを作ってください。

目的:
- ワンキャリア等の内定ES本文を転載・要約・再現しない。
- 公開検索で見つかる範囲の情報から、通過ESにありがちな「構造」「評価されやすい観点」「語彙水準」「避けるべき汎用表現」だけを抽出する。
- ES本文そのものではなく、ユーザーが自分の経験に変換するためのレビュー基準にする。

企業理解:
${companyMemo}

必ずJSONだけで返してください。
{
  "passedEssayPatterns": "通過ESに多そうな構造を3〜5行。本文の再現は禁止。",
  "strongPhrases": "その企業/職種に合う強い語彙・観点を箇条書き。丸写し禁止。",
  "weakGenericPhrases": "使い回し感が出る弱い汎用表現を箇条書き。",
  "structureHints": "レビュー時に見るべき構成ヒントを3〜5行。",
  "sources": [{"title":"参考にした公開ページ名","url":"URL","note":"何を見たか"}],
  "warnings": ["著作物本文を再現しない等の注意"]
}
`.trim();

  const response = await client.responses.create(
    {
      model: searchModel,
      instructions:
        "You create safe essay benchmark notes. Do not reproduce or summarize copyrighted passed essays. Return JSON only.",
      input: prompt,
      tools: [
        {
          type: "web_search_preview",
          search_context_size: "medium",
          user_location: {
            type: "approximate",
            country: "JP",
            timezone: "Asia/Tokyo",
          },
        },
      ],
      tool_choice: { type: "web_search_preview" },
      include: ["web_search_call.action.sources"],
      max_output_tokens: 1200,
    },
    { signal: AbortSignal.timeout(requestTimeoutMs) },
  );

  const draft = parseBenchmarkDraft(response.output_text ?? "");
  return toBenchmarkResponse(request, draft);
}

function createFallbackBenchmark(
  request: BenchmarkResearchRequest,
): BenchmarkResearchResponse {
  const company = request.applicationTarget.companyName;
  const position = request.applicationTarget.position || "応募職種";
  const memo =
    request.acceptedCompanyResearch?.companyUnderstandingMemo ||
    request.applicationTarget.companyMemo;

  return toBenchmarkResponse(request, {
    passedEssayPatterns: [
      "原体験で関心の出発点を示す",
      `${company}の事業・顧客・提供価値に接続する`,
      `${position}でどう行動するかを具体化する`,
      "最後は抽象的な抱負ではなく、入社後の行動像で締める",
    ].join("\n"),
    strongPhrases: [
      "企業固有の課題に対して、自分の経験をどう使うか",
      "相手の状況を理解し、実行可能な選択肢に落とす",
      memo ? `確認済み企業理解: ${memo.slice(0, 120)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    weakGenericPhrases:
      "社会に貢献したい\n成長したい\n信頼される人材になりたい\n貴社の理念に共感した",
    structureHints:
      "企業名を出すだけでなく、事業・顧客・職種要件に接続する。\n参考ESの本文は使わず、構成だけを自分の経験に変換する。",
    sources: [],
    warnings: [
      "OpenAI APIキー未設定のため、検索なしのベンチマーク雛形を生成しています。",
      "通過ES本文の転載ではなく、構造メモとして扱ってください。",
    ],
  });
}

function toBenchmarkResponse(
  request: BenchmarkResearchRequest,
  draft: BenchmarkDraft,
): BenchmarkResearchResponse {
  const fallback = createBenchmarkNoteFallbacks(request);
  const rawNotes = {
    passedEssayPatterns: normalizeText(draft.passedEssayPatterns),
    strongPhrases: normalizeText(draft.strongPhrases),
    weakGenericPhrases: normalizeText(draft.weakGenericPhrases),
    structureHints: normalizeText(draft.structureHints),
  };
  const benchmarkNotes: BenchmarkNotes = {
    passedEssayPatterns: selectBenchmarkNote(
      rawNotes.passedEssayPatterns,
      fallback.passedEssayPatterns,
      "passedEssayPatterns",
    ),
    strongPhrases: selectBenchmarkNote(
      rawNotes.strongPhrases,
      fallback.strongPhrases,
      "strongPhrases",
    ),
    weakGenericPhrases:
      rawNotes.weakGenericPhrases || fallback.weakGenericPhrases,
    structureHints: selectBenchmarkNote(
      rawNotes.structureHints,
      fallback.structureHints,
      "structureHints",
    ),
  };
  const supplementedFields = [
    benchmarkNotes.passedEssayPatterns !== rawNotes.passedEssayPatterns
      ? "通過ESの型"
      : "",
    benchmarkNotes.strongPhrases !== rawNotes.strongPhrases
      ? "強い語彙・言い回し"
      : "",
    benchmarkNotes.structureHints !== rawNotes.structureHints ? "構成ヒント" : "",
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    companyName: request.applicationTarget.companyName,
    position: request.applicationTarget.position,
    benchmarkNotes,
    sources: (draft.sources ?? [])
      .filter((source) => source.url)
      .slice(0, 6)
      .map((source) => ({
        title: normalizeText(source.title) || source.url,
        url: source.url,
        note: normalizeText(source.note),
      })),
    warnings: [
      ...(draft.warnings ?? []),
      supplementedFields.length > 0
        ? `空欄だった項目を企業調査・職種情報から補完しました: ${supplementedFields.join("、")}`
        : "",
      "通過ES本文の転載・再現ではなく、構造と語彙水準だけをレビューに使います。",
    ].map(normalizeText).filter(Boolean),
  };
}

function selectBenchmarkNote(
  value: string,
  fallback: string,
  field: keyof BenchmarkNotes,
) {
  if (!value) return fallback;
  return isLowSignalBenchmarkNote(value, field) ? fallback : value;
}

function isLowSignalBenchmarkNote(value: string, field: keyof BenchmarkNotes) {
  const lines = value.split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return true;
  const weakGenericCount = lines.filter((line) =>
    /自己紹介|成長意欲|志望の強さ|志望の意欲|キャリアビジョン|御社|新しい環境|柔軟な対応力|チームワーク|挑戦を楽しみ|努力しています/u.test(
      line,
    ),
  ).length;
  if (weakGenericCount >= Math.ceil(lines.length / 2)) return true;
  if (
    ["passedEssayPatterns", "structureHints"].includes(field) &&
    /自己紹介|結論として|再度志望|志望の意欲|キャリアビジョン/u.test(value)
  ) {
    return true;
  }
  if (
    field !== "weakGenericPhrases" &&
    !/(企業|事業|職種|経験|課題|顧客|現場|技術|開発|研究|営業|金融|建設|商社|メーカー|IT|DX|データ|システム)/u.test(
      value,
    )
  ) {
    return true;
  }
  return false;
}

function createBenchmarkNoteFallbacks(
  request: BenchmarkResearchRequest,
): BenchmarkNotes {
  const company = request.applicationTarget.companyName;
  const position = request.applicationTarget.position || "応募職種";
  const research = request.acceptedCompanyResearch;
  const companyBusiness =
    research?.businessSummary?.find(Boolean) ||
    research?.companyUnderstandingMemo ||
    `${company}の事業理解`;
  const roleFocus =
    research?.roleFitHypotheses?.find(Boolean) ||
    research?.esReviewFocus?.find(Boolean) ||
    `${position}で使う経験・技術・強み`;
  const evidenceFocus =
    research?.evidenceDigest?.find((item) => item.useRecommendation !== "do_not_use")
      ?.summary || companyBusiness;

  return {
    passedEssayPatterns: [
      "関心の出発点を一文で置く",
      `企業理解では「${toBenchmarkFragment(companyBusiness)}」を根拠に、なぜ${company}なのかを示す`,
      `職種接続では「${toBenchmarkFragment(roleFocus)}」と本人経験を同じ文脈でつなぐ`,
      "入社後にどの現場・業務でどう行動するかまで落とす",
    ].join("\n"),
    strongPhrases: [
      "事業・職種・本人経験を一文内で接続する",
      "現場で使える形に落とし込む",
      "課題を構造化し、実装可能な打ち手に変える",
      `根拠語彙: ${evidenceFocus.slice(0, 90)}`,
    ].join("\n"),
    weakGenericPhrases:
      "社会に貢献したい\n成長したい\n信頼される人材になりたい\n貴社の理念に共感した\n幅広い事業に魅力を感じた",
    structureHints: [
      "企業名だけでなく、公式情報で確認できた事業・職種要件を入れる",
      "本人経験は成果よりも、課題の捉え方と行動の再現性を示す",
      "企業理解の文と自己PRの文を分離せず、経験が企業課題に使える形でつなぐ",
      "最後は抽象的な抱負ではなく、入社後の行動像で締める",
    ].join("\n"),
  };
}

function toBenchmarkFragment(value: string) {
  return normalizeText(value)
    .replace(/[。.!！?？]+$/u, "")
    .replace(/^確認済み企業理解[:：]\s*/u, "")
    .slice(0, 90);
}

function parseBenchmarkDraft(text: string): BenchmarkDraft {
  const jsonText =
    text.match(/```json\s*([\s\S]*?)```/u)?.[1] ??
    text.match(/\{[\s\S]*\}/u)?.[0] ??
    text;

  try {
    return JSON.parse(jsonText) as BenchmarkDraft;
  } catch {
    return {
      passedEssayPatterns: "",
      strongPhrases: "",
      weakGenericPhrases: "",
      structureHints: text.slice(0, 1200),
      sources: [],
      warnings: ["検索結果の整形に失敗したため、本文を構成ヒントとして扱っています。"],
    };
  }
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (value && typeof value === "object") {
    return Object.values(value)
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function isTimeoutOrAbortError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || /timeout|aborted/i.test(error.message);
}
