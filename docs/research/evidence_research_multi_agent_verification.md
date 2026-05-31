# Sidus Evidence Research: Multi-Agent Verification and Source Grounding

## 1. Research Question

Sidusでは、企業情報や公開情報の正確性がプロダクト価値の中核になる。

単一LLMに企業理解を任せると、以下のリスクがある。

- 企業情報をもっともらしく誤る。
- 実在しない出典や不適切なリンクを提示する。
- 出典は実在していても、その出典が主張を支えていない。
- ユーザーが入力したメモとAIの一般知識が混ざる。
- AI同士の多数決が、同じ誤りを強化する。

このため、Sidusでは「複数エージェントによる相互監視」と「出典に戻れる根拠照合」を組み合わせる設計が必要である。

## 2. Key Findings from Prior Research

### 2.1 Long-form factuality should be checked at the atomic-claim level

FActScoreは、長文生成の事実性評価では、文章全体を一括で正誤判定するのではなく、生成文をatomic factsに分解し、それぞれが信頼できる知識源に支持されるかを見る方法を提案している。

Sidusへの示唆:
- ES内の企業理解に関する記述を、claim単位に分解する。
- 各claimについて、supported / weakly_supported / unsupported / needs_user_confirmation を判定する。
- 全体スコアよりも、どの主張が根拠付きで、どの主張が危ないかを見せる。

Source:
- FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation  
  https://arxiv.org/abs/2305.14251

### 2.2 Generated statements must be attributable to identified sources

Google ResearchのAIS（Attributable to Identified Sources）は、自然言語生成の出力が外部世界に関する情報を含む場合、その情報が特定されたソースによって支持されているかを評価する枠組みである。

Sidusへの示唆:
- 企業理解に関するAIの指摘は、sourceIdまたはURLに結びつける。
- sourceIdがない場合は、verifiedとして扱わない。
- 「AIが知っているはず」ではなく、「どのソースに支えられているか」をUIに出す。

Sources:
- Measuring Attribution in Natural Language Generation Models  
  https://arxiv.org/abs/2112.12870
- Google Research publication page  
  https://research.google/pubs/measuring-attribution-in-natural-language-generation-models/

### 2.3 Citations must be evaluated for both recall and precision

Evaluating Verifiability in Generative Search Enginesは、生成検索エンジンの信頼性にはverifiabilityが必要であり、引用について以下の2点が重要だと整理している。

- Citation recall: すべての主張が十分に引用で支えられているか。
- Citation precision: 付けられた引用が、本当に対応する主張を支えているか。

Sidusへの示唆:
- 出典リンクを付けるだけでは不十分。
- 「このリンクはこの主張を支えているか」をVerifier Agentが確認する必要がある。
- 企業理解監査では、citation attached と citation supports claim を分ける。

Sources:
- Evaluating Verifiability in Generative Search Engines  
  https://arxiv.org/abs/2304.09848
- OpenReview page  
  https://openreview.net/forum?id=ZQV5iRPAua

### 2.4 RAG improves grounding but still needs faithfulness evaluation

RAGASは、RAGパイプラインを評価するためのreference-free frameworkであり、faithfulness、answer relevancy、context relevancyなどを評価軸としている。

ARESも、RAGシステムをcontext relevance、answer faithfulness、answer relevanceの観点から評価する枠組みを提案している。

Sidusへの示唆:
- 参考URLや企業メモを渡すだけでは十分ではない。
- 取得した文脈が関連しているか、回答が文脈に忠実かを分けて確認する。
- MVPでは本格RAG評価を実装しなくても、設計上は source relevance と claim faithfulness を分ける。

Sources:
- RAGAS: Automated Evaluation of Retrieval Augmented Generation  
  https://arxiv.org/abs/2309.15217
- ARES: An Automated Evaluation Framework for Retrieval-Augmented Generation Systems  
  https://arxiv.org/abs/2311.09476

### 2.5 Self-consistency and black-box checks can help, but are not enough alone

SelfCheckGPTは、同一LLMから複数サンプルを生成し、回答間の一貫性を使ってhallucinationを検出するblack-box手法を提案している。

Sidusへの示唆:
- 複数エージェントの出力差分を見ることは有用。
- ただし、一貫しているから正しいとは限らない。
- 企業情報では、最終的にソース照合が必要。

Source:
- SelfCheckGPT: Zero-Resource Black-Box Hallucination Detection for Generative Large Language Models  
  https://arxiv.org/abs/2303.08896

### 2.6 Multi-agent debate can improve factuality and reasoning, but has failure modes

Multi-agent debate研究では、複数のLLMインスタンスが回答や推論を提案・批判し合うことで、単一モデルよりも事実性や推論性能が改善する可能性が示されている。

一方で、multi-agent debateには以下の注意点がある。

- エージェント同士が同じ誤りに合意する可能性がある。
- 説得力のある誤答が他エージェントを引っ張る可能性がある。
- 多数決が真実を保証するわけではない。

