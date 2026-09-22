// The three coach-mark sentences, kept in one place so the "?" affordances
// that stay reachable after a coach mark is dismissed (legend strip, tab
// strip, cost summary) show the exact same wording as the mark itself.
export const COACH_TEXT_COLOR = "Color is the odds of the word that actually landed. A red word isn't confusion — the model rolled a long shot and kept going. Hover any word to see what else it weighed.";
export const COACH_TEXT_TABS = 'This prompt was answered 3 times — try tab 2.';
export const COACH_TEXT_COST = 'Every request re-sends the whole chat. Watch the pale part grow.';

// One line under the tabs, on every mode. Dan locked the triplet.
export const MODE_SUBTITLE = 'Generate token by token. Evaluate a situation. Analyze a table.';

// Evaluate tab. The header chip says "Scores ≠ answers".
export const DECISION_COACH = [
  'Context in. Probabilities out. No tokens generated.',
  'A high score can still be the wrong queue — same honesty as Likely ≠ true.',
];

// Static teaching line under the boolean card. It does not change with P(true).
export const DECISION_BOOLEAN_NOTE =
  'P(true) only — low is a clear no; high is a clear yes.';

// Analyze tab. The header chip says "Numbers ≠ narrative".
export const CODE_HONESTY = 'Numbers ≠ narrative';

export const CODE_COACH = [
  'You ask. The model writes the counting code. This page runs it on the saved table.',
  'The counts come from that run. The write-up can still tell the wrong story — same honesty as Likely ≠ true.',
];
