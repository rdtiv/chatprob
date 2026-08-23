# Inside ChatProb

A walkthrough, from the first word you type to the moment the model asks our server to look something up for it. Ten chapters, one sitting, every term defined the first time you need it.

The [README](../README.md) is the catalogue: what is true of the app, feature by feature. This document is the path: the order to meet those features in so that each one explains the next. When a feature changes, the README changes first and the matching chapter follows.

Terms in **bold** are defined on first use and collected in the [glossary](glossary.md).

## 0. One request, seen from the inside

ChatProb is a chat window with the lid off. You type a message, a language model answers, and around that answer the app shows you what it normally hides: how sure the model was about each word, which other words it nearly chose, what the whole conversation was sent back to it every single turn, what that cost, and — at the end — the model writing a request for our server to run instead of an answer.

Four everyday words carry the first chapters, and none of them is in the glossary because none of them needs to be. The **language model** is the program that writes the replies; here it is OpenAI's `gpt-4o-mini`, reached through the Chat Completions API. A **prompt** is what you send it. A **reply** is what comes back. A **request** is one round trip from our server to OpenAI and back — and one of the lessons ahead is that a single chat turn is not always a single request.

### Two curricula

The app already teaches some of this by itself. Three coach marks appear in order for a first-time visitor: one on the colors (chapter 2), one on the reply tabs (chapter 5), one on the cost card (chapter 7). A follow-up chip, **Now give it the tool**, hands you chapter 9 at the one moment it is legible. Everything else — how the draw works, what the candidate card really shows, what the model forgets and why, what a training cutoff is — the app demonstrates but does not narrate. That is this document's job.

### Why this model, and why this server

`gpt-4o-mini` is the default because it still returns two things the whole UI is built on: a probability for every token it produces, and more than one reply to the same prompt in a single request. Newer and larger models increasingly return neither. The app runs on a plain Node serverless function rather than an Edge runtime or the Vercel AI Gateway for the same reason: both of those paths drop the per-token probabilities on the floor, and without them there is nothing to color.

### The one sitting

Every **Try it** in this document is one step in a single scripted conversation. Do them in order, in one chat, and each screen sets up the next. Three rules keep it on the rails:

- **Do not click any of the empty-screen chips.** They are good prompts, but clicking one skips the tokenizer lesson in chapter 1, and clicking the Denver one first moves chapters 8 and 9 to the front of the sitting.
- **Inside Controls, stay in the Sampling group until a step says otherwise.** Delivery is touched in step 5, Memory in step 6, and Tools never by hand — a chip turns it on for you in step 8. Flip Tools early and the weather question becomes a tool call before you have seen the model admit it cannot know.
- **Do not Clear.** The chips you skipped do not come back mid-conversation, and the script never needs them.

The nine steps, in brief — each chapter repeats its own:

1. Type **strawberry**.
2. Send it; watch the reply arrive; read the colors.
3. Click a word to pin its card; switch the card to **What-if: only these**; open Controls and move temperature; restore it to 1.0 afterward.
4. Read the three reply tabs on that same reply.
5. Turn **Stream the reply** off; send **Write two different metaphors for rain.**; turn streaming back on.
6. Send **My name is Ada. Remember it.**; turn on **Forget older turns**; send **What is my name?**; turn **Forget older turns** off again.
7. Send **What's the weather in Denver right now?**
8. Click **Now give it the tool**.
9. Reload the page.

The sitting is written for a desktop browser; on a touch screen the card and Controls become bottom sheets, and *click* means tap. *Send* means the circle at the right of the composer — it is a hollow ring until you type, then fills with colour — or the Enter key; while a reply is arriving, that same circle becomes a **Stop** square.

## 1. Your words become pieces

Start with the composer. Its placeholder says *Your words become tokens*, and that is the first thing to see with your own eyes, because almost everything later depends on it.

