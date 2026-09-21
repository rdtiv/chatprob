// The three coach-mark sentences, kept in one place so the "?" affordances
// that stay reachable after a coach mark is dismissed (legend strip, tab
// strip, cost summary) show the exact same wording as the mark itself.
export const COACH_TEXT_COLOR = "Color is the odds of the word that actually landed. A red word isn't confusion — the model rolled a long shot and kept going. Hover any word to see what else it weighed.";
export const COACH_TEXT_TABS = 'This prompt was answered 3 times — try tab 2.';
export const COACH_TEXT_COST = 'Every request re-sends the whole chat. Watch the pale part grow.';

// Decision tab. Same honesty as "Likely ≠ true": a probability is not a fact,
// and one call is not a calibration.
export const DECISION_COACH = [
  'No prose. This tab asks typed questions and gets probabilities back, not a paragraph.',
  'Schema ≠ truth. You wrote the options. A high bar on one of them can still be the wrong queue.',
  'Calibration is a record over many calls. One answer is a sample, the way Likely ≠ true.',
];
