# AGENTS.md

## Cursor Cloud specific instructions

ChatProb is a single Next.js 13 (pages router) app that teaches how an LLM samples
text. There is one product and one deployable service.

### Service: ChatProb web app
- Dev server: `npm run dev` (Next.js on http://localhost:3000). Runtime is Node.js,
  not Edge — the `/api/chat` route needs the Node runtime so OpenAI logprobs survive.
- Lint: `npm run lint` (passes with only pre-existing `react-hooks/exhaustive-deps`
  warnings in `components/Message.js`).
- Unit tests: `node --test "lib/*.test.js"` (pure `lib/` modules, no network calls).
- Build (prod): `npm run build`; not needed for development.

### OpenAI key requirement (important, non-obvious)
- The chat feature calls the OpenAI Chat Completions API. Without `OPENAI_API_KEY`
  set, the UI loads fine but `POST /api/chat` returns `{"error":"OPENAI_API_KEY is
  not set"}` and no reply/heatmap is produced. Set `OPENAI_API_KEY` as an environment
  secret to exercise the core token-probability flow end to end.
- Optional overrides: `OPENAI_MODEL` (default `gpt-4o-mini`) must support Chat
  Completions `logprobs` and `n`; `OPENAI_BASE_URL` (default OpenAI). Env vars are read
  at request time in `pages/api/chat.js`, but Next.js only loads `.env`/`.env.local`
  at server start — restart `npm run dev` after changing them.

### Manual scripts (do not run in CI)
- `scripts/stream-spike.mjs` and `scripts/temp-gate-check.mjs` hit the live OpenAI API
  and are manual gates only. They require `OPENAI_API_KEY`.
