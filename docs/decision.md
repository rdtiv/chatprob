# Decision

The other tab. Not a chat, and not a second copy of the LLM lesson.

**LLM** samples the next token and shows you the draw: logprobs, three replies, temperature. That path is `POST /api/chat`, OpenAI Chat Completions, and it stays off the AI Gateway and off Edge because those drop logprobs. It needs `OPENAI_API_KEY`.

**Decision** asks typed questions about one shared state and gets probabilities back. There is no prose. The model is Jev, TypeSafe's System One model, called as `typesafe-ai/jev` through the AI SDK's `experimental_evaluate` in `POST /api/evaluate`. It needs `AI_GATEWAY_API_KEY`, or Gateway OIDC when Vercel already injects a token. A missing key is an error after Run. It does not take down the LLM tab, and it is not a line on the tab when the key is present.

## The one ticket

One support ticket: by default the subject is “Can’t sign in after password reset.” The customer is not asking for money back, is on the family plan, and has three earlier tickets. Subject, message, plan, and earlier-ticket count are editable. **Run this judgment** posts that text as `state`. **Reset**, top-right, is two clicks like **Clear** and restores that subject, message, plan, and earlier-ticket count, plus the default threshold lines. Questions stay the fixture, so the endpoint is not an open proxy for a different schema. A body with no `state` still judges the canned ticket. A `state` that fails the shape check is a 400 and is not silently replaced.

Three questions go out together:

- **choice** — which queue (billing, technical, account, other), with a probability for every option
- **score** — severity on a four-step rubric, as a fractional score plus a distribution over the steps
- **boolean** — whether the customer asked for money back. In TypeSafe's API this primitive is called noul. The SDK names it `boolean`. The number is P(true): 0.98 is a strong yes, 0.02 is a strong no, 0.50 is a coin flip. It is not "confidence."

Choice and score may also carry a separate confidence in `providerMetadata.typesafe.confidence`. That statistic says how peaked the distribution is. The playground does not read it.

## The lines

Auto, escalate, and reject are sliders in the browser over the probabilities that already came back. Dragging them does not send another request. They are there so you can see a threshold policy as a thing your code would own, not as something the model decided. Schema ≠ truth: you wrote the options, and a high probability on one of them can still be the wrong queue. Calibration is what you would learn by running many labeled tickets, not by trusting this one.

Latency is the route's own clock, shown as a chip and as `{elapsed} — a chat reply usually takes seconds because it writes tokens.` Under a second the elapsed is milliseconds, the same formatter as the chip. The sentence appears only after a result that includes that clock. The two coach lines are “Context in. Probabilities out. No tokens generated.” and “A high score can still be the wrong queue — same honesty as Likely ≠ true.” The header chip still says Schema ≠ truth. Cost is the gateway's reported cost when the response includes one, otherwise the published list price for Jev ($0.042 per 1M input tokens; output tokens are not charged), labelled as a list price.

## What this route is not

`experimental_evaluate` is the app path. Do not point the Decision tab at an OpenAI-compatible chat completions URL. Do not invent `POST …/v1/evaluate`.

TypeSafe's REST, if you are calling it from ops tooling rather than from this app, is `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone`.
