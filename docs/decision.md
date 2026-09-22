# Decision

The other tab. Not a chat, and not a second copy of the LLM lesson.

**LLM** samples the next token and shows you the draw: logprobs, three replies, temperature. That path is `POST /api/chat`, OpenAI Chat Completions, and it stays off the AI Gateway and off Edge because those drop logprobs. It needs `OPENAI_API_KEY`.

**Decision** asks typed questions about one shared state and gets probabilities back. There is no prose. The model is Jev, TypeSafe's System One model, called as `typesafe-ai/jev` through the AI SDK's `experimental_evaluate` in `POST /api/evaluate`. It needs `AI_GATEWAY_API_KEY`, or Gateway OIDC when Vercel already injects a token. A missing key is an error after Run. It does not take down the LLM tab, and it is not a line on the tab when the key is present.

## Four situations

Decision opens on four cards. Nothing is expanded until you pick one. The card fades open into the text you are about to judge. **Run this judgment** posts that text as `state` plus the situation id. While the judgment is in flight the text and the lines are locked. When the probabilities land, the text stays read-only for a moment, then you can edit it. **Reset**, top-right, is two clicks like **Clear**. It returns to the four cards, restores the default lines, and aborts a judgment that has not come back yet.

A body with no situation id and no `state` still judges the first card, the canned lockout ticket. A `state` that fails that situation’s shape check is a 400 and is not silently replaced. A body that includes `questions` is a 400. The question list is chosen on the server from the situation id, so the route is not an open proxy for a schema the browser sends.

After a judgment is on screen, the header adds a line about editing and running again. On a ticket that line is “Edit the subject or message, then run again.” On the plant mail it names the subject or body. On the weather question it names the question. Idle, loading, and Reset (no result) hide that line. It stays in the browser and is not part of `state`.

The cards, in order:

1. **Can’t get in.** Subject “Can’t sign in after password reset.” Password reset failed, a trip tomorrow, not asking for money back, family plan, three earlier tickets. Questions: queue (billing, technical, account, other), severity on a four-step rubric, and whether they asked for money back.
2. **Cancel my plan.** They say cancel unless streaming is fixed, and they might have been charged twice. Same three questions. The voice is mixed on purpose: pause, refund, or just mad.
3. **Parts came back.** Inbound mail, not a form. From `ops@customerco.example`, subject about last week’s shipment, body about parts back on the dock. No person and no customer name in that note. Questions: which desk (quality, sales-credit, ops-shipping, unclear), severity, whether this is a repeat return, and whether they want a credit rather than a remake.
4. **Should we call the tool?** The same Denver weather question as the LLM demo. Questions: does a fair answer need a live look, and is the next move memory, the tool, or a refusal.

Choice, score, and boolean are the three shapes. In TypeSafe's API the boolean primitive is called noul. The SDK names it `boolean`. The number is P(true): 0.98 is a strong yes, 0.02 is a strong no, 0.50 is a coin flip. It is not "confidence."

Choice and score may also carry a separate confidence in `providerMetadata.typesafe.confidence`. That statistic says how peaked the distribution is. The playground does not read it.

## The lines

Auto, escalate, and reject are sliders in the browser over the probabilities that already came back. Dragging them does not send another request. They are there so you can see a threshold policy as a thing your code would own, not as something the model decided. Schema ≠ truth: you wrote the options, and a high probability on one of them can still be the wrong queue. Calibration is what you would learn by running many labeled tickets, not by trusting this one.

Latency is the route's own clock, shown as a chip and as `{elapsed} — a chat reply usually takes seconds because it writes tokens.` Under a second the elapsed is milliseconds, the same formatter as the chip. The sentence appears only after a result that includes that clock. The two coach lines are “Context in. Probabilities out. No tokens generated.” and “A high score can still be the wrong queue — same honesty as Likely ≠ true.” The header chip still says Schema ≠ truth. Cost is the gateway's reported cost when the response includes one, otherwise the published list price for Jev ($0.042 per 1M input tokens; output tokens are not charged), labelled as a list price.

## What this route is not

`experimental_evaluate` is the app path. Do not point the Decision tab at an OpenAI-compatible chat completions URL. Do not invent `POST …/v1/evaluate`.

TypeSafe's REST, if you are calling it from ops tooling rather than from this app, is `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone`.
