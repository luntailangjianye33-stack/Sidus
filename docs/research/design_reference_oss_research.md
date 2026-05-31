# Sidus Design Reference: OSS and Public UI Research

## 1. Research Goal

SidusのUIが典型的なAI生成SaaSに見えないように、公開されているOSS実装・公開ドキュメント・優れたUIパターンから参照すべき方向性を整理する。

NotebookLMやCodexそのもののWeb UIコードは公開されていないため、近い公開実装として以下を調査対象にする。

- Source-backed document chat / RAG UI
- Citation and source verification UI
- Code review / diff review UI
- AI-assisted editor UI

## 2. Public References Checked

### 2.1 Informity AI

URL:
- https://www.informity.ai/
- https://github.com/informity/informity-ai

Why relevant:
- Open sourceのローカル文書RAGアプリ。
- 「source-cited answers」「open the exact file and verify the original passage」を明確に打ち出している。
- フロントエンド構成に `ChatView`, `SourceCard`, `Sidebar`, `FilesPage`, `DashboardPage` などがあり、SidusのSources/Draft/Review構造に近い。

What to borrow:
- AI回答よりも「検証可能なソース」を重視する姿勢。
- SourceCard的な表示。
- ChatとFiles/Sourcesを同じプロダクト内に置く構造。
- 「Ask -> Verify sources」という導線。

What not to copy:
- ローカルRAGやファイルインデックスの本格実装。
- 汎用文書チャットUIそのもの。

### 2.2 Open WebUI

URL:
- https://github.com/open-webui/open-webui
- https://docs.openwebui.com/features/chat-conversations/rag/

Why relevant:
- OSSの代表的なLLM UI。
- RAG機能でcitationを表示し、外部ソース利用の透明性を重視している。

What to borrow:
- 添付ファイルやKnowledgeをAIの文脈として扱う概念。
- 回答にsource referenceを付与する設計。
- AI機能を汎用チャットに閉じず、workspace/knowledgeの概念を持たせる点。

What not to copy:
- 汎用チャット中心UI。
- モデル選択・設定だらけの開発者向けUI。
- Sidusではチャットを主画面にしない。提案単位の議論に限定する。

### 2.3 Dify Knowledge

URL:
- https://docs.dify.ai/en/guides/knowledge-base

Why relevant:
- Knowledge BaseがRAG pipelineの各段階を可視化する。
- リアルタイム更新可能な知識ベースにより、LLMが古い事前学習知識だけに頼らない設計を説明している。

What to borrow:
- 「AIが何を根拠にしているか」を管理対象として見せる。
- Source ingestion / retrieval / answer generationを概念として分ける。
- SidusのResearch Agent / Verifier Agent / Reviewer AgentをUI上で示す余地。

What not to copy:
- アプリビルダー向けの設定UI。
- Knowledge管理そのものを主機能にしすぎること。

### 2.4 OpenReview by Vercel Labs

URL:
- https://github.com/vercel-labs/openreview

Why relevant:
- OSSのAI code review bot。
- Diffを読み、inline suggestionsを出し、reactionでapprove/skipする流れがSidusの提案単位レビューに近い。

What to borrow:
- Review targetをdiff単位に分解する考え方。
- 提案への反応、採用、スキップの流れ。
- 「AIが調べる -> コメントする -> 人間が判断する」というHuman-in-the-Loop設計。

What not to copy:
- GitHub PR中心のbot体験。
- UIというよりworkflow寄りなので、見た目より設計概念を借りる。

### 2.5 revdiff / CorgReview / Diff Review Tools

URLs:
- https://revdiff.com/
- https://www.corgreview.com/

Why relevant:
- AI生成コードやdiffを人間が確認するためのreview workbench。
- Sidusの「AI改善案をすぐ反映せず、差分で確認してから採用する」体験に近い。

What to borrow:
- 差分ビューを中央に置く。
- Review対象、注釈、判断操作を密に配置する。
- 「AI出力をレビューするためのUI」という姿勢。

What not to copy:
- コード専用の記号やシンタックスハイライトに寄せすぎること。

### 2.6 Continue.dev

URL:
- https://github.com/continuedev/continue

Why relevant:
- OSSのAI coding assistant。
- エディタ内でchat、context、inline edit、diffを扱う。

