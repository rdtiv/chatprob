# Code

The third tab. Not a chat, and not a second copy of Decision.

**Decision** judges one inquiry: a ticket, a mail, or a question, with Choice, Score, and boolean probabilities from Jev. **Code** looks at a saved table from the same kind of work and counts what happened over time. It does not reuse those prompts.

## Phase 1

Phase 1 is the page that ships. Four cards, in the same order as Decision: support weeks, cancel cohorts, a return log, and stored weather. Each card has a title, a short blurb, and one coach line. Pick a card and it opens. **Run this check** posts only the table id to `POST /api/code`. The server runs a fixed function over a fixed CSV in `data/code/`. The same id always returns the same counts. There is no model call and no key.

The punchline under the counts is the lesson, not a trophy. **Reset** is two clicks, same as **Clear** and the Decision reset. It returns to the four cards and aborts a check that has not come back yet.

The header chip says **Numbers ≠ narrative**. The two lines on the tab are “A table in. A count out. No model in this step.” and “The numbers are the table’s. The story you tell about them can still be the wrong one — same honesty as Likely ≠ true.”

The tables are synthetic. No customer names. The functions live in `lib/codeAnalysis/` and are ordinary JavaScript. A request that sends anything besides the table id is a 400. Nothing on this tab evaluates a string.

The four checks:

1. **A busy support week.** Which week jumped, and which queue takes the longest to close? Week 8 is a billing jump. Technical tickets are the slow ones every week. Those are two stories.
2. **Who cancels, and when.** Which month do people leave, and does the new plan leave faster? Month 3 is the leak on both plans. The new plan is faster in every month on the table.
3. **Returns over twelve weeks.** What piled up, and did remakes and repeats move with it? Weeks 7–9 pile up on adhesive and clip. Remake’s share climbs. Repeats are common in that pile and rare in the rest of the log.
4. **Weather we already stored.** What was the weather lately — and what is it right now? The file remembers a hot stretch and a mild last day. It does not know right now. Stored history and a live look are different questions.

## Phase 2

Phase 2 is not built. A follow-up question would be new code, written as TypeScript for that same table and run in a sandbox. This repo does not include that executor. The expanded card says so. Do not add `eval`, `new Function`, or a visitor-supplied script to `POST /api/code` to get there.
