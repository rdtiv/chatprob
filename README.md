# ChatProb

An educational chat UI that shows how a language model samples text: token-by-token confidence, the other words it considered, and three full replies for the same prompt.

Inspired by [Scott Hanselman's "AI without the BS, for humans" keynote at NDC London 2025](https://www.youtube.com/watch?v=kYUicaho5k8).

## What it teaches

- **Token confidence.** Each word is colored from the *sampled* token’s logprob — green when the model was sure, yellow when mixed, red when it took a long shot. The heatmap is not “most likely in the top 5”; it is the token that actually landed.
- **Alternatives at a position.** Hover or tap a word to see the top 5 candidates and their percentages. If the sampled token was outside that top 5, the card still shows its real probability instead of `0.00%`.
- **Three full replies.** Each turn requests `n=3` completions. Tabs **1 / 2 / 3** switch among them. Only the latest reply stays switchable. Once you send the next message, earlier tabs lock on whichever sample continued the thread — that is the text the API actually resends.
- **Conversation cost.** The API has no memory. Every turn resends the whole prompt, so input tokens climb as a staircase. The lesson strip, explainer, and rate card walk through in / replayed / new, out this tab vs total out this turn, and dollars for this turn vs the conversation.

## Features

- Temperature slider (`0.2`–`1.8`, default `1.2`) plus a presence penalty so the three samples diverge more
- Starter prompt chips for a first turn
- Token heatmap, hover/tap probability card, and first-use hint
- 1 / 2 / 3 response tabs; older turns lock after the next user message
- Per-message usage line: `in · replayed · new · out this tab · total out this turn | conversation total`
- Live explainer and gpt-4o-mini rate card (list price: $0.15 / 1M in, $0.60 / 1M out)
- Conversation saved in `localStorage`
- Works on desktop and mobile (tap to pin a token card; safe-area input)

## Stack

- Next.js 13.5.6 pages router, React 18, CSS in `styles/globals.css`
- One serverless route: `POST /api/chat` (`maxDuration` 60). Not Edge, and not the Vercel AI Gateway — those paths drop logprobs.
- OpenAI Chat Completions with `logprobs`, `top_logprobs: 5`, and `n: 3`

`gpt-4o-mini` is the default because it still returns token logprobs *and* multiple samples, which is what the UI is built to teach. Completions-era `gpt-3.5-turbo-instruct` is gone.

## Setup

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Put your OpenAI key in `.env` or `.env.local` (both are gitignored):

```bash
OPENAI_API_KEY=your_api_key_here
```

Optional:

```bash
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

`OPENAI_MODEL` must support Chat Completions logprobs and `n`. Changing it does not automatically update the rate card; unknown models fall back to the gpt-4o-mini list price and are marked approximate.

3. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How a turn works

`pages/api/chat.js` sends the conversation as chat messages. For assistant turns it uses only the **selected** tab’s text (`activeIndex`). It prepends a short system note asking for varied, concise wording, then calls:

| Setting | Value |
| --- | --- |
| Model | `OPENAI_MODEL` or `gpt-4o-mini` |
| Temperature | slider, clamped `0.2`–`1.8` |
| Presence penalty | `0.45` |
| Max tokens | `300` |
| Completions | `n=3` |
| Logprobs | `true`, `top_logprobs=5` (sampled token is merged in if missing) |

The response is three completions plus `usage` (`prompt_tokens`, `completion_tokens`, `model`). The client stores all three samples; later turns send only the locked-in one.

## Project layout

| Path | Role |
| --- | --- |
| `components/ChatInterface.js` | Conversation state, persistence, temperature, chips, lock rule |
| `components/Message.js` | Heatmap, tabs, usage line, hover/tap card |
| `components/TokenProbabilities.js` | Alternative-token card, including sampled-outside-top-5 |
| `components/ConversationExplainer.js` | Teacher copy + rate card |
| `lib/openaiRates.js` | List prices and in/out spend |
| `pages/api/chat.js` | OpenAI Chat Completions + logprobs |

## Deploy

A standard Next.js deploy on Vercel works. Set `OPENAI_API_KEY` in the project environment. Keep the function on the Node runtime so logprobs survive.

## License

MIT
