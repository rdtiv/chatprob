# Glossary

Every term that [Inside ChatProb](inside-chatprob.md) introduces, in alphabetical order, each with the chapter that first needs it. The walkthrough also uses bold for the labels you will see on screen and for the rules of its one sitting; only the terms below are glossary terms. The four everyday words in its prologue — language model, prompt, reply, request — are deliberately not here.

## calibration

How well a model's confidence tracks its correctness. A well-calibrated model is right about as often as its probabilities say it should be. `gpt-4o-mini` is well calibrated on the myths and riddles that older "watch it be confidently wrong" demos relied on, which is why this app has no such chip. See [chapter 5](inside-chatprob.md#5-three-replies-from-one-prompt).

## context window

Everything the model can see when it writes a reply: the array of messages sent in the current request, system prompt included. There is no other memory. What feels like a conversation is the app re-sending the whole transcript every turn. See [chapter 6](inside-chatprob.md#6-the-model-remembers-nothing).

## distribution

The model's output at one position: a probability for every token in the vocabulary, all summing to 100%. Next-token prediction produces the distribution; sampling picks one token from it. See [chapter 3](inside-chatprob.md#3-turning-the-dice).

## fork point

The first token at which the three replies to one prompt differ. Everything before it was identical because the same prompt and the same weights produced the same draws until the dice landed differently. The app rings it. See [chapter 5](inside-chatprob.md#5-three-replies-from-one-prompt).

## frozen candidate set

The rows of a word's card, fixed when the card opens from the logprobs the API returned: the top-5 candidates above half a percent plus the landed token. Moving the temperature slider never adds or removes a row, only rescales the what-if odds among them. See [chapter 4](inside-chatprob.md#4-what-else-it-weighed).

## input tokens

The tokens in a request: system prompt, every replayed message, the chat wrapper around each, and the new message. The API calls them prompt tokens and reports them in `usage`. Billed at the input rate, or the cached-input rate for the part served from the prompt cache. See [chapter 7](inside-chatprob.md#7-what-a-conversation-costs).

## list price

The published per-million-token rate for a model — for `gpt-4o-mini`, $0.15 in, $0.60 out, $0.075 cached in. The app's rate card quotes it; an unknown model gets the mini-model rates, labelled as an estimate. See [chapter 7](inside-chatprob.md#7-what-a-conversation-costs).

## live dice

The one thing on screen that moves with the temperature slider: the **What-if: only these** percentages on a pinned word's card. Settled words never recolor; the next reply is drawn at the new temperature but does not exist yet. See [chapter 4](inside-chatprob.md#4-what-else-it-weighed).

## logprob

The natural logarithm of a probability. The API reports one for every sampled token and for its top-5 alternatives. `0` is certain, about `-0.69` is 50%, about `-2.3` is 10%. The heatmap color comes straight from the sampled token's logprob. See [chapter 2](inside-chatprob.md#2-every-piece-was-a-choice-and-you-can-watch-it-being-made).

## messages

The array a chat request is made of: one entry per turn, each with a role and content. The app sends the whole conversation as this array every time. See [chapter 6](inside-chatprob.md#6-the-model-remembers-nothing).

## n (samples)

The Chat Completions parameter for how many independent replies to draw for one prompt in one request. This app always sends `n: 3`; the three tabs on every reply are the result. See [chapter 5](inside-chatprob.md#5-three-replies-from-one-prompt).

## next-token prediction

The only thing a language model does: given everything so far, produce a probability for every token that could come next. A reply is a chain of these predictions, each one conditioned on the token that was picked before. See [chapter 2](inside-chatprob.md#2-every-piece-was-a-choice-and-you-can-watch-it-being-made).

## one-round loop

The shape of this app's tool use: the model may ask for a tool once, our server runs it, and the second request carries `tool_choice: "none"` so the model cannot ask again. The cap is structural, not a choice the model makes. See [chapter 9](inside-chatprob.md#9-a-way-past-the-cutoff-tool-calls).

## output tokens

The tokens the model wrote in a request. The API calls them completion tokens. Because every request here draws three replies, the count covers all three, not only the tab you are reading. See [chapter 7](inside-chatprob.md#7-what-a-conversation-costs).

## parallel tool calls

More than one tool call in a single reply, as when a question names two cities. The server runs each and returns each result as its own `tool` message; at most three run, and any beyond that get a "skipped" error result so the model still sees one message per call. See [chapter 9](inside-chatprob.md#9-a-way-past-the-cutoff-tool-calls).

## perplexity

`exp(−mean logprob)` over a reply's tokens: roughly how many tokens the model was choosing among on an average position. The app prints it as *picking from ~N plausible words* and colors each tab's dot from the same number. See [chapter 5](inside-chatprob.md#5-three-replies-from-one-prompt).

## persistence

The app saving the transcript in the browser's `localStorage` and restoring it on reload. Nothing is stored on the server. Only the newest twenty replies keep their alternatives; the exact request is kept for the newest turn only; the controls are not saved at all. See [chapter 10](inside-chatprob.md#10-what-the-page-keeps).

## presence penalty

A flat amount subtracted from the logprob of any token that has already appeared in the reply, however many times. Sent as `presence_penalty`. This app's default is `0.45`, a slight lean against repetition. See [chapter 3](inside-chatprob.md#3-turning-the-dice).

## probability

How likely the model thinks a token is to come next, from 0 to 100%. The word's color is the probability of the token that landed; the card shows the probabilities of the tokens that did not. See [chapter 2](inside-chatprob.md#2-every-piece-was-a-choice-and-you-can-watch-it-being-made).

## prompt cache

A provider-side discount on input tokens that form a long enough unchanged prefix of a conversation the API has seen recently. The tokens are still sent and the model is still shown them; you pay less for the repeat. A discount on resending, not memory. See [chapter 7](inside-chatprob.md#7-what-a-conversation-costs).

## replay

Sending the earlier turns of a conversation again as part of a new request, because the model keeps nothing between requests. The pale blocks in the exact-request view and the pale segment of each staircase bar are the replayed part. See [chapter 6](inside-chatprob.md#6-the-model-remembers-nothing).

## roles

The label on each message saying who it is from: `system` (instructions from the app), `user` (you), `assistant` (the model), and — only in a tool round — `tool` (a result our server is handing back). See [chapter 6](inside-chatprob.md#6-the-model-remembers-nothing).

## sampled token

The token that was actually picked at a position and landed in the reply, as opposed to the alternatives the model also rated. Its logprob is what the heatmap colors. See [chapter 2](inside-chatprob.md#2-every-piece-was-a-choice-and-you-can-watch-it-being-made).

## sampling

Drawing one token at random from the distribution, weighted by probability, so a 70% token lands about seven times in ten. The reason the same prompt gives different replies, and the step the Sampling controls reshape. See [chapter 3](inside-chatprob.md#3-turning-the-dice).

## seed

A number handed to the API's random draw so that two requests with the same seed make the same picks. **Make it repeatable** sends `seed: 7` with temperature `0`. OpenAI documents the seed as best-effort, so the promise is *nearly* identical. See [chapter 3](inside-chatprob.md#3-turning-the-dice).

## softmax

The operation that turns raw scores into a distribution summing to 100%. The card's what-if view applies it to the frozen rows alone, after dividing each logprob by the temperature — which is why at temperature `1.0` the what-if is simply the raw rows renormalized. See [chapter 4](inside-chatprob.md#4-what-else-it-weighed).

## streaming

Forwarding each token to the browser as it is produced, rather than holding the whole reply and sending it once. The model does the same work either way; streaming only changes whether you watch, and how soon you see the first token. See [chapter 2](inside-chatprob.md#2-every-piece-was-a-choice-and-you-can-watch-it-being-made).

## system prompt

A message with the role `system`, placed before the conversation, that instructs the model without being part of what you said. This app's asks for varied wording and short answers, and the server adds it to every request after any truncation. See [chapter 5](inside-chatprob.md#5-three-replies-from-one-prompt).

## temperature

A number the logprobs are divided by before sampling. Below `1` the favorite gets more likely; above `1` the draw wanders further; at `0` the top token is taken every time. Three different things on this screen involve it, and only the pinned card's what-if view moves with the slider. See [chapter 3](inside-chatprob.md#3-turning-the-dice) and [chapter 4](inside-chatprob.md#4-what-else-it-weighed).

## time to first token

The gap between sending and seeing the first token of the reply — the part of waiting people feel. Streaming shortens it; the timing line under a streamed reply reports it. See [chapter 2](inside-chatprob.md#2-every-piece-was-a-choice-and-you-can-watch-it-being-made).

## token

The unit a model reads and writes: a chunk of text from its vocabulary, not a word and not a character. *strawberry* is three of them. Requests are billed, limited and measured in tokens. See [chapter 1](inside-chatprob.md#1-your-words-become-pieces).

## tokenizer

The program that cuts text into tokens by finding, left to right, the longest chunk in the vocabulary that matches. It has no opinion about meaning. This model's is `o200k_base`. See [chapter 1](inside-chatprob.md#1-your-words-become-pieces).

## tool

A piece of code our server can run on the model's behalf — the API calls it a function. The model never runs it; it asks for it, in a form the server can read. This app offers exactly one, `get_weather`. See [chapter 9](inside-chatprob.md#9-a-way-past-the-cutoff-tool-calls).

## tool call

A structured reply from the model — a function name and JSON arguments — asking for a tool to be run, emitted token by token the same way it writes words. The API exposes no logprobs over those tokens. See [chapter 9](inside-chatprob.md#9-a-way-past-the-cutoff-tool-calls).

## tool result

What a tool returned, handed back to the model as a message with the role `tool`. It is context like any other message: everything the model knows about the weather is that text. See [chapter 9](inside-chatprob.md#9-a-way-past-the-cutoff-tool-calls).

## tool schema

The description of a tool sent beside the messages: its name, an English description of what it does and when to use it, and its parameters. It is the only documentation the model gets, and the panel shows it exactly as the model receives it. See [chapter 9](inside-chatprob.md#9-a-way-past-the-cutoff-tool-calls).

## tool_choice

The request parameter that says whether the model may ask for a tool. The second request of a tool turn sets it to `"none"`, so the schema stays in the prompt but a second call is forbidden. See [chapter 9](inside-chatprob.md#9-a-way-past-the-cutoff-tool-calls).

## top-5 candidates

The five highest-probability alternatives the API reports beside every sampled token, via `top_logprobs: 5`. They are the rows of a word's card. See [chapter 4](inside-chatprob.md#4-what-else-it-weighed).

## top-p (nucleus sampling)

Keep only the smallest set of top candidates whose probabilities add up past `p`, then sample from that set. Sent as `top_p`; `1` cuts nothing, and the server floor is `0.01`. See [chapter 3](inside-chatprob.md#3-turning-the-dice).

## training cutoff

The date a model's training data stops. Nothing after it is in the weights, however confidently the model answers. For `gpt-4o-mini`, around October 2023. A fact problem, not a memory problem. See [chapter 8](inside-chatprob.md#8-what-it-cannot-know).

## truncation

Cutting the front of the message array before sending, which is what **Forget older turns** does. The transcript keeps everything; only the request shrinks, and the cut always lands on a user message so the request never opens with an orphaned reply. See [chapter 6](inside-chatprob.md#6-the-model-remembers-nothing).

## usage

The token accounting the API returns with every response: input tokens, output tokens, and how many input tokens came from the prompt cache. A tool turn sums two requests and keeps the split under `rounds`. See [chapter 7](inside-chatprob.md#7-what-a-conversation-costs).

## vocabulary

The fixed list of tokens a model can read and write — for `o200k_base`, roughly two hundred thousand entries. The tokenizer only ever picks from it. See [chapter 1](inside-chatprob.md#1-your-words-become-pieces).

## weights

The billions of numbers that training adjusted and that have not changed since. Everything the model knows is in them; anything after the training cutoff is not. See [chapter 8](inside-chatprob.md#8-what-it-cannot-know).