Sidusへの示唆:
- Multi-agentは「正しさの保証」ではなく「検証プロセス」として使う。
- 最終的な信頼は、AI同士の合意ではなく、出典との対応関係に置く。
- Reviewer AgentはVerifier Agentがunsupportedとした情報をES添削の根拠に使わない。

Sources:
- Improving Factuality and Reasoning in Language Models through Multiagent Debate  
  https://arxiv.org/abs/2305.14325
- When collaboration fails: persuasion driven adversarial influence in multi agent large language model debate  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC13061921/

### 2.7 Citation hallucination is a serious operational risk

近年の研究や報告では、LLMが実在しない文献・不正確な引用・主張を支えない引用を生成するリスクが指摘されている。

Sidusへの示唆:
- 出典リンクや引用をAIに自由生成させない。
- ユーザー提供URL、検索で取得したURL、公式サイトURLなど、実在確認済みのソースだけをSourceReferenceとして扱う。
- URLが存在しても、その内容がclaimを支えるかは別途確認する。

Sources:
- Do Language Models Know When They're Hallucinating References?  
  https://arxiv.org/abs/2305.18248
- Hallucinated citations produced by generative artificial intelligence may constitute research misconduct when citations function as data in scholarly papers  
  https://pmc.ncbi.nlm.nih.gov/articles/PMC13051339/

## 3. Recommended Sidus Architecture

Sidusでは、企業情報の扱いを以下の3役に分ける。

```text
User Input / Public Sources
  |
  v
Research Agent
  - ユーザー提供メモ、参考URL、公式公開情報を整理
  - claim候補とsource候補を抽出
  |
  v
Verifier Agent
  - claimがsourceに支持されるかを確認
  - citation precision / recall の観点で検査
  - source quality と confidence を付与
  |
  v
Reviewer Agent
  - 検証済み情報だけを根拠にESをレビュー
  - unsupported情報は「要確認」として扱う
  - ユーザーに採用・却下・編集・議論を促す
```

## 4. MVP Implementation Policy

本格的なWeb検索・複数エージェント並列実行はMVPでは重い。

そのため、MVPでは以下に落とす。

### Must Implement in MVP

- ユーザー提供URL・企業メモ・OB/OGメモをSourceとして管理する。
- AIレビューの各企業理解claimにsourceIdを持たせる。
- 企業理解監査にverificationStatusを表示する。
- sourceがないclaimは `needs_user_confirmation` にする。
- 根拠リンクがあっても、claimを支えているかを別項目で表示する。

### Should Mention in README

- Sidusは単一LLMの企業理解をそのまま信じない。
- 企業理解はclaim単位で分解し、出典との対応を確認する設計である。
- MVPでは自動Web収集は限定し、ユーザー提供ソースを主な根拠にする。
- 将来的にはResearch Agent、Verifier Agent、Reviewer Agentの3段構成に拡張できる。

### Do Not Do in MVP

- AIが自由に出典URLを生成する。
- ソース未確認の企業情報をverifiedとして表示する。
- 複数AIの多数決だけで正しいと判定する。
- 合否判定や企業人事なりきりの断定を行う。

## 5. Schema Changes Needed

`EvidenceAuditItem` に以下を追加する。

```ts
type VerificationStatus =
  | "verified_by_source"
  | "partially_verified"
  | "unverified"
  | "conflicting_sources"
  | "needs_user_confirmation";

type SourceQuality =
  | "official"
  | "company_provided"
  | "user_provided"
  | "third_party"
  | "model_knowledge"
  | "unknown";

type EvidenceAuditItem = {
  id: string;
  claimText: string;
  status: "supported" | "weakly_supported" | "unsupported" | "possibly_inaccurate" | "needs_user_confirmation";
  verificationStatus: VerificationStatus;
  confidence: "high" | "medium" | "low";
  sourceQuality: SourceQuality;
  checkedBy: {
    research: boolean;
    verifier: boolean;
    reviewer: boolean;
  };
  assessment: string;
  evidence: EvidenceReference[];
  caution?: string;
  userCheckRequired: boolean;
};
```

`EvidenceReference` に以下を追加する。

```ts
type EvidenceReference = {
  sourceId?: string;
  sourceTitle?: string;
  url?: string;
  quotedOrParaphrasedEvidence: string;
  reliability: "high" | "medium" | "low" | "user_provided";
  supportsClaim: boolean;
  sourceQuality: SourceQuality;
};
```

## 6. UI Changes Needed

企業理解監査には以下のバッジを出す。

- Verified
- Partially verified
- Unverified
- Conflicting sources
- Needs confirmation

各claimには以下を表示する。

- 検証対象の記述
- 判定
- confidence
- source quality
- 根拠リンク
- この根拠がclaimを支持しているか
- ユーザー確認事項

## 7. Product Message

Sidusは、単一AIの企業理解をそのまま使わない。

企業理解をclaim単位に分解し、ユーザー提供情報・公開情報・出典リンクとの対応関係を確認した上で、検証状態を明示する。

AI同士の多数決ではなく、根拠に戻れるレビューを提供する。
