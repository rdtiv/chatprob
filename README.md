# ChatProb

An educational chat UI that shows how a language model samples text: token-by-token confidence, the other words it considered, how your own message is chopped into tokens, where three replies to the same prompt part ways, and what the whole conversation costs.

Inspired by [Scott Hanselman's "AI without the BS, for humans" keynote at NDC London 2025](https://www.youtube.com/watch?v=kYUicaho5k8).

## What it teaches

- **Token confidence.** Each word is colored from the *sampled* token’s logprob — green when the model was sure, yellow when mixed, red when it took a long shot. The heatmap is not “most likely in the top 5”; it is the token that actually landed. Below 65% the word also picks up a thin underline, below 35% a thicker one, so the signal survives without color.
- **What else was considered.** Hover or tap a word for the candidate list. **Among these** re-scales the shown candidates to add up to 100% at the current temperature; **Raw odds** shows the model’s real probabilities across the whole vocabulary, which do *not* add up to 100%. If the sampled token was outside the top 5, it still gets its own row with a real percentage instead of `0.00%` — under **Raw odds**, that is its exact model probability.
- **Temperature, live.** The candidate set is frozen when the card opens, so moving the temperature slider never makes rows appear or vanish — only the odds move. Adjusting temperature does not dismiss a pinned card, because watching the odds shift is the lesson. At `0` the top candidate takes 100% and everything else goes to zero, which is winner-take-all sampling made visible (the card rounds those zeros to `<0.001%`).
- **Your text is tokens too.** The composer tokenizes what you type with `o200k_base` and the user bubble shows the pieces as alternating tints, with an `≈ N tokens` count. Send **strawberry** and watch it arrive as three pieces, not ten letters.
- **Three full replies, and where they fork.** Each turn requests `n=3` completions. Tabs **1 / 2 / 3** switch among them, each with a confidence dot. A ring marks the first token where the three replies diverge — everything before it is identical, because the same prompt and the same weights produced the same tokens until the dice landed differently. Each tab also reports perplexity (“picking from ~N plausible words”) and the joint odds of that exact wording.
- **Conversation cost.** The API has no memory. Every turn resends the whole prompt, so input tokens climb as a staircase — one stacked bar per request, split into replayed, cached, and new. You can open the literal JSON array that was sent, and the rate card turns the tokens into dollars for this turn and for the conversation.
- **No memory, made visible.** The model has no memory of its own; the app replays the transcript every request. Turn on **Forget older turns** and the request stops carrying the top of the chat — a line appears in the transcript, the turns above it dim, and the model can no longer answer a question about a fact you seeded before the line. The transcript and your saved conversation keep everything; only the request shrinks. The system prompt never falls off, because the server adds it every time.
- **A cutoff, and a way past it.** The model's knowledge stops at its training cutoff — for `gpt-4o-mini`, around October 2023. Ask it for today's weather and it tells you, confidently, that it cannot know: a fact problem, not a memory problem. Turn on **Let it call a weather tool** and the same question runs a loop you can watch. The model never executes anything; it emits a structured request — a function name and JSON arguments it sampled token by token — our server makes the HTTP call, and the result comes back as more context tokens. The transcript shows all three in order, and the exact-request disclosure proves it: the second request literally contains the tool's answer.
- **Streaming vs waiting.** The reply is built one token at a time either way; streaming only changes whether you watch it happen. The toggle switches between them and the timing line tells you what it cost you in perceived latency: `first token 0.4s · all replies 2.1s` streamed, `reply 2.1s` when the whole thing lands at once.
- **Green means expected, not true.** A standing note in the legend says so, and the “Try to fool it” prompts ask about things that never happened — and one asks for weather no training run could contain — so you can watch the model be confidently wrong in bright green.

## Features

- Sampling panel behind the header button: temperature, top-p, presence penalty, a **Make it boring** determinism switch, a **Stream the reply** toggle, a **Forget older turns** memory control, and a **Let it call a weather tool** toggle
- A **Tools** section in the sampling panel with one weather tool, off by default, showing the tool's description exactly as the model receives it
- Inline tool-call and tool-result cards, plus a knowledge-cutoff pill on every settled reply where no tool ran and the served model has a published cutoff in `lib/modelFacts.js` — an unknown model gets no pill rather than a guessed date, and errored or aborted turns get none either — with the full note spelled out once per conversation, on the first reply it applies to
- Starter prompt chips and “Try to fool it” chips on the empty screen (both send immediately)
- Auto-growing composer — `Enter` sends, `Shift`+`Enter` starts a new line
- Token heatmap, hover/tap probability card with Among-these / Raw-odds views, and a first-use hint
- 1 / 2 / 3 response tabs with confidence dots; older turns lock after the next user message, and the padlock explains why
- Fork ring on the first token where the three replies disagree
- Prompt staircase, per-message usage line (`N in · M out · $x`, expandable to the full breakdown), exact-request disclosure, and a gpt-4o-mini rate card (list price: $0.15 / 1M in, $0.60 / 1M out, $0.075 / 1M cached in)
- Streaming replies over NDJSON, with the heatmap filling in as tokens arrive
- Conversation saved in `localStorage`
- Works on desktop and mobile: a bottom sheet on touch, an anchored popover on mouse, chosen by pointer type rather than screen width

### Sampling controls

| Control | Range | Default | Sent as |
| --- | --- | --- | --- |
| Temperature | `0`–`1.8`, step `0.1` | `1.0` | `temperature` |
| Top-p | `0.05`–`1`, step `0.05` | `1` | `top_p` (server floor `0.01`) |
| Presence penalty | `-2`–`2`, step `0.05` | `0.45` | `presence_penalty` |
| Make it boring | on / off | off | `temperature: 0` plus `seed: 7` |
| Forget older turns | on / off | off | `messages` (trimmed before sending) |
| Turns replayed | `0`–`6`, step `1` | `2` | `messages` (last N exchanges + the newest message) |
| Let it call a weather tool | on / off | off | `tools: true` (forces the JSON path) |

Bounds live in `lib/sampling.js` and the API route clamps to the same bounds (top-p's server floor is the documented `0.01`), so a hand-rolled request cannot get past them. **Make it boring** disables the temperature slider while it is on and restores your previous value when you switch it off. Its copy promises replies that come back *nearly* identical — OpenAI’s seed is best-effort, not a guarantee, and the UI does not pretend otherwise. Truncation is purely client-side — `lib/contextWindow.js` decides what leaves the browser, and the same function draws the forgotten line, so the line and the payload can never disagree about the rule. The window is always measured back from the newest message in the transcript: right after a reply lands the line marks exactly what that request carried, and it steps down one exchange the moment you send again, because the message you just typed becomes the newest one. The exact-request disclosure and the prompt staircase are records of past requests: move the slider after a reply lands and the line updates immediately while those records keep showing what each earlier request really contained — which is exactly the honesty the lesson depends on. With **Let it call a weather tool** on, the turn always takes the JSON path — the client skips streaming and the route ignores `stream`, because the first request ends in a tool call rather than in tokens. The **Stream the reply** switch is disabled while the tools switch is on and says why, so the panel can never show a setting the request is quietly ignoring.

## Stack

- Next.js 13.5.6 pages router, React 18, CSS in `styles/globals.css`
- `gpt-tokenizer` for the composer’s `o200k_base` count, dynamically imported on first use so its ~1 MB table never enters the initial bundle
- One serverless route: `POST /api/chat` (`maxDuration` 60), answering with JSON or an NDJSON stream. Not Edge, and not the Vercel AI Gateway — those paths drop logprobs.
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
WEATHER_API_KEY=your_weatherapi_key_here
```

`OPENAI_MODEL` must support Chat Completions logprobs and `n`. The rate card follows the served model when it is one of the five priced in `lib/openaiRates.js`; anything else falls back to the gpt-4o-mini list price and is labelled a similar-mini-model estimate.

`WEATHER_API_KEY` is a free key from [weatherapi.com](https://www.weatherapi.com/) — without it, the tool call still happens and the model gets the error, which is a fine thing to demonstrate on purpose. The key is read only inside `lib/weather.js`, only on the server, and never appears in an error message or a response body.

3. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Checks

```bash
npm run lint
node --test "lib/*.test.js"
```

The unit tests cover the pure modules in `lib/` — re-softmax, tokenizer chunking, completion statistics, rates, sampling clamps, context truncation, storage pruning, the weather fetch (with a stubbed `fetch`), the tool schema, the two-round usage totals, and the model-facts table — and make no network calls. The three files in `scripts/` are the opposite: manual gates that hit the live API, so run them by hand and never in CI.

## How a turn works

`pages/api/chat.js` sends the conversation as chat messages. For assistant turns it uses only the **selected** tab’s text (`activeIndex`). It prepends a short system note asking for varied, concise wording, then calls:

| Setting | Value |
| --- | --- |
| Model | `OPENAI_MODEL` or `gpt-4o-mini` |
| Temperature | panel value, clamped `0`–`1.8` |
| Top-p | panel value, clamped `0.01`–`1` |
| Presence penalty | panel value, clamped `-2`–`2` |
| Seed | omitted unless **Make it boring** is on, then `7` |
| Max tokens | `300` |
| Completions | `n=3` |
| Logprobs | `true`, `top_logprobs=5` (sampled token is merged in if missing) |

The response is three completions plus `echoedMessages` (the literal array that was sent, for the disclosure) and `usage` (`prompt_tokens`, `completion_tokens`, `cached_tokens`, `model`, and the clamped `sampling` values). The client stores all three samples; later turns send only the locked-in one.

### The tool loop

With **Let it call a weather tool** on, request 1 also carries a `tools` array with one function, `get_weather(location)`. The route then scans the three samples for the first one whose message carries `tool_calls` — not sample 0, and not `finish_reason`, because sampling is noisy enough that one sample can ask for the tool while another answers in text. When it finds one, it runs that sample's calls server-side and makes a second request: the same conversation plus the assistant's tool-call message and a `role: "tool"` result appended. If the model asks for more than one call in the same request — two cities, say — each one runs and each result goes back as its own tool message; only the first three calls are actually executed, and any call beyond that gets a skipped-error result instead of a fetch, so the model still sees one tool message per call it made. The second request keeps the tool schema in the prompt but sets `tool_choice` to `none`, so the model cannot ask again — the one-round cap is structural — and the two requests differ by exactly the tool call and its result, which is what the two staircase bars show. A tool turn draws one bar per request and numbers them `2a` and `2b` rather than collapsing into a single turn row; the second bar's baseline is its own first request, so the tool call and its result are what shows up as new.

Both rounds still ask for `n: 3`. The spike found all three samples asked for the identical call, so the extra samples are summarized on the tool-call card ("all 3 samples asked for this same call") rather than shown as separate tabs. The comparison is order-insensitive — two samples that ask for Denver-then-Boston and Boston-then-Denver count as agreeing — and when they genuinely differ the card says so instead ("2 of 3 samples asked for this call"). The API also returns no logprobs over tool-call arguments — `choice.logprobs` comes back as `{content: null, refusal: null}` — so those tokens show up as plain monospace JSON instead of a heatmap. The model still sampled them one token at a time; the API just doesn't expose their odds. That's a teaching point, not a gap.

`usage` sums both rounds, so the staircase and rate card stay honest about what the whole turn cost, and `usage.rounds` — present only when a turn took more than one request — carries the per-request split. That split is what the expandable usage line itemises (`N in · M out — first request, the one that ended in a tool call`), what the staircase splits into `2a` and `2b`, and what the rate-card copy means when it says the turn took two requests. `echoedMessages` is request 2's array, so the exact-request disclosure shows the tool result sitting in the prompt as new tokens. The disclosure also shows `echoedTools`, the `tools` array that rides beside the messages on every request while the switch is on — that block, not the system prompt, is how the model learns the `get_weather` function exists. Its label names the `tool_choice` the request carried, so request 2 reads `tool_choice: "none"` beside the schema it was forbidden to use. The tool exchange itself is never replayed — later turns resend the model's final sentence only, the same way any other assistant turn is echoed back. The weather lived in the context window for exactly one request.

### Streaming

With **Stream the reply** on — the default — the client posts `stream: true` and the route answers `application/x-ndjson`, one JSON object per line:

| Event | Carries |
| --- | --- |
| `meta` | `echoedMessages`, `model`, `sampling` — sent *before* the model call; if the stream dies, the previous turn's request disclosure stays viewable |
| `delta` | `index`, `text`, `tokens` — one per choice, so all three samples stream at once |
| `done` | the same `usage` object as the JSON path |
| `error` | a `message` the UI shows instead of a generic “connection dropped” |

Deltas are batched into one React update per animation frame, and tokens stay inert until the reply settles — no hovering a card whose alternatives are still arriving. A stream that ends without `done` is finalized as an aborted turn: the partial text stays visible, marked as not part of the conversation, and it is never resent.

## What gets saved

The conversation lives in `localStorage` under `chatMessages`. To stay inside the browser’s quota, only the 20 newest successful turns keep their `top_logprobs`; older turns keep each token and its logprob but lose the alternatives, so the heatmap, underlines, tab statistics, and fork detection all survive a reload while the candidate list does not. When you open a card on one of those turns it says so and points you at Raw odds, which still works. Errored and aborted turns do not occupy one of the 20 slots, and recent ones keep their alternatives too — only errored turns older than the oldest kept successful turn are stripped. Refreshing mid-stream heals the interrupted turn into that same aborted note rather than leaving a reply that never finishes. A tool turn’s cards survive a reload intact — pruning only ever strips *alternatives*, so `toolCalls` and `toolResults` are never touched. The exact-request disclosure goes the other way: `echoedMessages` and the `echoedTools` block are kept for the newest turn only and dropped from the turn before it the moment you send again, because a stored copy of every request would dwarf the transcript.

This 20-turn window is not the one **Forget older turns** moves. Storage pruning (`lib/persistence.js`) counts assistant turns and only ever drops *alternatives*; request truncation (`lib/contextWindow.js`) counts user turns and only ever drops *messages from the payload*. Neither one changes what the other does.

## Project layout

| Path | Role |
| --- | --- |
| `components/ChatInterface.js` | Conversation state, persistence, streaming client, chips, lock rule |
| `components/Message.js` | Heatmap, tabs, fork ring, timing and usage lines, hover/tap card, tool-call and tool-result cards, cutoff pill and note |
| `components/TokenProbabilities.js` | Candidate card: Among-these vs Raw odds, what-if temperature |
| `components/SamplingPanel.js` | Temperature, top-p, presence penalty, boring switch, delivery toggle, memory control, tools toggle |
| `components/SamplingContext.js` | Shares sampling state with the card so pinned cards react live |
| `components/useAnchoredSurface.js` | Sheet-vs-popover mode and viewport-aware placement |
| `components/PromptStaircase.js` | Per-turn stacked bars of replayed / cached / new prompt tokens |
| `components/RequestEcho.js` | The exact JSON array that was sent |
| `components/ConversationExplainer.js` | Teacher copy + rate card |
| `components/ForgottenDivider.js` | The line where the replayed context stops |
| `lib/sampling.js` | Sampling bounds and clamps, shared by the panel and the route |
| `lib/contextWindow.js` | Client-side truncation: what actually gets sent |
| `lib/resoftmax.js` | Frozen candidate set and the temperature re-softmax |
| `lib/tokenizer.js` | Lazy `o200k_base` loader and display chunking |
| `lib/completionStats.js` | Fork detection, perplexity, joint odds, confidence palette |
| `lib/openaiRates.js` | List prices and in/out/cached spend |
| `lib/usage.js` | Per-round and summed token usage for a turn |
| `lib/persistence.js` | Storage pruning for old turns |
| `lib/weather.js` | Server-side weather fetch; the key never leaves it |
| `lib/weatherTool.js` | The tool schema the model is told — single source for the panel and the route |
| `lib/modelFacts.js` | Published training cutoffs; `null` for unknown models |
| `pages/api/chat.js` | OpenAI Chat Completions + logprobs, JSON and NDJSON |
| `scripts/` | Manual live-API gates — run by hand, never in CI |

## Deploy

A standard Next.js deploy on Vercel works. Set `OPENAI_API_KEY` in the project environment. `WEATHER_API_KEY` must be set in the Vercel project environment alongside it for the weather tool to work in preview and production. Keep the function on the Node runtime so logprobs survive.

## License

MIT
