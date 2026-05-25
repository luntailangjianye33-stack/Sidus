import type { SampleEssay } from "@/types/sidus";

export const sampleEssays: SampleEssay[] = [
  {
    id: "nikkei-reporter-intern",
    title: "日経新聞: 経済メディア向け志望動機",
    description:
      "企業理解、公開情報の扱い、記者職らしい具体性を検証するための実APIデモケース。",
    essayText:
      "私は、経済や企業活動の変化を生活者に伝える仕事に携わりたいと考えています。大学では学生新聞の編集部に所属し、地域商店街のキャッシュレス導入について取材しました。当初は制度説明に偏った記事になりましたが、店主と利用者の双方に話を聞くことで、手数料負担や高齢者対応といった現場の論点を掘り下げることができました。結果として、読者から「背景が分かりやすい」と反応をもらいました。貴社でも、企業や市場の動きを単なるニュースとしてではなく、社会や個人の意思決定につながる情報として届けたいです。",
    applicationTarget: {
      industry: "新聞 / 経済メディア / 情報サービス",
      companyName: "日本経済新聞社",
      position: "記者職インターン",
      companyMemo:
        "日本経済新聞社は、経済・企業・金融・国際ニュースを中心に報道するメディア企業。日経電子版などデジタルサービスも展開し、ビジネスパーソンの意思決定に資する情報提供を重視している。",
      referenceUrls: [
        {
          id: "nikkei-home",
          title: "日本経済新聞 電子版",
          url: "https://www.nikkei.com/",
          memo: "経済、企業、金融、国際などのニュースを扱う日経電子版の公式サイト。",
          sourceType: "url",
        },
      ],
    },
    userContext: {
      selfPr:
        "相手の立場を分けて取材し、抽象的な制度説明を現場の論点に落とし込める。",
      studentExperience:
        "学生新聞で地域商店街のキャッシュレス導入を取材し、店主と利用者双方の視点から記事を再構成した。",
      motivationAxis:
        "一次情報をもとに、企業や経済の変化を読者の意思決定に役立つ形で伝えたい。",
      skills: "取材設計、論点整理、記事構成、読者視点での説明。",
      values: "事実に基づき、読者の判断材料になる情報を届けること。",
      seminarMemo:
        "経済報道では、企業や市場の動きを読者の意思決定に役立つ形で伝える姿勢が重要だと理解した。",
      obOgMemo:
        "記者職では、一次情報へのアクセスと、複数の立場を踏まえた論点整理が評価されると聞いた。",
      additionalNotes:
        "日経新聞社の公開情報は、実API調査で取得可否と根拠表示を確認したい。",
    },
    targetCharacterCount: 400,
    expectedChecks: [
      "企業理解の根拠表示",
      "記者職としての具体性",
      "本人経験と日経らしさの接続",
    ],
  },
  {
    id: "standard-good-draft",
    title: "標準: 業務改善経験のある自己PR",
    description:
      "素材は良いが、応募先企業の事業理解との接続がやや弱い標準ケース。",
    essayText:
      "学生団体の新歓活動で、申込から参加までの離脱率が高い課題に取り組みました。私はフォームの設問と案内文を見直し、参加者へのリマインド運用を整えました。その結果、説明会参加率を前年より高めることができました。この経験から、ユーザーの行動を観察し、業務の流れを改善することに関心を持ちました。貴社でも、顧客の業務に向き合いながら、使われ続ける仕組みづくりに挑戦したいです。",
    applicationTarget: {
      industry: "SaaS / Enterprise Software",
      companyName: "Northstar Systems",
      position: "Business Development Intern",
      companyMemo:
        "企業のバックオフィス業務を効率化するSaaSを提供。請求、経費、ワークフローなど、現場の運用負荷を減らすプロダクトに強みを持つ。",
      referenceUrls: [
        {
          id: "northstar-product",
          title: "Northstar Systems Product Overview",
          url: "https://example.com/northstar/product",
          memo: "業務プロセス改善SaaSの製品概要。",
          sourceType: "url",
        },
      ],
    },
    userContext: {
      selfPr: "課題を観察し、運用を地道に改善できる点。",
      studentExperience:
        "学生団体で新歓導線を改善し、説明会参加率を前年より改善した。",
      motivationAxis: "現場の非効率を仕組みで解消する仕事がしたい。",
      skills: "仮説検証、フォーム改善、運用設計、関係者調整。",
      values: "派手な施策よりも、使われ続ける改善を重視する。",
      seminarMemo: "顧客の業務理解を重視する説明が印象に残った。",
      obOgMemo: "営業もプロダクト理解と業務理解が重要だと聞いた。",
      additionalNotes: "定量成果をもう少し明確にしたい。",
    },
    targetCharacterCount: 400,
    expectedChecks: [
      "企業理解との接続",
      "定量成果の明確化",
      "論理構成の自然さ",
    ],
  },
  {
    id: "abstract-generic-draft",
    title: "抽象的: 一般論が多い志望動機",
    description:
      "成長、社会貢献などの抽象表現が多く、本人性と具体性が不足するケース。",
    essayText:
      "私は社会に大きな影響を与えられる人材になりたいと考えています。大学生活では多くの人と関わり、チームで目標に向かって努力する大切さを学びました。貴社は高い成長力を持ち、若手から挑戦できる環境があると感じています。私はそのような環境で自分を成長させ、社会に貢献したいです。将来は多くの人に価値を届けられるビジネスパーソンになりたいです。",
    applicationTarget: {
      industry: "Consulting / Digital Transformation",
      companyName: "Lumen Strategy",
      position: "Consultant Intern",
      companyMemo:
        "企業のデジタル変革を支援するコンサルティングファーム。戦略立案だけでなく、業務改革とシステム導入の実行支援まで行う。",
      referenceUrls: [
        {
          id: "lumen-careers",
          title: "Lumen Strategy Careers",
          url: "https://example.com/lumen/careers",
          memo: "実行支援を重視する採用ページ。",
          sourceType: "url",
        },
      ],
    },
    userContext: {
      selfPr: "チームで粘り強く動ける。",
      studentExperience:
        "ゼミで地域商店街の来訪者調査を行い、改善案を提案した。",
      motivationAxis: "抽象的な議論だけでなく、実行まで関わりたい。",
      skills: "調査設計、インタビュー、資料作成。",
      values: "現場に入り込んで課題を理解すること。",
      seminarMemo: "社員が現場実装まで伴走すると話していた。",
      obOgMemo: "若手もクライアントの現場に出る機会が多い。",
      additionalNotes: "自分の経験をどう入れればいいか分からない。",
    },
    targetCharacterCount: 400,
    expectedChecks: [
      "本人性不足",
      "具体性不足",
      "企業ごとの差分不足",
    ],
  },
  {
    id: "company-understanding-risk",
    title: "企業理解リスク: 事業理解が単純化されたES",
    description:
      "企業をAIチャット企業として単純化しており、企業メモとのズレを監査するケース。",
    essayText:
      "私はAIチャットボットの可能性に魅力を感じ、貴社を志望します。今後はあらゆる仕事がチャット形式で効率化されると考えており、貴社はその中心にいる企業だと理解しています。大学ではプロジェクト管理ツールを導入し、チームの連絡を効率化しました。この経験を活かし、貴社のAIチャットサービスをより多くの企業に広げたいです。",
    applicationTarget: {
      industry: "AI / Productivity Software",
      companyName: "Atlas Workflow",
      position: "Product Manager Intern",
      companyMemo:
        "AIチャットボット単体ではなく、請求処理、稟議、経費精算、契約管理などの業務プロセスを横断的に改善するSaaS企業。AIは業務データ活用と自動化のための手段として位置づけられている。",
      referenceUrls: [
        {
          id: "atlas-workflow-platform",
          title: "Atlas Workflow Platform",
          url: "https://example.com/atlas/platform",
          memo: "業務プロセス全体を扱うプラットフォーム説明。",
          sourceType: "url",
        },
      ],
    },
    userContext: {
      selfPr: "チームの情報共有を改善した経験。",
      studentExperience:
        "研究プロジェクトでタスク管理ツールを導入し、期限遅延を減らした。",
      motivationAxis: "AIそのものより、業務の流れを変えるプロダクトに関心がある。",
      skills: "課題整理、ツール導入、チーム運用改善。",
      values: "技術を目的ではなく、業務改善の手段として使う。",
      seminarMemo: "AIは業務フローに組み込まれて初めて価値が出ると説明されていた。",
      obOgMemo: "PMは顧客業務の深い理解が重要だと聞いた。",
      additionalNotes: "AIという言葉を使いすぎているかもしれない。",
    },
    targetCharacterCount: 400,
    expectedChecks: [
      "企業理解のズレ",
      "根拠リンク表示",
      "ユーザー確認事項",
    ],
  },
  {
    id: "over-length-draft",
    title: "長すぎる: 400字制限を超えるガクチカ",
    description:
      "背景説明が長く、目標文字数に向けた削減と差分表示を検証するケース。",
    essayText:
      "私が学生時代に力を入れたことは、大学の金融研究会で行った企業分析コンテストへの参加です。私たちのチームは最初、各自が興味のある情報をばらばらに集めていたため、議論が発散し、発表資料の方向性がなかなか決まりませんでした。私はこの状況を改善するため、まず審査基準を分解し、収益性、成長性、リスク、バリュエーションの四つの観点で情報を整理するフォーマットを作りました。また、毎回のミーティングで意思決定事項と未決事項を分けて記録し、次回までに誰が何を調べるかを明確にしました。その結果、議論の重複が減り、発表直前には提案内容を一貫した投資ストーリーとしてまとめることができました。最終的に入賞には届きませんでしたが、審査員からは分析の構造が分かりやすいという評価をいただきました。この経験から、複雑な情報を構造化し、チームで同じ認識を持って前に進めることの重要性を学びました。",
    applicationTarget: {
      industry: "Finance / Trading Company",
      companyName: "Kairo Capital",
      position: "Summer Analyst Intern",
      companyMemo:
        "企業分析、事業投資、リスク評価を重視する金融系インターン。短い文章で論点を構造化して伝える力が求められる。",
      referenceUrls: [
        {
          id: "kairo-intern",
          title: "Kairo Capital Summer Analyst",
          url: "https://example.com/kairo/intern",
          memo: "分析力と簡潔な説明力を重視。",
          sourceType: "url",
        },
      ],
    },
    userContext: {
      selfPr: "複雑な情報を整理し、チームの議論を前に進める力。",
      studentExperience: "金融研究会で企業分析コンテストに参加した。",
      motivationAxis: "構造化した分析で意思決定に貢献したい。",
      skills: "企業分析、資料作成、議論整理。",
      values: "曖昧な状況でも論点を分けて進める。",
      seminarMemo: "短時間で論点を伝える力が重要だと説明された。",
      obOgMemo: "冗長な説明より、仮説と根拠を明確にすることが評価される。",
      additionalNotes: "400字以内に収めたい。",
    },
    targetCharacterCount: 400,
    expectedChecks: ["文字数超過", "要約", "削除差分"],
  },
  {
    id: "expression-language-quality",
    title: "表現品質: 口語と英語混在の志望動機",
    description:
      "内容は悪くないが、日本語表現、語尾、英語表現の自然さを検証するケース。",
    essayText:
      "私はカスタマーサクセスという仕事にめっちゃ興味があります。理由は、ユーザーと近い距離で話しながら、プロダクトのvalueを最大化できると思ったからです。大学の授業支援プロジェクトでは、先生と学生の間に入って、使いづらいところをヒアリングして改善しました。最初はみんな困っていたけど、説明資料を作ったり、FAQを作ったりして、だんだん使ってくれる人が増えました。貴社でも、customerのsuccessにコミットして、いい体験を作りたいです。",
    applicationTarget: {
      industry: "Global Technology",
      companyName: "HelioCloud",
      position: "Customer Success Intern",
      companyMemo:
        "グローバル向けクラウドサービスを提供。顧客の導入支援、利用定着、フィードバック収集を重視する。",
      referenceUrls: [
        {
          id: "heliocloud-cs",
          title: "HelioCloud Customer Success",
          url: "https://example.com/heliocloud/customer-success",
          memo: "顧客の利用定着と成果創出を重視する説明。",
          sourceType: "url",
        },
      ],
    },
    userContext: {
      selfPr: "相手の困りごとを聞き、使いやすい形に整える力。",
      studentExperience:
        "授業支援プロジェクトで教員と学生の間に入り、利用定着を支援した。",
      motivationAxis: "顧客の成功に近い立場でプロダクト価値を高めたい。",
      skills: "ヒアリング、FAQ作成、利用支援。",
      values: "相手の理解度に合わせて伝える。",
      seminarMemo: "Customer Successは導入後の成果責任が重要だと聞いた。",
      obOgMemo: "英語表現よりも、まず顧客課題への理解が大事と聞いた。",
      additionalNotes: "口語を直して、自然な日本語にしたい。",
    },
    targetCharacterCount: 400,
    expectedChecks: ["口語表現", "英語混在", "語尾の自然さ"],
  },
];

export const defaultSampleEssay = sampleEssays[0];
