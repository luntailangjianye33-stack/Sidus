# Sidus 調査・参考文献サマリー

Sidus は、ES添削AIを単なる文章生成ツールではなく、企業理解・根拠確認・ユーザー判断を組み込んだ編集ワークスペースとして設計しています。
この資料は、提出時に設計根拠をすぐ確認できるように、事前調査と参考文献の要点をまとめた索引です。

## 1. 市場・競合分析

詳細:

- `docs/research/market_analysis_layerx_es_review_tool.md`

調査対象:

- 国内ES特化型
  - 就活Pass
  - ES Maker
  - 内定くん
  - 就活AI
- 海外Resume / ATS最適化型
  - Jobscan
  - Teal
  - Enhancv
  - Grammarly Resume Builder
- Essay / Admission Writing型
  - Fypra
  - Admitly
- 汎用AIライティング型
  - ChatGPT
  - Claude
  - Gemini

設計上の結論:

> Sidus は、ESをAIが自動生成するツールではなく、企業理解と本人性をユーザーが検証しながら完成させるESレビュー・編集ワークスペースとして設計する。

既存プロダクトは、生成・添削・スコアリングには強い一方で、企業情報の根拠、提案の採用判断、本人性の維持を一つのUIで扱う体験はまだ薄いと判断しました。

## 2. UI / OSS設計参照

詳細:

- `docs/research/design_reference_oss_research.md`

参照した公開実装・設計:

- Informity AI
  - source-cited answers / SourceCard 的な設計
- Open WebUI
  - RAGとcitationの表示
- Dify Knowledge
  - knowledge / retrieval / generation の分離
- OpenReview by Vercel Labs
  - AI review と人間のapprove / skip
- revdiff / CorgReview
  - AI生成diffを人間が確認するreview workbench
- Continue.dev
  - 作業対象の近くでAIとやりとりするeditor体験

設計上の結論:

> Sidus は、AIチャットアプリでもResume scorerでもなく、Evidence Review Workspace として設計する。

このため、Sidusでは以下を重視しました。

- source status badge
- 証拠台帳
- 提案ごとの修正前 / 修正案
- 採用 / 却下 / 編集
- 評価項目の詳細表示
- 最終稿をユーザーが確定するUI

## 3. 根拠検証・参考文献

詳細:

- `docs/research/evidence_research_multi_agent_verification.md`

Sidus の企業情報取得では、LLMがもっともらしい企業理解を自由生成するだけでは危険です。
そのため、長文をclaim単位に分解し、それぞれがsourceに支えられているかを確認する設計を採用しました。

主な参考文献:

- FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation
  - https://arxiv.org/abs/2305.14251
  - 長文生成をatomic factsに分解し、個別に事実性を評価する考え方を参照
- Measuring Attribution in Natural Language Generation Models
  - https://arxiv.org/abs/2112.12870
  - 生成文がidentified sourcesに支えられているかを見る考え方を参照
- Evaluating Verifiability in Generative Search Engines
  - https://arxiv.org/abs/2304.09848
  - citation recall / citation precision の観点を参照
- RAGAS: Automated Evaluation of Retrieval Augmented Generation
  - https://arxiv.org/abs/2309.15217
  - retrieval quality と answer faithfulness を分ける考え方を参照
- ARES: An Automated Evaluation Framework for Retrieval-Augmented Generation Systems
  - https://arxiv.org/abs/2311.09476
  - context relevance / answer faithfulness / answer relevance の分離を参照
- SelfCheckGPT
  - https://arxiv.org/abs/2303.08896
  - 複数生成間の一貫性によるhallucination検出の知見を参照
- Improving Factuality and Reasoning in Language Models through Multiagent Debate
  - https://arxiv.org/abs/2305.14325
  - multi-agent debateの有用性と限界を参照
- Do Language Models Know When They're Hallucinating References?
  - https://arxiv.org/abs/2305.18248
  - citation hallucination のリスクを参照

設計上の結論:

> AI同士の多数決ではなく、source / claim / verification に分け、根拠に戻れるレビューを提供する。

## 4. Sidusへの反映

これらの調査をもとに、Sidusでは次のような実装に落としました。

- 企業調査結果をsource / claim単位で管理
- `確認済み` / `要確認` / `未確認` / `矛盾あり` をUI表示
- 企業理解をレビューに採用する前に、ユーザー確認を挟む
- 参考ESは本文コピーではなく、構成・語彙・弱い表現だけを抽出
- レビュー項目ごとに、対象文、評価理由、根拠、減点理由、修正方向を表示
- 提案は自動適用せず、採用 / 却下 / 編集をユーザーが判断

## 5. 提出時の位置づけ

この調査資料群は、Sidus の実装が場当たり的なUI追加ではなく、以下の問題設定に基づいていることを示すためのものです。

- AI生成文の根拠をどう確認するか
- 企業情報の誤取得をどう扱うか
- 参考ESを盗用ではなく評価基準としてどう使うか
- ユーザーの最終判断をUIにどう組み込むか
- LayerXの課題で求められる Human-in-the-Loop をどう実装するか