What to borrow:
- 別チャット画面に飛ばず、作業対象の近くでAIとやりとりする思想。
- Inline editing / diff reviewの感覚。

What not to copy:
- IDEの複雑な操作体系。

## 3. Design Conclusion

Sidusが最も参考にすべき方向は、単一アプリではない。

最も近い合成は以下。

> Informity / NotebookLM系の source-backed document UI  
> ×  
> OpenReview / revdiff / Codex系の diff review UI

つまり、SidusはAIチャットアプリでも、ダッシュボードでも、Resume scorerでもない。

**Evidence Review Workspace** として設計する。

## 4. New Layout Direction

現在の4ステップUIは、デモ説明には分かりやすいが、見た目が典型的なAI SaaSに寄りやすい。

次のUI改修では、以下の3ペイン作業台へ寄せる。

```text
┌─────────────────────────────────────────────────────────────┐
│ Top Bar: Sidus / Target Company / Review Status             │
├───────────────┬──────────────────────────┬──────────────────┤
│ Sources       │ Draft / Diff             │ Review Thread    │
│               │                          │                  │
│ Company Memo  │ ES原稿                   │ Selected Claim   │
│ URLs          │ selected suggestion diff │ AI discussion    │
│ OB/OG Memo    │ final draft              │ Actions          │
│ User Context  │                          │                  │
├───────────────┴──────────────────────────┴──────────────────┤
│ Bottom Rail: Input / Review / Proposals / Final progress     │
└─────────────────────────────────────────────────────────────┘
```

### Left Pane: Sources

Purpose:
- AIが参照している情報を常に見せる。
- NotebookLM / Informity的な信頼感を作る。

Content:
- Sample selector
- Company profile
- Reference URLs
- Company memo
- OB/OG memo
- Self PR / Gakuchika / Motivation axis
- Source quality badges

### Center Pane: Draft / Diff

Purpose:
- ユーザーが最終的に編集する本文を主役にする。
- AI提案は本文に対する変更として扱う。

Modes:
- Input mode: ES本文入力
- Review mode: annotated draft
- Proposal mode: before/after diff
- Final mode: final draft editor

### Right Pane: Review Thread

Purpose:
- 全体チャットではなく、選択中claim/suggestionの議論だけを表示する。
- Codexの横パネル的な体験にする。

Content:
- Selected suggestion
- Evidence audit
- Verification status
- Discussion messages
- Accept / Reject / Edit / Ask actions

## 5. Visual Direction Changes

### Reduce

- カードの乱用
- AI Sparkleの強調
- 星評価の主役化
- 大きな丸角SaaSカード
- ダッシュボード風のKPIタイル
- ふわっとしたAIツール感

### Increase

- ペイン構造
- テーブル/リスト密度
- Source status badges
- Diff-like before/after blocks
- Selected item focus
- State labels
- Evidence trace
- Workspace感

## 6. Concrete UI Refactor Plan

### Phase A: Shell Refactor

- 左サイドバーをSources Paneに変更する。
- ステップナビは左上の主役から、下部または上部の軽いprogress railへ移す。
- サンプル、企業情報、本人文脈をSources Paneに統合する。

### Phase B: Center Work Area

- Input / Review / Proposals / Finalの各画面を「中央作業面のmode」として扱う。
- Reviewではsummaryカードよりも、annotated draftとclaim listを前面に出す。
- Proposalではdiffを中央に固定する。

### Phase C: Right Review Panel

- 右ペインを常設する。
- 選択中のsuggestionまたはclaimを表示する。
- Evidence、verification status、discussion、actionsをまとめる。

### Phase D: Style Pass

- 背景をもう少し白/グレー基調へ戻す。
- 8px以内の角丸を維持。
- 色数を減らし、badgeに意味色だけ使う。
- アイコンを減らし、テキスト密度と状態表示を重視する。

## 7. References

- Informity AI: https://www.informity.ai/
- Informity GitHub: https://github.com/informity/informity-ai
- Open WebUI RAG docs: https://docs.openwebui.com/features/chat-conversations/rag/
- Open WebUI GitHub: https://github.com/open-webui/open-webui
- Dify Knowledge: https://docs.dify.ai/en/guides/knowledge-base
- OpenReview: https://github.com/vercel-labs/openreview
- revdiff: https://revdiff.com/
- CorgReview: https://www.corgreview.com/
- Continue: https://github.com/continuedev/continue
