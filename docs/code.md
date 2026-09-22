# Code

The third tab. Not a second copy of Decision, and not the LLM chat.

**Decision** judges one inquiry: a ticket, a mail, or a question, with Choice, Score, and boolean probabilities from Jev. **Code** looks at a saved table from the same kind of work. You ask what to count. The model writes TypeScript. This page runs that code on the saved table and writes the result back as markdown.

## The four tables

Four cards, in the same order as Decision. Each card has a title, a short blurb, and one coach line. The rows are synthetic constants in `data/code/`. No customer names. The visitor does not upload a table, and a request cannot replace the rows.

| Card | Constant | Suggested first ask |
| --- | --- | --- |
| A busy support week | `supportWeeks` | Which week jumped, and which queue takes the longest to close? |
| Who cancels, and when | `cancelCohorts` | Which month do people leave, and does the new plan leave faster? |
| Returns over twelve weeks | `rmaLog` | What piled up in the return log, and did remakes and repeats move with it? |
| Weather we already stored | `weatherHistory` | What was the weather lately — and what is it right now? |

Picking a card fills the box with that question. You can edit it. **Ask** sends the table id, the question, and earlier turns on that same table. It does not send the rows.

## What one ask does

`POST /api/code` uses the same stack as the LLM tab: the `openai` package, `OPENAI_API_KEY`, and `OPENAI_BASE_URL` when that is set. It is not the AI Gateway and not Jev. The model is `OPENAI_MODEL` or `gpt-4o-mini`.

1. The server loads the named constant for that id. A body that includes rows, a schema, or code is a 400.
2. The model is asked to write one TypeScript function, `analyze`, that reads only that constant.
3. The page shows that TypeScript.
4. A sandbox runs it. The timeout is one second. There is no network and no disk. `eval` and building functions from strings are off. The table is parsed inside the sandbox, so the code cannot reach back into the server through a row object. The only value that comes back is the JSON from `analyze`.
5. A second model call writes short markdown from that JSON. Every number in the write-up has to appear in the JSON. If the draft invents a count, the page throws the draft away and builds a table from the run instead.
6. If the code cannot run, the page shows the TypeScript and a short teaching line. It does not crash.

A follow-up stays on the same table. The next call sees the earlier question and the JSON the sandbox returned. **Reset** is two clicks, same as the LLM tab and the Decision tab. It returns to the four cards and clears the thread.

The header chip says **Numbers ≠ narrative**. The two lines on the tab are “You ask. The model writes the counting code. This page runs it on the saved table.” and “The counts come from that run. The write-up can still tell the wrong story — same honesty as Likely ≠ true.”

## Fixtures

`lib/codeAnalysis/` still has a fixed function per table. Tests use those to lock the planted counts in the CSVs: the billing jump in week 8, the month-3 leak, the adhesive-and-clip pile in weeks 7–9, and a stored Denver file that does not know right now. The page does not call them. The lesson on screen comes from the sandbox run.
