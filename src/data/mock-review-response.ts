import type { ReviewResponse } from "@/types/sidus";

export const mockReviewResponse: ReviewResponse = {
  reviewId: "mock-review-standard-good-draft",
  generatedAt: "2026-05-23T00:00:00.000Z",
  summary: {
    starRating: 3,
    headline: "原体験は強いが、企業理解との接続に余地がある",
    overallComment:
      "学生団体での運用改善経験は、SaaS企業の業務改善文脈と相性があります。一方で、現状の文章では応募先の事業特性との接続がやや一般的で、Northstar Systemsを選ぶ理由がまだ薄く見えます。",
    strengths: [
      "課題発見から運用改善までの行動が一貫している",
      "ユーザー行動を観察した経験が企業文脈と接続しやすい",
      "過度に盛った表現が少なく、本人性を保ちやすい",
    ],
    priorityFixes: [
      "企業の業務プロセス改善SaaSとの接続を明示する",
      "説明会参加率の改善幅や比較軸を補う",
      "最後の志望理由を一般論ではなく応募先固有の言葉へ寄せる",
    ],
    targetCompanyFitSummary:
      "現場の摩擦を観察して改善した経験は、バックオフィス業務の負荷を減らすSaaS事業との親和性があります。",
  },
  criterionReviews: [
    {
      criterion: "logical_structure",
      starRating: 4,
      comment:
        "課題、行動、結果、学びの順序は自然です。最後に応募先との接続を足すと、志望動機としての流れが強くなります。",
      strengths: ["経験の流れが追いやすい", "行動主体が明確"],
      weaknesses: ["志望先との接続が最後に急に出てくる"],
    },
    {
      criterion: "specificity_and_original_experience",
      starRating: 3,
      comment:
        "フォーム改善やリマインド運用という具体性はありますが、成果の数値が不足しています。",
      strengths: ["実際に行った改善内容が書かれている"],
      weaknesses: ["説明会参加率の改善幅が不明"],
    },
    {
      criterion: "company_understanding_and_fit",
      starRating: 3,
      comment:
        "業務改善への関心は伝わりますが、応募先が扱う業務領域への理解をもう一段具体化できます。",
      strengths: ["SaaS企業との接点を作りやすい経験がある"],
      weaknesses: ["企業の提供価値への言及がまだ抽象的"],
    },
    {
      criterion: "expression_quality",
      starRating: 4,
      comment:
        "表現はおおむね自然です。最後の一文だけ少し一般的なので、企業文脈を入れると締まります。",
      strengths: ["読みやすく過度な装飾がない"],
      weaknesses: ["志望理由の表現が汎用的"],
    },
    {
      criterion: "authenticity_and_ai_likeness",
      starRating: 4,
      comment:
        "具体的な運用改善経験があるため、AI生成文のような空疎さは比較的少ないです。",
      strengths: ["本人が経験した行動が見える"],
      weaknesses: ["最後の価値提供表現はややテンプレート的"],
    },
  ],
  evidenceAudit: [
    {
      id: "audit-001",
      claimText:
        "応募先は請求、経費、ワークフローなどのバックオフィス業務を効率化するSaaSを提供している",
      status: "supported",
      verificationStatus: "verified_by_source",
      confidence: "high",
      sourceQuality: "user_provided",
      checkedBy: {
        research: true,
        verifier: true,
        reviewer: true,
      },
      assessment:
        "ユーザー提供の企業メモと参考URLメモが、業務プロセス改善SaaSという理解を支持しています。",
      evidence: [
        {
          sourceId: "northstar-product",
          sourceTitle: "Northstar Systems Product Overview",
          url: "https://example.com/northstar/product",
          quotedOrParaphrasedEvidence:
            "請求、経費、ワークフローなど、現場の運用負荷を減らすプロダクトに強みを持つ。",
          reliability: "user_provided",
          supportsClaim: true,
          sourceQuality: "user_provided",
        },
      ],
      userCheckRequired: false,
    },
    {
      id: "audit-002",
      claimText: "説明会参加率を前年より高めることができた",
      status: "weakly_supported",
      verificationStatus: "needs_user_confirmation",
      confidence: "medium",
      sourceQuality: "user_provided",
      checkedBy: {
        research: true,
        verifier: true,
        reviewer: true,
      },
      assessment:
        "改善した事実は本人文脈に含まれていますが、改善幅や測定条件は未確認です。",
      evidence: [
        {
          sourceId: "user-context-student-experience",
          sourceTitle: "ユーザー入力: ガクチカ素材",
          quotedOrParaphrasedEvidence:
            "学生団体で新歓導線を改善し、説明会参加率を前年より改善した。",
          reliability: "user_provided",
          supportsClaim: true,
          sourceQuality: "user_provided",
        },
      ],
      caution: "数値を入れる場合は、実際の記録や記憶に基づいて確認してください。",
      userCheckRequired: true,
    },
  ],
  suggestions: [
    {
      id: "suggestion-001",
      type: "company_fit",
      severity: "high",
      title: "企業理解との接続を具体化する",
      targetText:
        "この経験から、ユーザーの行動を観察し、業務の流れを改善することに関心を持ちました。",
      problem:
        "経験から得た関心は伝わりますが、応募先が扱うバックオフィス業務改善との接続がまだ一般的です。",
      suggestedRevision:
        "この経験から、現場の行動や運用上の摩擦を観察し、業務プロセスそのものを改善するSaaSに関心を持ちました。",
      rationale:
        "ユーザーの経験を残しながら、応募先の事業領域である業務プロセス改善に接続できます。",
      expectedImpact:
        "志望理由が汎用的なSaaS志望から、応募先の提供価値に沿った説明へ近づきます。",
      evidence: [
        {
          sourceId: "northstar-product",
          sourceTitle: "Northstar Systems Product Overview",
          url: "https://example.com/northstar/product",
          quotedOrParaphrasedEvidence:
            "バックオフィス業務を効率化するSaaSを提供。",
          reliability: "user_provided",
          supportsClaim: true,
          sourceQuality: "user_provided",
        },
      ],
      userConfirmationNeeded: [
        "業務プロセス改善SaaSという理解が応募先の最新情報と合っているか",
      ],
      diffHint: {
        before:
          "この経験から、ユーザーの行動を観察し、業務の流れを改善することに関心を持ちました。",
        after:
          "この経験から、現場の行動や運用上の摩擦を観察し、業務プロセスそのものを改善するSaaSに関心を持ちました。",
        changeSummary:
          "一般的な業務改善への関心を、応募先の事業領域に近い表現へ変更。",
      },
    },
    {
      id: "suggestion-002",
      type: "specificity",
      severity: "medium",
      title: "成果の比較軸を補う",
      targetText: "説明会参加率を前年より高めることができました。",
      problem:
        "成果は書かれていますが、どの程度改善したのかが分からず、読み手がインパクトを判断しづらいです。",
      suggestedRevision:
        "可能であれば、説明会参加率を何ポイント改善したのか、または参加率の算出方法を補ってください。",
      rationale:
        "成果の測定条件を明確にすると、行動の効果が読み手に伝わりやすくなります。",
      expectedImpact: "具体性と信頼性が上がります。",
      evidence: [
        {
          sourceId: "user-context-student-experience",
          sourceTitle: "ユーザー入力: ガクチカ素材",
          quotedOrParaphrasedEvidence: "説明会参加率を前年より改善した。",
          reliability: "user_provided",
          supportsClaim: true,
          sourceQuality: "user_provided",
        },
      ],
      userConfirmationNeeded: ["実際の改善幅", "前年との比較条件"],
      diffHint: {
        before: "説明会参加率を前年より高めることができました。",
        after:
          "説明会参加率を前年より高めることができました。具体的には、参加率の改善幅や比較条件を補うと説得力が増します。",
        changeSummary: "成果に数値または比較条件を追加する余地を提示。",
      },
    },
    {
      id: "suggestion-003",
      type: "authenticity",
      severity: "low",
      title: "締めの一文を本人の行動に寄せる",
      targetText:
        "貴社でも、顧客の業務に向き合いながら、使われ続ける仕組みづくりに挑戦したいです。",
      problem:
        "方向性は良いですが、やや一般的で、本人の経験から生まれた志望理由としてはもう一歩具体化できます。",
      suggestedRevision:
        "貴社でも、現場で生じる小さな摩擦を見逃さず、顧客に使われ続ける業務改善の仕組みづくりに挑戦したいです。",
      rationale:
        "学生団体での運用改善経験と、応募先の顧客業務への向き合い方を自然につなげられます。",
      expectedImpact: "本人性を残しながら、志望理由の締まりが良くなります。",
      evidence: [
        {
          sourceId: "user-context-values",
          sourceTitle: "ユーザー入力: 価値観",
          quotedOrParaphrasedEvidence:
            "派手な施策よりも、使われ続ける改善を重視する。",
          reliability: "user_provided",
          supportsClaim: true,
          sourceQuality: "user_provided",
        },
      ],
      userConfirmationNeeded: ["この表現が自分の言葉として自然か"],
      diffHint: {
        before:
          "貴社でも、顧客の業務に向き合いながら、使われ続ける仕組みづくりに挑戦したいです。",
        after:
          "貴社でも、現場で生じる小さな摩擦を見逃さず、顧客に使われ続ける業務改善の仕組みづくりに挑戦したいです。",
        changeSummary: "締めの表現を、本人の観察姿勢に寄せる。",
      },
    },
  ],
  userQuestions: [
    {
      id: "question-001",
      question: "説明会参加率の改善幅は具体的に何%または何ポイントでしたか。",
      reason: "成果の信頼性を高めるため。",
      relatedSuggestionIds: ["suggestion-002"],
    },
    {
      id: "question-002",
      question:
        "応募先のどのプロダクトや顧客課題に最も関心がありますか。",
      reason: "企業理解との接続をより具体化するため。",
      relatedSuggestionIds: ["suggestion-001"],
    },
  ],
  finalDraft: {
    text: "学生団体の新歓活動で、申込から参加までの離脱率が高い課題に取り組みました。私はフォームの設問と案内文を見直し、参加者へのリマインド運用を整えました。その結果、説明会参加率を前年より高めることができました。この経験から、現場の行動や運用上の摩擦を観察し、業務プロセスそのものを改善するSaaSに関心を持ちました。貴社でも、顧客に使われ続ける業務改善の仕組みづくりに挑戦したいです。",
    characterCount: 194,
    notes: [
      "数値成果はユーザー確認後に差し替える",
      "企業名や具体プロダクト名を入れるとさらに強くなる",
    ],
  },
  sources: [
    {
      id: "northstar-product",
      title: "Northstar Systems Product Overview",
      url: "https://example.com/northstar/product",
      sourceType: "url",
      usedFor: ["企業理解監査", "企業理解との接続提案"],
    },
    {
      id: "user-context-student-experience",
      title: "ユーザー入力: ガクチカ素材",
      sourceType: "user_memo",
      usedFor: ["成果の具体性確認"],
    },
    {
      id: "user-context-values",
      title: "ユーザー入力: 価値観",
      sourceType: "user_memo",
      usedFor: ["本人性チェック"],
    },
  ],
  warnings: [
    {
      code: "ambiguous_claim",
      message:
        "説明会参加率の改善幅が未入力です。数値を入れる場合はユーザー確認が必要です。",
      severity: "warning",
    },
  ],
};
