# Sidus Demo Script

This script is for the final demo video or live walkthrough.

## Goal

Show that Sidus is not just an ES rewriting tool. It is a workspace where the user can:

- Provide company and personal context
- Let AI research and summarize company understanding
- Inspect what AI used as evidence
- Accept or reject that company understanding
- Review an ES with evidence-linked suggestions
- Discuss each suggestion
- Produce a final draft by user decision

## 3-Minute Flow

### 1. Start New Review

Click `新しいES校正`.

Say:

> Sidus starts from the user's own draft and context. It does not generate an ES from zero.

Paste an ES draft.

### 2. Add Company Context

Enter:

- Company
- Industry
- Position
- Company memo
- Reference URL

Say:

> The key difference is that company information is explicit. The system should not silently hallucinate company understanding.

### 3. Run Company Research

Click `企業情報をAI調査`.

Show:

- AI企業理解メモ
- Fetched / Provided / Fetch failed
- Unknowns
- ESレビューで見る観点

Say:

> The user can see what the AI actually used and what remains uncertain.

### 4. Accept Company Research

Click `この企業理解を採用`.

Say:

> Company understanding is not automatically trusted. The user explicitly adopts it before it becomes review context.

### 5. Run ES Review

Click `Reviewを生成`.

Show:

- Score
- Criterion review
- Company intelligence
- Evidence audit

Say:

> The review shows both writing feedback and evidence checks. It separates company understanding from expression feedback.

### 6. Review Suggestions

Open `Suggestions`.

Select one suggestion.

Show:

- Problem
- Rationale
- Before / After
- Accept / Reject / Edit

Say:

> Suggestions are not directly applied. The user decides suggestion by suggestion.

### 7. Discuss a Suggestion

Ask:

```text
この改善案だと企業らしさが弱くない？根拠をもっと会社理解に寄せたい。
```

Click `質問して再検討`.

Show:

- Answer
- Revised proposal
- Evidence notes
- Confirmation items

Say:

> This is the human-in-the-loop part. The user can challenge the AI and request a narrower revision.

### 8. Final Draft

Accept or edit the suggestion.

Open `Final`.

Say:

> The final draft is produced through user decisions, not one-shot AI generation.

## What To Emphasize

- The system makes company understanding visible.
- It shows source access status.
- It supports adoption and rejection of AI-generated company research.
- It keeps evidence audit separate from writing suggestions.
- It supports discussion before accepting a proposal.

## Current Caveat

If no `OPENAI_API_KEY` is configured, the app uses contextual mock fallback. The demo can still show the workflow, but final quality evaluation should be done with a real API key.