A language model does not read letters and it does not read words. It reads **[tokens](glossary.md#token)**: chunks of text drawn from a fixed list called its **[vocabulary](glossary.md#vocabulary)**. Some tokens are whole words with a leading space (` the`), some are word fragments (`berry`), some are punctuation, some are a single byte of a character that did not fit anywhere else. The program that cuts text into those chunks is the **[tokenizer](glossary.md#tokenizer)**, and the tokenizer has no opinion about meaning — it is a lookup, run left to right, finding the longest chunk in the vocabulary that matches what comes next. The vocabulary `gpt-4o-mini` uses is called `o200k_base`, for its roughly two hundred thousand entries.

Every piece of text that touches the model goes through this cut: your message, the system prompt you will meet in chapter 5, the model's own reply as it writes it, and — in chapter 9 — the weather report our server hands back. When the API bills you, it bills by the token. When the model's memory runs out, it runs out in tokens. When it miscounts the letters in a word, it is because it never saw the letters.

### Try it — step 1

Type **strawberry** into the composer and send it. Nothing about the text changes while you type — the composer is a plain text box. The tokenizer does its work on the user bubble that appears once you send: the app runs the same `o200k_base` cut on your message and paints the pieces in alternating tints, with an `≈ N tokens` count underneath. *strawberry* arrives as three pieces, not ten letters. That is why "how many r's are in strawberry" is a hard question for a model: it has to reason about letters it never received, inside chunks it cannot see into.

The count's tooltip carries an honesty note: the reply's own "new tokens" number in chapter 7 runs a little higher, because the API also counts the chat wrapper around each message.

A `·` in a user bubble is a token that decoded to nothing printable on its own — a fragment of a multi-byte character.

### In this repo

`tokenizeForDisplay` in `lib/tokenizer.js` encodes the text with `gpt-tokenizer`'s `o200k_base` table and decodes each id back to its chunk; `loadTokenizer` pulls that table in when you first focus or type in the composer (or on load, if a saved transcript already has your messages) so its megabyte never sits in the initial page. On the API side those chunks become `prompt_tokens` in the `usage` block of every response.

## 2. Every piece was a choice, and you can watch it being made

Now read the reply to *strawberry*. The words are shaded. Most are green; some are yellow; one or two may be red with a thick underline. This is the heatmap, and reading it correctly is the whole foundation of the app, so it is worth slowing down.

A language model writes one token at a time. At each position it produces a **[probability](glossary.md#probability)** for every token in its vocabulary — a number between 0 and 100% saying how likely that token is to come next, given everything before it — and then one token is picked and the process repeats with that token added to the text. This is **[next-token prediction](glossary.md#next-token-prediction)**, and it is all the model ever does. A reply is a chain of these picks, each one conditioned on the last.

The token that was actually picked at each position is the **[sampled token](glossary.md#sampled-token)**. The API reports, for every sampled token, the model's probability for it — expressed as a **[logprob](glossary.md#logprob)**, the natural logarithm of that probability. Logprobs are negative numbers; `0` means certain, `-0.69` means about 50%, `-2.3` means about 10%. The app converts each one back to a percentage and that percentage is the color.

So: **the color of a word is the probability the model gave to the word that actually landed there.** Three bands, named in the legend:

- **likely** — at or above 65%. Green. The model expected this word.
- **toss-up** — between 35% and 65%. Yellow, with a thin underline so the signal survives without color.
- **long shot** — below 35%. Red, with a thicker underline. The model picked a word it did not much expect.

Two readings of that rule are wrong, and the app refuses both. First: a red word is not a mistake or confusion. The model rolled a long shot and kept going, and the next words were conditioned on it like any other; chapter 4 shows it was usually still one of the top few candidates. Second, and written into the legend as a flat sentence: **Likely ≠ true.** Green means the wording was expected. It says nothing about whether the claim is correct. A confidently green sentence can be confidently wrong, and the colors cannot tell you which.

One more fact about these colors, stated here so it is never in doubt later: **the color of a settled word never changes.** It was computed from a number the API returned when the reply was written. Nothing you do on the page afterward — no slider, no toggle — recolors a word that has already landed. Chapters 3 and 4 give you controls that change other numbers on the screen, and it will matter that you know this one stays put.

### Watching it arrive

The reply did not appear all at once. It arrived in pieces, the heatmap filling in as each token landed, and a timing line under the reply recorded how long that took. This is **[streaming](glossary.md#streaming)**, and it is on by default.

The panel copy says exactly what streaming changes: *the reply is built one token at a time either way — streaming just lets you watch.* The only difference is whether our server forwards each token as it is produced or holds the whole reply and sends it once. What streaming buys you is **[time to first token](glossary.md#time-to-first-token)**: the gap between sending and seeing anything at all, which is the part of waiting that people actually feel.

The timing line has three shapes, and which one you get depends on the reply:

- `first token 0.4s · all replies 2.1s` — streamed, and the first token arrived measurably before the last.
- `reply 0.8s · streamed` — streamed, but the reply was short enough that first and last token round to the same tenth of a second. Short replies to *strawberry* often print this one.
- `reply 2.1s` — not streamed. First and last token arrived together because nothing was shown until everything had.

You will get to compare the first two against the third in step 5, when the sitting turns streaming off for exactly one send. Do not toggle it now; chapter 6 needs the transcript the way it is.

While a reply is streaming its words are inert — no card until it settles, because the alternatives are still arriving. If a stream dies partway, the partial text stays on screen, marked as not part of the conversation, and is never sent back to the model.

### Try it — step 2

If you have not already, send **strawberry** and watch. Then read:

- The colors. Find a yellow or red word and ask what the model might have expected instead — you will check your guess in chapter 4.
- The underlines, which tell the bands apart without color.
- The legend in the header: **likely**, **toss-up**, **long shot**, and beside them **Likely ≠ true.** The `?` next to the legend repeats the coach-mark sentence whenever you want it back.
- The timing line under the reply. Note which of the three shapes it printed; step 5 compares against it.

The first coach mark is on this reply; hovering a word advances it. Do not click anything yet — the next step does that deliberately.

### In this repo

`confidenceColor` and `confidenceBand` in `lib/completionStats.js` turn a sampled token's logprob into the gradient and the three bands (`sure` / `unsure` / `very-unsure` internally; `likely` / `toss-up` / `long shot` in the legend in `components/ChatInterface.js`). `components/Message.js` draws each token as its own square-cornered span, so neighbours read as one band; a token that carries newlines of its own — `":\n\n"` is a common one — emits those breaks as `<br>` outside the span, and a newline-only token shows a dimmed `↵` instead of an empty box so you can still hover it for its candidates. The API route in `pages/api/chat.js` asks for these numbers with `logprobs: true` and `top_logprobs: 5` on every Chat Completions call. Streaming is the same route answering `application/x-ndjson`: a `meta` event with the request as sent, a `delta` event per streamed chunk per reply, carrying that chunk's tokens, a `done` event carrying `usage`, and an `error` event when something goes wrong mid-stream. `scripts/stream-spike.mjs` is the live check that streaming, three replies and logprobs all work together — run by hand, never in CI.

## 3. Reshaping the odds

The colors told you how likely each landed word was. This chapter is about the picking itself — the step between "the model has a probability for every token" and "one token lands" — because that step has knobs, and the app lets you turn them.

Picture the model's output at one position as a **[distribution](glossary.md#distribution)**: the whole vocabulary laid out, each token with its probability, all of them summing to 100%. Next-token prediction produces that distribution. It does not produce a word. Something still has to choose one, and the choice is made by **[sampling](glossary.md#sampling)**: drawing a token at random, weighted by the distribution, so a 70% token lands about seven times in ten and a 2% token lands about once in fifty. This is why the same prompt gives different replies on different runs, why a red word is not an error, and why the next chapter's card has more than one row.

### Where the distribution comes from

The app cannot show this part, because it happens inside the model, but it is worth holding the shape of it. Every token in the context window enters the model as a **[vector](glossary.md#vector)** — a list of a few thousand numbers learned in training, so that tokens used in similar ways sit near each other. The model is a stack of layers, and each layer is mostly **[matrix multiplication](glossary.md#matrix-multiplication)**: the vectors are multiplied by the weights, mixed with each other so every position can draw on the positions before it, and passed up. What comes out at the last position is one more vector, the **[hidden state](glossary.md#hidden-state)** — the model's compressed account of everything so far, in a space no human labelled. One final multiplication measures that vector against an entry for every token in the vocabulary and produces roughly two hundred thousand scores, the **[logits](glossary.md#logits)**. A softmax turns the logits into the distribution, and the logprobs the API returns are the log of it. So the vocabulary is not just where your words are cut from; it is the space the model answers in, one score per entry, every single position.

Open **Controls** in the header and look at the first group, **Sampling**. Its four one-line notes are accurate, so they are quoted.

**[Temperature](glossary.md#temperature)** — *Flattens or sharpens the odds before sampling. 0 always takes the most likely token.* Before the draw, every logprob is divided by the temperature and the distribution is rebuilt. Below 1 the gaps between tokens widen: the favorite gets more likely, the long shots fade. Above 1 the gaps close: the favorite is still the favorite, but the draw wanders further. At exactly 0 there is no draw — the top token is taken every time, which the app calls winner-take-all. The slider runs from `0` to `1.8` in tenths and defaults to `1.0`, which is the distribution as the model produced it.

**[Top-p](glossary.md#top-p-nucleus-sampling)** — *Only considers the most likely tokens whose odds add up to this much. 1 considers everything.* This is **top-p**, also called nucleus sampling: sort the tokens by probability, keep the smallest set from the top whose probabilities add up past `p`, and draw from only that set. At `1` nothing is cut. At `0.5` the draw is confined to the favorites that together cover half the mass. The slider floor is `0.05`; the server will not go below `0.01`, because a top-p of zero has no tokens left to pick from.

**[Presence penalty](glossary.md#presence-penalty)** — *Pushes the model away from words it has already used. Higher means more wandering.* A **presence penalty** is a flat amount subtracted from the logprob of any token that has already appeared in the reply — once it has appeared, however many times. The app's default is `0.45`, not `0`. That is a deliberate choice: out of the box the demo leans slightly against repeating itself, so the three replies in chapter 5 spread out a little more than they otherwise would.

**Make it repeatable** — *Send the same message twice and the replies should come back nearly identical. Sets temperature to 0 and pins a seed — best-effort, not guaranteed.* A **[seed](glossary.md#seed)** is a number handed to the API's random draw so that two requests with the same seed make the same picks. Flipping this on sets the temperature slider to `0`, greys it out, and sends `seed: 7` with the request; flipping it off gives you back the temperature you had. Read the copy exactly: *nearly* identical. OpenAI documents its seed as best-effort, and the app does not promise more than the API does.

### What the header tells you

Close the panel and look at the **Controls** button. It always carries a `temp 1.0` chip, and it grows one more chip for every switch that has moved off its default — `streaming off`, `memory none` or `memory last 2`, `tool on`, `repeatable`. The rule behind this is simple and the rest of the sitting leans on it: **if a chip is showing, the next send will be shaped by it.** Every switch that has moved off its default earns a chip; the two secondary sliders, top-p and presence penalty, do not, so check the panel if you have touched those.

### What moving the slider does — and does not — do

Here is the second of three facts about temperature that this document keeps apart. Chapter 2 gave you the first: the color of a settled word never changes. This is the third, stated early because it is the one people assume wrongly: **moving the temperature slider changes the next request, not the reply on screen.** The reply to *strawberry* was sampled once, at the temperature that was set when you sent it. Nothing can resample it. A new temperature produces a new draw on the next send, with its own landed words and its own colors.

So where are the live odds — the thing on screen that does move when the slider moves? It is in the next chapter, and it is the reason the next chapter's Try-it and this one are the same step.

### Try it — step 3, shared with chapter 4

Shared with chapter 4: pin a word first, then move the slider. Read chapter 4 and do the step once, for both.

### In this repo

The bounds — `TEMP_MIN`, `TEMP_MAX`, `TOP_P_HARD_MIN`, `PENALTY_DEFAULT`, `BORING_SEED` and the rest — live in `lib/sampling.js`, and its `clampTemperature`, `clampTopP`, `clampPresencePenalty` and `clampSeed` run again inside `pages/api/chat.js`, so a hand-built request cannot get past the panel's limits. They are sent as the Chat Completions parameters `temperature`, `top_p`, `presence_penalty` and, only while **Make it repeatable** is on, `seed`. The panel is `components/SamplingPanel.js`; the chips are drawn in `components/ChatInterface.js`.

## 4. What else it weighed

Every colored word has a card behind it, headed **What it considered**. It answers the question chapter 2 asked you to hold: what else might the model have put here? And it is where the temperature slider finally has something to move.

### Opening the card

Hovering a word previews its card; moving the mouse away closes it. To keep it open, **click the word** (or tap it on a touch screen). A pinned card stays while you open Controls and move sliders, and closes on Escape, on a click elsewhere, or on clicking the same word again. The sitting needs a pinned card, so click.

The card has two views, and the difference between them is the whole lesson.

### Of all words

The card opens on **Of all words**. The rows are the tokens the model rated highest at this position — the API returns the **[top-5 candidates](glossary.md#top-5-candidates)** beside every sampled token, each with its own logprob — and the percentage beside each row is that token's real probability across the entire vocabulary, as the model produced it. The sampled token's row is marked. The card's note says the part people miss: *they do not add up to 100%.* Of course they do not; the other two hundred thousand tokens hold the rest. A position where the five rows sum to 40% is a position where the model was spread thin, and the card shows you that honestly rather than inflating the rows to fill the bar.

Two details. If the landed word was not among the top five — a real long shot — it gets its own row below the list, labelled *landed — not in the top 5*, with its exact probability rather than a rounded zero. And rows under half a percent are dropped from the list (except the landed word, which is always shown), so a position with one dominant candidate shows one or two rows, not five padding entries.

### What-if: only these

Click **What-if: only these**. The same rows are now rescaled as if these were the only tokens in the vocabulary, so they do add up to 100% — at the temperature currently on the slider. This is a different quantity from the first view, a what-if rather than a measurement, and the card's note says so: *What-if: rescaled as if only these 5 words existed, at temp 1.0.* (On a long-shot word the count includes its extra row.)

This view is the **[live odds](glossary.md#live-odds)**. Open Controls, move the temperature slider, and watch the percentages move while the rows stay put. Slide toward `0` and the top row climbs to `100.0%` while every other row reads `<0.001%` — that is winner-take-all, drawn. Slide toward `1.8` and the rows flatten toward each other. A line at the bottom of the card keeps the record straight while you do this: *Sampled at 1.0 · showing what-if at 0.3.* The word on screen was drawn at the first number; you are looking at what the odds would have been at the second.

The rescaling is a **[softmax](glossary.md#softmax)** — the same operation the model uses to turn its raw scores into a distribution — applied to just these rows, after dividing each logprob by the temperature. That is also why, mathematically, the what-if at `1.0` is nothing more than the first view's numbers divided by their sum: at the model's own temperature, renormalization is all that changes.

### Why the rows never change

You may have noticed that moving the slider never makes a row appear or vanish. That is a rule, not an accident. The rows are a **[frozen candidate set](glossary.md#frozen-candidate-set)**, fixed when the card opens from the logprobs the API returned. Nothing you do afterward can add a candidate, because the app has no new information to add one from — it only ever had those five plus the landed word.

Freezing is safe because of a measured fact about the API: the logprobs it returns do not depend on the temperature the request was sampled at. A script in this repo asked the same prompt at `0.2` and at `1.8` and compared the top-5 logprobs at the first position; the largest difference was `0.0000`. So the candidate set and its raw probabilities are the model's, not the slider's, and one set serves both views at every temperature.

### The three temperatures, side by side

You have now seen all three things that the word *temperature* can be pointing at on this screen. They are different, and the app keeps them different:

| What you are looking at | What it is | Does the slider move it? |
| --- | --- | --- |
| The color of a word in the reply | The probability the model gave the landed token, from the logprob the API returned when the reply was written | **No.** Settled words never recolor. |
| The percentages under **What-if: only these** on a pinned card | The frozen candidate rows re-softmaxed at the slider's current temperature | **Yes.** This is the only live odds on screen. |
| The next reply you send | A fresh draw at the slider's temperature, with its own landed words and its own colors | Yes — on the next send, not on anything already written. |

If a sentence in your head merges two of these rows, stop and pull them apart. "Turning up the temperature makes the colors hotter" merges rows one and three, and it is false.

### Try it — step 3

One step covers chapters 3 and 4. Do it in this order, because the order is the point:

1. **Click a word** in the *strawberry* reply — a yellow or red one is most interesting — to pin its card. Read the **Of all words** rows and the note that they do not sum to 100%.
2. Switch the card to **What-if: only these**.
3. Open **Controls**. Stay in the **Sampling** group. Drag **Temperature** down toward `0` and watch the card: the top row goes to `100.0%`, the others to `<0.001%`. Drag it up toward `1.8` and watch them flatten. Read the *Sampled at … · showing what-if at …* line.
4. Switch back to **Of all words**. The percentages sit still no matter where the slider is.
5. Look at the reply itself. Nothing on it changed: not a color, not a word.
6. **Put the temperature back to `1.0` before you continue.** The next three sends are drawn at whatever the slider says, and at `0` they would come back as three near-identical replies, which would spoil chapter 5.

If the word you pinned is the first place the three replies differ, the card also carries a fork note. Chapter 5 explains it.

### In this repo

`buildFrozenSet`, `rawOdds` and `oddsAmongCandidates` in `lib/resoftmax.js` are the frozen rows, the first view, and the second; `WINNER_TAKE_ALL_EPSILON` is the floor below which the second view stops dividing and simply picks the top row; `formatPercent` is what prints `<0.001%` rather than a false `0%`. The card is `components/TokenProbabilities.js`, which reads the live temperature through `components/SamplingContext.js` so a pinned card re-renders as the panel changes. The data comes from the API's `top_logprobs` field. The measurement behind the freeze is `scripts/temp-gate-check.mjs`, and its result is recorded at the top of `lib/resoftmax.js`.

## 5. Three replies from one prompt

Look above the *strawberry* reply. A strip says *3 replies were written. You are reading reply* and offers tabs **1**, **2** and **3**, each with a small colored dot. The app did not ask the model for one reply. It asked for three.

### n

Chat Completions accepts a parameter called **[n](glossary.md#n-samples)**: how many independent replies to draw for the same prompt in one request. Every request this app sends uses `n: 3`. The model builds the distribution once per position and the three replies sample from it separately, so they are three draws from the same odds, not three models and not three prompts. Click tab **2**, then **3**. Same question, same weights, same system prompt — different words.

This is the app's best demonstration of chapter 2's warning. All three replies are mostly green. Each is confident. They disagree. Green never meant true; it meant expected, and three different things can each be expected.

### The fork

Switch between the tabs and watch the start of the reply. Often the first few words are identical across all three, and then at some word they part ways. The app draws a ring around that word — the **[fork point](glossary.md#fork-point)**, the first token at which the three replies differ. Pin it and its card says so: *Identical until here. All 3 replies produced exactly the same tokens up to this point, then chose differently.* If they differ from the very first word, the note says that instead.

The fork is the draw made visible. Before it, the draw landed the same way three times — usually because one token had most of the probability and kept winning. At the fork, a less dominant position let the draws land on different rows of the candidate card, and from then on each reply was conditioned on its own past, so they kept diverging.

### Perplexity

Hover a tab and its tooltip reads something like *Response 2 · picking from ~4 plausible words*. That phrase is the app's plain-language rendering of **[perplexity](glossary.md#perplexity)**: take the mean of the logprobs over every token in the reply, negate it, and exponentiate. The result is, roughly, how many tokens the model was choosing between on an average position. A reply at perplexity 2 was mostly coin-flips between two words; at 8 it was spread across eight. The dot on each tab is the same measurement, inverted — the mean per-token probability — turned into a color, so you can see at a glance which reply was the surest without opening it.

(A rare sentinel logprob near `-9999` means "unavailable"; the app excludes it from the mean.)

### Two settings that shape all three replies

Two things in every request exist so that `n: 3` is a demonstration rather than three copies. The first is the **[system prompt](glossary.md#system-prompt)**: a message with the role `system`, placed before the conversation, that instructs the model without being part of what you said. This app's system prompt is short and you will read it verbatim in chapter 6; it asks the model to vary its wording and sentence openings and to keep answers to a sentence or two. The second is `max_tokens: 300`, a hard ceiling on reply length, which is why a reply here never runs to paragraphs. Both are set by the server on every request and neither is a control you can change.

### Why the tabs lock

Right now all three tabs on the *strawberry* reply are live. After your next send, look back at them: they are disabled, and a small padlock has appeared. Click it: *This reply is part of the conversation's history now — the next turn was built on it.*

The reason is the fact this whole document turns on. **The next request carries only the reply you had selected** — one tab's text, as an assistant message — not all three. The model never sees the alternatives; the app keeps them for you. So once you send again, the tab that was selected has become history that the new reply was conditioned on, and switching it afterward would rewrite a past the model already answered to. The lock is not a UI restriction. It is what makes a conversation possible at all when every turn has three candidates.

### Calibration, and the chip that is not here

Green-but-wrong would be an easy demo if the model were bad at things. The app used to try: famous myths, classic riddles, judgment calls. `gpt-4o-mini` corrects the myths, solves the riddles at 95–100% confidence, and hedges judgment calls with "this can vary by context" in most replies. That is **[calibration](glossary.md#calibration)** — confidence that tracks correctness — and it has improved faster than any gotcha can keep up with. So there is deliberately no "watch it be confidently wrong" chip. The lessons that survive a better model are the mechanical ones you are walking through: three draws disagreeing, the odds, forgetting, and the tool round trip.

### Try it — step 4

On the *strawberry* reply, still on screen:

1. Click tabs **1**, **2**, **3** and read all three. Note the dot on each.
2. Find the ring and read the fork note by clicking the ringed word.
3. Hover a tab for its *picking from ~N plausible words* line.
4. Leave whichever tab you like selected — that is the one the next request will carry.

The second coach mark is on this strip: *This prompt was answered 3 times — try tab 2.* Picking a different tab advances it.

### In this repo

`n: 3` is set in `pages/api/chat.js`, which also builds the outgoing assistant messages with `assistantText` from each reply's `activeIndex` — the selected tab, nothing else. `findForkIndex`, `completionStats` and `formatPerplexity` in `lib/completionStats.js` compute the ring, the mean logprob, the perplexity and the tab dots; `SENTINEL_LOGPROB_FLOOR` is the cutoff for bad values. `VARIETY_SYSTEM_PROMPT` and `max_tokens` are constants in the route. The lock is the `tabsLocked` prop that `components/ChatInterface.js` computes for any reply followed by a later user message, and `selectCompletion` there refuses the switch a second time even if the UI were bypassed.

## 6. The model remembers nothing

This chapter is in two beats, around two sends. The first shows you what a request actually contains. The second makes the model forget a name you just gave it, and shows you that the forgetting happened in the request, not in the model.

### Beat one: the exact request

Turn streaming off for one send — **Controls → Delivery → Stream the reply** — then send **Write two different metaphors for rain.** and turn streaming back on. (That is step 5, fully; the chapter 7 part of it comes next.) The reply lands whole, and its timing line reads `reply 1.9s` with no `· streamed` — the third shape from chapter 2, for comparison with your first.

Now look below the transcript. A card titled **What each request carried** has been sitting under the conversation since your first reply; with two replies on screen, the third coach mark has just expanded its **Details** for you. At the bottom of the opened card is a button: **View the exact request**. Press it.

What unfolds is the literal array our server sent to OpenAI for the reply you are reading, one JSON block per message. Read it top to bottom:

- The first block has `"role": "system"`. This is the system prompt from chapter 5, verbatim: *You help people see that language models sample from a next-token distribution. Vary your wording and sentence openings. Keep answers concise (one or two sentences unless asked otherwise).* Our server adds it to every request.
- Then `"role": "user"` — *strawberry*.
- Then `"role": "assistant"` — the *strawberry* reply, but only the tab you had selected. One text, not three. This is the lock from chapter 5, seen from the other side.
- Then `"role": "user"` — the rain prompt.

These are **[messages](glossary.md#messages)**, and the three **[roles](glossary.md#roles)** — `system`, `user`, `assistant` — are the entire vocabulary of a chat request. Every turn, the app sends the whole conversation as this array, and that array is the **[context window](glossary.md#context-window)**: the only thing the model can see when it writes. It has no other memory. It did not remember *strawberry* from a minute ago; it was shown *strawberry* again, just now, as part of this request. The pale blocks are the parts that were already sent in an earlier request; the dark blocks are this turn's new exchange. This is **[replay](glossary.md#replay)**, and the note under the array makes the sharpest version of the point: the reply you are reading is missing from its own request, because it did not exist yet — it gets replayed in the *next* request.

Nothing in the conversation is stored on the server between turns. What you see as a conversation is a transcript in your browser that the app re-sends, in full, every time you send.

### Beat two: making it forget

Now send **My name is Ada. Remember it.** Wait for the reply; the model will agree to.

Open **Controls → Memory** and turn on **Forget older turns**. The **Exchanges replayed** slider below it activates at `none`, the header gains a `memory none` chip, and in the transcript a rule appears with a sentence: *Everything above this line is forgotten. These 4 messages are still on your screen, but they are not part of the request anymore — the model never sees them.* The turns above the line dim.

Look where the line is. It is above the Ada exchange, not below it. The window is measured back from the newest user message — *My name is Ada* is that message right now, so with `none` replayed the next request will carry it and nothing earlier. Ada has not been forgotten yet. The switch did not hide her. It set a rule for the next request, and the line shows you exactly what that rule will keep.

Send **What is my name?** The moment you do, that question becomes the newest user message, the window is measured from it, and the Ada exchange falls above the line. The request goes out carrying the system prompt and four words. The model answers that it does not know your name — and it is right not to. It never knew it; it had been shown it.

This is **[truncation](glossary.md#truncation)**: cutting the front of the message array before sending. The transcript on your screen keeps every message. Your saved conversation keeps every message. Only the request shrank, and the line and the request come from one function, so the line can never claim a rule the request did not follow. Each step up the **Exchanges replayed** slider adds one earlier exchange back into the window; the system prompt is never counted and never falls off, because the server adds it after the cut.

Glance at the cost card before you turn the switch off. The earlier bars in its chart stayed tall; the newest bar is just the name question. That shrinking bar is where chapter 7 starts. Then **turn Forget older turns off** so the rest of the sitting replays the whole transcript again.

(The empty-screen Ada chip seeds the same fact, and a **Now make it forget** follow-up then flips the switch and asks for you; you typed it so the chips stayed out of chapter 1's way.)

### Try it — steps 5 and 6

Step 5: streaming off, send the rain prompt, streaming on; **View the exact request**; read the four blocks. Step 6: the Ada line; **Forget older turns** on; read where the rule sits; **What is my name?**; watch the line move; glance at the chart; the switch off.

### In this repo

`buildOutboundMessages` in `lib/contextWindow.js` is the single source for both what leaves the browser and where the line is drawn; `KEEP_ALL` is the sentinel for "replay everything" and `KEEP_TURNS_DEFAULT` is where the slider lands when the switch goes on. The server echoes the array it sent as `echoedMessages`, and `components/RequestEcho.js` prints it, classifying blocks as replayed or new by the last real assistant message. `components/ForgottenDivider.js` draws the line. The API has no parameter for any of this; it is all in what the `messages` array contains.

## 7. What a conversation costs

The model is paid by the token, in both directions, and chapter 6 just showed you that every request carries the whole conversation. Put those together and a chat has a shape: each turn costs more than the last, even when the answers stay short. The cost card is built to show that shape in tokens first and dollars second.

### Two numbers

Look at the card's header before opening **Details**. **Sent this turn** — something like `143 in · 13 out`. **Conversation so far** — a running token total. These are the two numbers that teach the lesson, and they are tokens, not money, on purpose. **[Input tokens](glossary.md#input-tokens)** (the API calls them prompt tokens) are everything in the request: system prompt, every replayed message, the chat wrapper around each one, your new message. **[Output tokens](glossary.md#output-tokens)** (completion tokens) are what the model wrote — and because each request draws three replies, the `out` number counts all three, not just the tab you are reading. Together they are the request's **[usage](glossary.md#usage)**, reported by the API at the end of every response.

The same summary sits under each reply as `N in · M out`, with a `▾` that opens the itemized version: *everything sent this request*, *replayed — last turn's prompt, sent again*, *new — last reply plus your latest message*, *out this tab*, *total out this turn — all samples*, and the dollar figure for the turn at list price.

### The staircase

Open **Details**. The chart at the top is the prompt staircase: one horizontal bar per request, numbered in order, each bar's length the number of input tokens that request carried. The bars climb. Each is split into up to three segments, and the legend names them, and they are three different things:

- **replayed** (pale) — tokens that were already sent in the previous request and were sent again. This is the context window from chapter 6, paid for a second time.
- **new** (dark) — tokens that were not in the previous request: the last reply, and your newest message.
- **cached** (medium) — tokens that OpenAI served from its **[prompt cache](glossary.md#prompt-cache)**, a provider-side shortcut for a long enough unchanged prefix of a conversation it has seen recently, billed at a discount — half price on `gpt-4o-mini`, a quarter on the 4.1 family. This segment appears only once the conversation is long enough for the cache to engage. Read it carefully: cached is a *discount on resending*, not memory. The tokens were still sent. The model still had to be shown them. You paid less to show it.

The note under the chart says the same thing in two sentences — each bar is one request, and the pale part was already sent before — and the third coach mark says it in one: *Every request re-sends the whole chat. Watch the pale part grow.*

The bar from your name question is short. That is the memory switch from chapter 6 showing up in the bill: forgetting is cheaper, because the pale part is gone.

### The price

Below the chart: *Conversation so far N tokens ≈ 1/466 of a cent · a million chats like this ≈ $21.00*, and a **How is this priced?** disclosure with the rate card — for `gpt-4o-mini`, `$0.15 / 1M in · $0.60 / 1M out`, and `$0.075 / 1M cached in` once any tokens have come from cache. Those are **[list prices](glossary.md#list-price)**, per million tokens, as published; if the server is pointed at a model the app does not have a card for, it says so and estimates with the mini-model rates.

A turn on this model costs a small fraction of a cent, and a rounded `$0.00` would teach nothing, so the app never prints one — it spells fractions out: `≈ 1/167 of a cent`, or `less than 1/10,000 of a cent` at the floor, and `$0.01` for anything close enough to a cent to be called one. *A million chats like this* multiplies the last turn by a million, so the number has a size a person can hold.

### Try it — step 5, the rest

With the cost card open: read the two numbers; find the pale segment growing from bar 1 to bar 2; open **How is this priced?** and the `▾` under the rain reply. After step 6, come back for the short bar.

### In this repo

`buildUsage` and `formatTokenSummary` in `lib/usage.js` build the per-turn `usage` object from the API's `prompt_tokens`, `completion_tokens` and `prompt_tokens_details.cached_tokens`, and print the `N in · M out` line. `rateFor`, `turnCost`, `formatUsd` and `formatScale` in `lib/openaiRates.js` hold the rate card and the fraction-of-a-cent and million-chat formatters. `components/PromptStaircase.js` draws one bar per request and splits it against the previous request's prompt; `CostFooter` and `ConversationExplainer` in `components/ConversationExplainer.js` are the price lines and the teacher copy.

## 8. What it cannot know

Send **What's the weather in Denver right now?** The model answers that it cannot know — it has no access to real-time information — and, if it is in a helpful mood, suggests a weather service. Read the colors: the refusal is green. It was an expected sentence. It is also the truth.

### The cutoff

A model's knowledge comes from its training data, and that data stops at a date: the **[training cutoff](glossary.md#training-cutoff)**. For `gpt-4o-mini` it is around October 2023. Everything the model knows is in its **[weights](glossary.md#weights)** — the billions of numbers that training adjusted — and the weights have not changed since. Anything that happened after the cutoff is not in there, and no amount of asking nicely or phrasing cleverly can put it there. This is not the forgetting from chapter 6, which was about the request. This is a fact problem: the fact was never in the model at all.

Look under the Denver reply. A pill reads **knowledge ends ~October 2023**, and beneath the reply a longer note has opened by itself: *This model was trained on text that stops around October 2023. Nothing after that is in there — today's weather included. However sure it sounds, the colors only tell you the wording was expected, not that the facts are current.*

### When the pill and the note appear

The pill appears on every settled reply that has no tool call and no error, as long as the model that served it has a published cutoff in the app's table. If the server is pointed at a model the app does not know, there is no pill — a guessed date would be a false claim, and the app would rather say nothing. The served model's id comes back with every response, so a dated id like `gpt-4o-mini-2024-07-18` still resolves to the right family.

The long note opens by itself only once per conversation, on the first reply whose prompt actually asked for something recent. The test is a short list of words: `today`, `right now`, `currently`, `current`, `latest`, `this week`, `weather`. Your Denver prompt matched on two of them. Ask what 2 + 2 is and you get the pill and nothing more; the `?` on any pill opens or closes the same note on that reply whenever you want it. The phrase *today's weather included* is itself conditional — it appears only because the prompt said *weather*.

### Try it — step 7

Send the Denver question exactly as written. Read the reply, the pill, and the note. Then look just above the composer: a new chip is waiting, and it is the subject of the next chapter. Do not click it until you have read what it is about to do.

### In this repo

`knowledgeCutoff` in `lib/modelFacts.js` is the table and the longest-prefix lookup that resolves dated ids; `null` for unknown models is deliberate. `RECENCY_RE`, `needsCutoffNote` and `mentionsWeather` in `lib/cutoffRelevance.js` decide the note and its weather clause. The model id comes from the API's `response.model`. Pill and note are rendered in `components/Message.js`; which reply gets the auto-opened note is `firstCutoffIndex` in `components/ChatInterface.js`.

## 9. A way past the cutoff: tool calls

The model cannot know Denver's weather. Our server can find out. This chapter is about the protocol that connects the two, and it is the reason the sitting was built the way it was: you have now seen every piece that the protocol is made of — tokens, sampling, messages and roles, the context window, usage across requests — and a tool call is nothing but those pieces in a particular order. A **[tool](glossary.md#tool)** — the API calls it a function — is a piece of code our server can run on the model's behalf; the model's part of the bargain is to ask for it in a form the server can read.

### The chip

Just above the composer sits **Now give it the tool**. It does two things: it turns on **Controls → Tools → Let it call a weather tool**, and it re-sends your Denver question exactly as you typed it. The two replies — one without the tool, one with — end up next to each other in the transcript, which is the whole lesson.

Before clicking, open Controls and read the **Tools** group. The switch's note: *Off, the model answers from training alone, and its training stopped years ago. On, we offer it one function it can ask for — it still cannot run anything itself.* Below it is the **[tool schema](glossary.md#tool-schema)** — the only description of the tool the model will ever receive. A name: `get_weather`. A description, in English, saying what it returns and when to use it. One parameter, `location`, a string, required, with its own description. *This is the whole briefing,* the panel says, and it is: the model reads this, decides whether your question needs it, and writes the arguments itself.

Notice also that **Delivery → Stream the reply** has greyed out with a note: *Tools are on, so this turn arrives whole. The first request ends in a tool call rather than in words — there is nothing to watch appear.* That is the third invariant of this document: **tools imply the whole-reply path; streaming is off while the switch is on.** The header shows `tool on` and no `streaming off` chip, because the switch itself has not moved — it has been overruled, and the panel says so in place rather than quietly ignoring it.

### Request one: the model asks

Click the chip. After a moment, two cards appear above the new reply, then the reply itself.

The first card's badge says **the model asked for a tool**. Beside it, `get_weather`, and under it, in plain monospace:

```json
{
  "location": "Denver"
}
```

The request went out as before — system prompt, conversation, your question — plus a `tools` array beside the messages holding that schema. Instead of a sentence, the model wrote a **[tool call](glossary.md#tool-call)**: a structured message saying *call this function with these arguments*. It emitted the function name and the JSON argument token by token, exactly the way it writes words, sampled from a distribution like anything else. It did not run anything. It cannot. It produced a request.

The card's note says the rest, and it is worth quoting because it includes a deliberate gap: *The API returns no probabilities for these tokens, so there is nothing to shade here.* The argument JSON is sampled text, but the API does not expose logprobs over tool-call arguments, so the card prints it plain rather than pretending to a heatmap it does not have. That absence was measured, not assumed.

One line under the JSON reports which of the three replies asked: *All 3 samples asked for this same call.* Because every request still draws three replies, the server looks for the first one whose message carries a tool call — not necessarily the first reply, since sampling is noisy enough that one draw can ask for the tool while another answers in prose — and reports how many of the three agreed.

### Our server runs it

The second card's badge says **our server called the weather API**, with a status and a duration — `200 · 0.4s`, say — and the **[tool result](glossary.md#tool-result)**: a JSON object with the location, temperature in both scales, conditions, wind, humidity and feels-like, unedited, exactly as it came back from the weather service. The note: *This text goes to the model as a new message — it is everything the model knows about the weather right now.*

In between, the server validated the argument — the location came from a language model, so it is untrusted input until checked: a non-empty string, not absurdly long, no control characters — and made an ordinary HTTP call to a weather provider with a ten-second timeout, using a key that lives in one server file and never appears in an error or a response. If the provider fails — or if the key is not configured at all — the card turns red, the status reads `failed`, and the error text goes to the model unedited in place of the weather. That is not a broken demo; the model answering honestly from an error is the protocol working.

### Request two: the model answers

Now the second request. It is the first request again — same system prompt, same conversation, same `tools` array — plus two new messages appended: the model's own tool-call message, as an `assistant` turn with `tool_calls` and no text, and a message with a fourth role you have not seen yet, `tool`, whose content is the weather JSON. The model reads the result as context, like any other message, and writes the reply you see: Denver's weather, in a sentence, green.

This request carries one more parameter, **[tool_choice](glossary.md#tool_choice)**, set to `"none"`. The schema is still in the prompt, so the two requests differ by exactly the tool call and its result — but the model is forbidden from asking again. That is a deliberate, structural cap — a **[one-round loop](glossary.md#one-round-loop)**, always. The model did not "decide" to stop. The protocol did not give it the option. A system that lets the model call tools repeatedly, deciding each time whether to continue, is a loop this app deliberately does not run; what you are looking at is the single round trip that any such loop is made of.

Open **View the exact request** on the cost card. It now shows the second request's array. Find the `assistant` block with `tool_calls` and the `tool` block after it, both dark — they are this request's new tokens. Find the `tools` block below the messages, labelled with `tool_choice: "none"`. Its note tells you what the first request taught the model: *The tools block is how the model knew a weather function existed — nothing in the system prompt mentions it.*

### What it cost, and how long it lived

The reply's usage line reads differently from every earlier one: `270 + 341 in · 49 out · 2 requests`. Open its `▾` and each request is itemized — *first request, the one that ended in a tool call*, *next request, the same prompt plus the tool call and its result*. In the staircase this turn draws two bars, suffixed **a** and **b**. Bar **b** is measured against bar **a**, so its dark segment is precisely the tool call and its result: the cost of the lookup, in tokens.

And then it is gone. The tool exchange is not replayed. The next request you send carries the model's final sentence about Denver as an ordinary assistant message — the same way every other reply is echoed back — and nothing else from this turn. The weather lived in the context window for exactly one request.

### If the model asks twice

Ask for two cities in one question and the model may emit two tool calls in a single reply — **[parallel tool calls](glossary.md#parallel-tool-calls)**. The server runs each and returns each result as its own `tool` message. It runs at most three; any beyond that get a "skipped" error result, so the model still receives a message for every call it made. The agreement line counts two replies as agreeing even if they listed the cities in a different order.

### Try it — step 8

1. Open Controls; read the Tools group and the greyed-out streaming switch. Close it.
2. Click **Now give it the tool**.
3. Read the two cards and the reply in order. Read both card notes.
4. Open the reply's `▾` usage line. Find the two requests.
5. In the cost card, find the two bars with letter suffixes, then **View the exact request** and find the `tool_calls` block, the `tool` block, and the `tool_choice: "none"` label.
6. Note that this reply has no cutoff pill. It did not answer from training.

### In this repo

`WEATHER_TOOLS` and `parseWeatherArguments` in `lib/weatherTool.js` are the schema the model is shown — the same object the panel renders — and the argument check. `getWeather` and `normalizeLocation` in `lib/weather.js` make the call; the key is read there and nowhere else. In `pages/api/chat.js`, round one sends `tools`, the route picks the first choice with `tool_calls`, `MAX_TOOL_CALLS` caps execution, and round two appends the `assistant` tool-call message and one `role: "tool"` message per call before sending `tool_choice: "none"`. `buildUsage` in `lib/usage.js` sums both rounds and keeps them under `usage.rounds`; the client sends `tools: true` and skips streaming in `components/ChatInterface.js`; the cards are in `components/Message.js`. `scripts/tool-spike.mjs` is the live check that tools, three replies and logprobs work together, and that logprobs are absent over tool-call arguments.

## 10. What the page keeps

Reload the page.

The conversation is still there: every turn, every color, the three tabs on each reply, the forgotten-line exchange, both tool cards with their JSON. The coach marks did not come back. The cost card still shows the conversation total. This is **[persistence](glossary.md#persistence)**: the app saves the transcript in your browser's `localStorage` as you go, and restores it on load. Nothing was ever stored on the server.

Three things about what survives are worth knowing; two are windows, easy to confuse with chapter 6's.

**Alternatives are kept for the newest twenty replies.** A reply's candidate cards — the top-5 rows from chapter 4 — are the bulk of what gets saved, and a browser's storage is finite. So only the twenty most recent successful replies keep their alternatives. Older replies keep every token and its logprob, so the heatmap, the underlines, the tab dots and the fork ring all survive, but pin a word on one and the card says so: *This reply is old enough that only the chosen token was kept… Its alternatives are gone.* **Of all words** still works for the landed token, because its logprob was kept. This window counts replies, is cut on a reply boundary, and only ever removes alternatives. The window from chapter 6 counts your messages, is cut on a user-message boundary, and only ever removes messages from the request. Neither touches the other.

**The exact request is kept for the newest turn only.** A stored copy of every request would dwarf the transcript, so on your next successful send, the previous turn's `echoedMessages` and its `tools` block are dropped. The disclosure always describes the latest request; the staircase and each reply's usage line remain as the record of the earlier ones.

**The controls are not saved.** After the reload, Controls is back at its defaults: temperature `1.0`, streaming on, memory off, tools off. The `tool on` chip is gone. If you send now, the request goes out with no tools array, and the conversation — including the tool turn, as a single assistant sentence — is replayed in full.

Two smaller protections. A reload in the middle of a streaming reply does not leave a half-finished reply that looks finished: the interrupted turn is healed into an aborted note, kept on screen, never resent. And **Clear** takes two clicks — the button arms into `Clear?` and disarms itself after three seconds — because a stray tap should not cost you the transcript you were reading.

### Try it — step 9

Reload. Confirm the transcript, the tool cards, and the absent coach marks. Pin a word on the *strawberry* reply: the card still has its rows, because this conversation is well inside the twenty-reply window. Open **Controls** and read the defaults. Press **Clear** once and watch it ask; let it disarm.

### In this repo

`pruneForStorage` and `KEEP_FULL_TURNS` in `lib/persistence.js` strip alternatives from turns beyond the window and mark them `alternativesPruned`; the card copy for those is in `components/TokenProbabilities.js`. The save and restore, the streaming heal, the echoed-request drop on the next send, and the two-click Clear are all in `components/ChatInterface.js`, under the storage keys `chatMessages` and `chatprobCoach`.

---

That is the whole path: a word becomes tokens, each token is a draw from a distribution you can inspect and reshape, three draws disagree, every turn replays everything before it at a price, the model's knowledge stops at a date, and a tool call is the model writing a request in tokens for someone else to run — once — and reading the answer as more tokens. Every term along the way is collected in the [glossary](glossary.md).
