# Sidus

Sidus is an evidence-linked ES review workspace for ambitious job applicants.

It is not an AI ghostwriter. The product helps a user inspect whether an entry sheet connects their own experience, company understanding, logical structure, and expression quality with enough evidence. The user stays in control by accepting, rejecting, editing, and discussing each suggestion before producing the final draft.

## Core Experience

1. Enter an ES draft, target company, target role, company memo, source URL, and user context.
2. Run Company Research to generate an AI company understanding memo.
3. Review the sources, access status, unknowns, and ES review focus.
4. Accept or discard the company understanding.
5. Run ES Review.
6. Inspect the score, criterion reviews, company intelligence, evidence audit, and suggestions.
7. Open a suggestion, compare before/after text, ask follow-up questions, and receive a revised proposal.
8. Accept, reject, or edit suggestions.
9. Finish in the final draft editor.

## Implemented Features

- Next.js App Router with TypeScript and Tailwind CSS
- Sample ES loading
- New ES review workspace
- Company Research API: `/api/company-research`
- Company Research UI with accept/discard flow
- Source access status display:
  - `Fetched`
  - `Provided`
  - `Model`
  - `Fetch failed`
- ES Review API: `/api/review`
- Structured Outputs schemas for AI responses
- Evidence audit by claim
- Suggestion list with severity and status
- Suggestion detail drawer with diff-like before/after display
- Accept, reject, and edit flows
- Discussion API: `/api/discuss`
- Follow-up question and revised suggestion flow
- Final draft editor
- Mock fallback when `OPENAI_API_KEY` is not configured

## AI Behavior

Sidus uses OpenAI when `OPENAI_API_KEY` is set in `.env.local`.

If the API key is not configured, the app uses contextual mock fallback responses. This keeps the UI usable during development, but real company research and ES review quality must be evaluated with an actual API key.

The current AI-related routes are:

- `POST /api/company-research`
  - Builds a company understanding memo.
  - Attempts to fetch reference URL text.
  - Returns sources, access status, unknowns, and ES review focus.

- `POST /api/review`
  - Reviews the ES using the current company memo and user context.
  - Returns score, criterion reviews, evidence audit, suggestions, final draft, sources, and warnings.

- `POST /api/discuss`
  - Reconsiders one suggestion based on a user question.
  - Returns an answer, revised suggestion, evidence notes, and user confirmation items.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
```

`.env.local`:

```bash
OPENAI_API_KEY=your_rotated_key_here
OPENAI_MODEL=gpt-4o-mini
```

Use a rotated key. Do not commit `.env.local`.

## Verification

```bash
npm run lint
npm run build
```

Real API smoke test:

```bash
npm run smoke:api
```

The smoke test calls:

- `POST /api/company-research`
- `POST /api/review`
- `POST /api/discuss`

If any route falls back to mock mode, the script prints a warning and exits with a non-zero status. Add a rotated `OPENAI_API_KEY` to `.env.local`, restart the dev server, and run it again.

Restart dev server and run the real API smoke test:

```bash
npm run verify:real-api
```

This command:

1. Checks that `.env.local` contains a non-empty `OPENAI_API_KEY`.
2. Restarts the local Next.js dev server on port `3000`.
3. Waits for `http://localhost:3000`.
4. Runs `npm run smoke:api`.
5. Fails if any API route still uses mock fallback.

Current verification status:

- `npm run lint`: passing
- `npm run build`: passing
- `/api/review`: mock fallback smoke tested
- `/api/company-research`: mock fallback smoke tested
- `/api/discuss`: mock fallback smoke tested

## Demo Scenario

Recommended short demo flow:

1. Click `新しいES校正`.
2. Paste an ES draft.
3. Enter a company name, industry, role, company memo, and source URL.
4. Click `企業情報をAI調査`.
5. Show the AI company memo, source access status, and unknowns.
6. Click `この企業理解を採用`.
7. Click `Reviewを生成`.
8. Show `Company intelligence` and `Evidence audit`.
9. Open `Suggestions`.
10. Select one suggestion.
11. Ask a follow-up question in `この提案について議論`.
12. Show the revised proposal and confirmation items.
13. Accept or edit the suggestion.
14. Show the final draft.

## Design Notes

Sidus is designed around human-in-the-loop editing:

- AI proposes; the user decides.
- Company claims are separated from writing suggestions.
- The system shows what it used and what remains unknown.
- Source access status is visible instead of hidden.
- Mock fallback never pretends to be verified official research.

## Known Limitations

- Real OpenAI behavior still needs final tuning with an actual API key.
- Reference URL fetching is basic HTML text extraction and can fail depending on the site.
- There is no full search-engine workflow yet.
- PDF upload is not implemented.
- Discussion history is local to the current browser session.
- The UI is MVP-level and still needs final polish for submission.
