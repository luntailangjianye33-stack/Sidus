import type { SampleEssay } from "@/types/sidus";

export const sampleEssays: SampleEssay[] = [
  {
    id: "tel-ai-software-engineer",
    title: "東京エレクトロン: AI・ソフトウェア系エンジニア",
    description:
      "本番デモ用。日経会社情報、公式会社概要、IR、参考ESベンチマークを使って、企業調査からレビューまで通しで見せるケース。",
    essayText:
      "私が東京エレクトロンを志望する理由は、ソフトウェアの力で半導体製造装置の価値を高め、社会の基盤となる半導体を支える重要な役割を担っているので、その進化に貢献したいと考えています。大学では画像処理を用いた異常検知の研究に取り組み、当初は精度だけを追っていました。しかし、誤検知の原因を整理し、データの前処理や評価指標を見直す中で、現場で使える技術にするには、精度だけでなく再現性や運用しやすさが重要だと学びました。貴社は半導体を「つくる」ための装置を開発し、プロセス、メカ、エレキ、ソフトウェアなど幅広い技術を結集して付加価値の高い製品を生み出しています。特にAIを活用した装置の付加価値向上に関わるソフトウェア開発に魅力を感じます。私は、データを丁寧に扱い、技術を実装可能な形に落とし込む姿勢を磨き、製造現場の課題解決に貢献したいです。",
    applicationTarget: {
      industry: "半導体製造装置 / 精密機械 / ソフトウェア",
      companyName: "東京エレクトロン株式会社",
      companyScope: "domestic",
      position: "AI・ソフトウェア系エンジニア",
      companyMemo:
        "東京エレクトロンは、半導体製造装置の開発・製造・販売を行う日本の上場企業。ソフトウェア、AI、データ活用を通じた装置価値の向上や製造現場の課題解決と接続しやすい。",
      referenceUrls: [
        {
          id: "tel-company-profile",
          title: "会社概要 | 東京エレクトロン",
          url: "https://www.tel.co.jp/about/summary/",
          memo: "公式会社概要。事業内容、拠点、従業員数、売上高などを確認する。",
          sourceType: "url",
        },
        {
          id: "tel-nikkei-company-info",
          title: "日経会社情報: 東京エレクトロン",
          url: "https://www.nikkei.com/nkd/company/gaiyo/?scode=8035",
          memo: "証券コード、上場市場、本社所在地、業種などの基本情報を確認する。",
          sourceType: "url",
        },
      ],
    },
    userContext: {
      selfPr:
        "画像処理と異常検知の研究で、精度だけでなく再現性と運用しやすさまで考えて改善できる。",
      studentExperience:
        "研究室で異常検知モデルの誤検知原因を整理し、データ前処理と評価指標を見直した。",
      motivationAxis:
        "技術を現場で使える形に落とし込み、産業基盤を支える製品価値の向上に関わりたい。",
      skills: "Python、画像処理、異常検知、データ前処理、評価指標設計。",
      values: "精度だけでなく、再現性、運用可能性、現場での使いやすさを重視する。",
      seminarMemo:
        "半導体製造装置は複数技術の統合で価値が出るため、ソフトウェアによる装置価値向上が重要だと理解している。",
      obOgMemo:
        "エンジニア職では、技術を研究で終わらせず、製造現場で使える品質に落とし込む姿勢が評価されると聞いた。",
      additionalNotes:
        "400字以内。企業説明を長くしすぎず、画像処理・異常検知経験とAI/ソフトウェア職種の接続を強くしたい。",
      benchmarkNotes: {
        passedEssayPatterns:
          "原体験、技術課題の捉え方、企業固有の技術領域、入社後の貢献の順で接続する。",
        strongPhrases:
          "再現性、運用可能性、プロセス改善、装置価値、現場実装",
        weakGenericPhrases:
          "社会に貢献したい\n成長したい\n重要な役割を担っている\n魅力を感じます",
        structureHints:
          "企業説明を長くしすぎず、本人経験と企業固有論点を同じ文内で結ぶ。",
      },
    },
    targetCharacterCount: 400,
    expectedChecks: [
      "日経会社情報と公式会社概要の取得",
      "画像処理・異常検知経験との接続",
      "参考ESベンチマークを使った表現品質レビュー",
    ],
  },
  {
    id: "kajima-it-strategy",
    title: "鹿島建設: 数理情報系 / IT戦略・研究開発",
    description:
      "建設DXとIT戦略への接続を見るケース。国内大手企業で、公式・日経・公的情報の安定性を確認しやすい。",
    essayText:
      "私が鹿島建設を志望する理由は、建設プロジェクトという大規模で複雑な現場に対して、ITやデータ活用を通じて意思決定と生産性を支える仕事に関わりたいからです。大学では、研究室の実験データ管理が属人的になっていた課題に対し、入力形式を統一し、分析しやすい管理表を作成しました。当初は各自の記録方法が異なり、再現確認に時間がかかっていましたが、項目定義と確認手順をそろえることで、議論の前提を共有しやすくなりました。貴社は総合建設会社として土木・建築・開発など幅広い事業を担い、数理情報系職種ではIT活用の戦略企画、推進、システム構築、研究開発に関われる点に魅力を感じます。私は、現場の複雑な情報を構造化し、実務で使える仕組みに落とし込む力を磨き、建設プロジェクトの高度化に貢献したいです。",
    applicationTarget: {
      industry: "総合建設 / ゼネコン / 都市開発 / 建設DX",
      companyName: "鹿島建設株式会社",
      companyScope: "domestic",
      position: "数理（情報）系 / IT戦略・システム構築・研究開発",
      companyMemo:
        "鹿島建設は、土木・建築・開発などを担う大手総合建設会社。数理情報系ではIT活用の戦略企画、システム構築、研究開発との接続を作りやすい。",
      referenceUrls: [
        {
          id: "kajima-company-profile",
          title: "会社概要 | 鹿島建設",
          url: "https://www.kajima.co.jp/prof/outline/",
          memo: "公式会社概要。所在地、資本金、事業概要を確認する。",
          sourceType: "url",
        },
        {
          id: "kajima-nikkei-company-info",
          title: "日経会社情報: 鹿島建設",
          url: "https://www.nikkei.com/nkd/company/gaiyo/?scode=1812",
          memo: "証券コード、上場市場、本社所在地、業種などの基本情報を確認する。",
          sourceType: "url",
        },
      ],
    },
    userContext: {
      selfPr:
        "複雑な情報を整理し、関係者が同じ前提で議論できる状態を作れる。",
      studentExperience:
        "研究室で実験データ管理の形式を統一し、再現確認と分析の手間を減らした。",
      motivationAxis:
        "大規模な現場の意思決定を、データとシステムで支える仕事に関わりたい。",
      skills: "データ整理、要件定義、表設計、Python、業務フロー整理。",
      values: "現場で使われ続ける仕組みを、運用まで考えて作ること。",
      seminarMemo:
        "建設DXでは、技術そのものよりも現場の運用と結びつくことが重要だと理解している。",
      obOgMemo:
        "IT部門でも現場理解と関係者調整が重要だと聞いた。",
      additionalNotes:
        "建設業の社会性に寄りすぎず、数理情報系職種での具体的な貢献に寄せたい。",
      benchmarkNotes: {
        passedEssayPatterns:
          "現場課題を見つけた経験、情報整理の工夫、企業の事業規模、IT職種での貢献を順に接続する。",
        strongPhrases:
          "現場実装、情報の構造化、意思決定支援、運用設計、建設DX",
        weakGenericPhrases:
          "まちづくりに貢献したい\n社会基盤を支えたい\n大きな仕事がしたい",
        structureHints:
          "建設業への憧れだけで終えず、IT・数理の経験がどの業務課題に効くかを書く。",
      },
    },
    targetCharacterCount: 400,
    expectedChecks: [
      "建設DXと本人経験の接続",
      "日経会社情報と公式会社概要の取得",
      "職種理解の具体化",
    ],
  },
  {
    id: "nikkei-reporter-intern",
    title: "日経新聞: 記者職インターン",
    description:
      "情報サービス企業としての企業理解と、記者職らしい一次情報・論点整理の具体性を見るケース。",
    essayText:
      "私が日本経済新聞社を志望する理由は、企業や経済の変化を、読者の意思決定につながる情報として届ける仕事に携わりたいからです。大学では学生新聞の編集部に所属し、地域商店街のキャッシュレス導入について取材しました。当初は制度説明に偏った記事になりましたが、店主と利用者の双方に話を聞くことで、手数料負担や高齢者対応といった現場の論点を掘り下げることができました。結果として、読者から背景が分かりやすいという反応をもらいました。貴社は経済・企業・金融・国際ニュースを中心に報道し、日経電子版などのデジタルサービスも展開しています。私は、一次情報をもとに複数の立場を整理し、読者が社会や企業の変化を理解し次の判断に移れる情報発信に挑戦したいです。",
    applicationTarget: {
      industry: "新聞 / 経済メディア / 情報サービス",
      companyName: "日本経済新聞社",
      companyScope: "domestic",
      position: "記者職インターン",
      companyMemo:
        "日本経済新聞社は、経済・企業・金融・国際ニュースを中心に報道するメディア企業。日経電子版などデジタルサービスも展開し、ビジネスパーソンの意思決定に資する情報提供を重視している。",
      referenceUrls: [
        {
          id: "nikkei-company-profile",
          title: "日本経済新聞社 企業情報",
          url: "https://www.nikkei.co.jp/nikkeiinfo/",
          memo: "日本経済新聞社の公式企業情報。",
          sourceType: "url",
        },
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
        "企業説明が一般論になりやすいため、記者職での行動と日経らしさを近づけたい。",
      benchmarkNotes: {
        passedEssayPatterns:
          "取材の原体験、論点整理の工夫、媒体の提供価値、入社後に扱いたいテーマの順で接続する。",
        strongPhrases:
          "一次情報、論点整理、意思決定に資する情報、複数の立場、読者の判断材料",
        weakGenericPhrases:
          "情報を届けたい\n社会に貢献したい\n多くの人に伝えたい",
        structureHints:
          "媒体名だけでなく、読者と情報提供価値を具体化する。",
      },
    },
    targetCharacterCount: 400,
    expectedChecks: [
      "記者職としての具体性",
      "日経の提供価値との接続",
      "一次情報・論点整理の表現品質",
    ],
  },
  {
    id: "mitsubishi-corporation-business",
    title: "三菱商事: 総合職",
    description:
      "総合商社の事業投資・産業横断性と、企業分析経験の接続を見るケース。",
    essayText:
      "私が三菱商事を志望する理由は、産業や地域を横断して事業を構想し、長期的に価値を生み出す仕事に関わりたいからです。大学の金融研究会では、企業分析コンテストに参加しました。当初は各自が集めた情報が散らばり、提案の軸が定まりませんでした。そこで私は、収益性、成長性、リスク、投資余力の四点で情報を整理する表を作り、議論の前提をそろえました。結果として、発表内容を一貫した投資ストーリーとしてまとめることができました。貴社は天然ガス、総合素材、食品産業、金属資源、モビリティ、電力など幅広い事業を展開し、事業投資と経営人材の機能を持つ点に魅力を感じています。私は、複雑な情報を構造化して意思決定につなげる力を磨き、産業の課題を事業として形にする仕事に挑戦したいです。",
    applicationTarget: {
      industry: "総合商社 / 事業投資 / グローバルビジネス",
      companyName: "三菱商事株式会社",
      companyScope: "domestic",
      position: "総合職",
      companyMemo:
        "三菱商事は、複数産業にまたがる総合商社。事業投資、産業横断の課題解決、グローバルな事業経営との接続を作りやすい。",
      referenceUrls: [
        {
          id: "mc-company-profile",
          title: "三菱商事 会社概要",
          url: "https://www.mitsubishicorp.com/jp/ja/about/profile/",
          memo: "公式会社概要。事業内容、所在地、資本金などを確認する。",
          sourceType: "url",
        },
        {
          id: "mc-nikkei-company-info",
          title: "日経会社情報: 三菱商事",
          url: "https://www.nikkei.com/nkd/company/gaiyo/?scode=8058",
          memo: "証券コード、上場市場、本社所在地、業種などの基本情報を確認する。",
          sourceType: "url",
        },
      ],
    },
    userContext: {
      selfPr:
        "複雑な情報を観点ごとに整理し、チームの議論を意思決定に近づけられる。",
      studentExperience:
        "金融研究会の企業分析コンテストで、収益性、成長性、リスク、投資余力の観点から分析表を作った。",
      motivationAxis:
        "産業の課題を構造的に捉え、事業として長期的に価値を生み出す仕事に関わりたい。",
      skills: "企業分析、財務分析、資料作成、議論整理、仮説構築。",
      values: "短期的な成果だけでなく、長期的な事業価値を考えること。",
      seminarMemo:
        "総合商社では、事業を保有し経営に関わる視点が重要だと理解している。",
      obOgMemo:
        "総合職では、自分の専門性だけでなく、関係者を巻き込む力も見られると聞いた。",
      additionalNotes:
        "商社一般論にしない。企業分析経験を事業投資・経営視点に接続したい。",
      benchmarkNotes: {
        passedEssayPatterns:
          "原体験、分析で得た視点、企業固有の事業機能、入社後の挑戦の順に接続する。",
        strongPhrases:
          "事業投資、経営視点、産業横断、長期的な価値、意思決定",
        weakGenericPhrases:
          "グローバルに活躍したい\n大きな仕事がしたい\n社会に影響を与えたい",
        structureHints:
          "商社の規模感ではなく、事業投資と本人の分析経験を同じ文脈で書く。",
      },
    },
    targetCharacterCount: 400,
    expectedChecks: [
      "総合商社一般論の検出",
      "事業投資と企業分析経験の接続",
      "日経会社情報と公式会社概要の取得",
    ],
  },
  {
    id: "goldman-junior-analyst",
    title: "Goldman Sachs: ジュニアアナリスト",
    description:
      "外資ブランドモード用。日本法人DBを主情報にせず、公式グローバル/日本サイトを中心に扱う補助デモケース。",
    essayText:
      "私がゴールドマン・サックスを志望する理由は、資本市場を通じて企業の重要な意思決定を支え、複雑な情報を分析して価値ある提案に変える仕事に挑戦したいからです。大学の金融研究会では、企業分析コンテストに参加し、当初は各自の調査内容が分散して提案の軸が定まりませんでした。私は収益性、成長性、リスク、資本政策の観点で情報を整理し、議論の前提をそろえました。その結果、投資判断の根拠を一貫したストーリーとして説明できるようになりました。貴社は投資銀行業務、証券業務、資産運用などをグローバルに展開し、日本でも企業や機関投資家に高度な金融サービスを提供しています。私は、数字を読み解くだけでなく、経営課題の背景まで考え抜き、顧客の意思決定に資する分析力を磨きたいです。",
    applicationTarget: {
      industry: "金融 / 投資銀行 / グローバル金融",
      companyName: "ゴールドマンサックス",
      companyScope: "foreign",
      position: "ジュニアアナリスト",
      companyMemo:
        "Goldman Sachsは、投資銀行業務、証券業務、資産運用などを展開するグローバル金融機関。外資ブランドとして公式グローバル/日本サイトを優先して扱う。",
      referenceUrls: [
        {
          id: "goldman-about-japan",
          title: "About Us | Goldman Sachs Japan",
          url: "https://www.goldmansachs.com/japan/our-firm/about-us",
          memo: "Goldman Sachsの日本向け公式企業情報。",
          sourceType: "url",
        },
        {
          id: "goldman-careers",
          title: "Goldman Sachs Careers",
          url: "https://www.goldmansachs.com/careers",
          memo: "公式採用情報。職種理解や応募者に求める姿勢の確認に使う。",
          sourceType: "url",
        },
      ],
    },
    userContext: {
      selfPr:
        "財務情報や事業情報を観点ごとに整理し、投資判断の根拠として説明できる。",
      studentExperience:
        "金融研究会で企業分析コンテストに参加し、収益性、成長性、リスク、資本政策の観点で分析を整理した。",
      motivationAxis:
        "複雑な経営・市場情報を分析し、企業や投資家の意思決定を支える仕事に関わりたい。",
      skills: "企業分析、財務分析、資料作成、英語文献読解、仮説構築。",
      values: "表面的な数字だけでなく、経営課題の背景まで考えること。",
      seminarMemo:
        "投資銀行業務では、分析力だけでなく、顧客の重要な意思決定を支える責任感が重要だと理解している。",
      obOgMemo:
        "外資金融では、数字への強さに加えて、短時間で論点を構造化する力が見られると聞いた。",
      additionalNotes:
        "外資ブランドモードで、日本法人番号や別法人を主情報にしないことを確認したい。",
      benchmarkNotes: {
        passedEssayPatterns:
          "金融分析の原体験、論点整理の方法、企業の金融サービス、顧客意思決定への貢献の順で接続する。",
        strongPhrases:
          "資本市場、意思決定支援、論点整理、投資判断、経営課題",
        weakGenericPhrases:
          "グローバルに活躍したい\n成長したい\n金融に興味がある",
        structureHints:
          "ブランド名への憧れではなく、分析経験と投資銀行業務の接点を書く。",
      },
    },
    targetCharacterCount: 400,
    expectedChecks: [
      "外資ブランドモードの動作",
      "別法人情報の混入防止",
      "金融分析経験と職種の接続",
    ],
  },
];

export const defaultSampleEssay = sampleEssays[0];
