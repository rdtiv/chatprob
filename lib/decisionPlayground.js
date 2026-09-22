// Client-side lines over one evaluate() result. Educational: moving a
// slider never calls the model again, and the lines are not a policy.

import { SEVERITY_MAX } from './triageFixture.js';

export const THRESHOLD_DEFAULTS = {
  departmentReject: 0.4,
  departmentAuto: 0.75,
  severityEscalate: 2,
  refundYes: 0.8,
};

// Full 0–1 on the probability lines, and one step past the top of the
// severity rubric. Jev often returns 0.99 / a max score; the playground has
// to be able to push that answer into auto, escalate, or reject.
export const THRESHOLD_BOUNDS = {
  departmentReject: [0, 1],
  departmentAuto: [0, 1],
  severityEscalate: [0, SEVERITY_MAX + 1],
  refundYes: [0.5, 1],
};

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function clampThresholds(input = {}) {
  const next = { ...THRESHOLD_DEFAULTS };
  for (const key of Object.keys(THRESHOLD_BOUNDS)) {
    const [min, max] = THRESHOLD_BOUNDS[key];
    next[key] = clampNumber(input[key], min, max, THRESHOLD_DEFAULTS[key]);
  }
  // Reject is checked first, so the two queue lines may cross. A reject
  // line above auto just means the middle band is empty.
  return next;
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function decideTriage(answers, thresholdsInput) {
  const thresholds = clampThresholds(thresholdsInput);
  const department = answers?.department;
  const severity = answers?.severity;
  const refund = answers?.requestsRefund;

  const choice = department?.type === 'choice' ? department.choice : null;
  const selectedProbability = choice != null
    ? finiteOrNull(department?.probabilities?.[choice])
    : null;
  const severityScore = severity?.type === 'score' ? finiteOrNull(severity.score) : null;
  const refundProbability = refund?.type === 'boolean' ? finiteOrNull(refund.probability) : null;

  const reasons = [];
  let action = 'auto';

  if (selectedProbability == null) {
    action = 'escalate';
    reasons.push('The department answer has no distribution, so this playground will not auto-route.');
  } else if (selectedProbability < thresholds.departmentReject) {
    action = 'reject';
    reasons.push('The picked queue is under the reject line, so this playground refuses to name one.');
  } else if (selectedProbability < thresholds.departmentAuto) {
    action = 'escalate';
    reasons.push('The picked queue is named, but it sits under the auto line.');
  }

  if (action !== 'reject') {
    if (severityScore == null) {
      action = 'escalate';
      reasons.push('Severity has no score.');
    } else if (severityScore >= thresholds.severityEscalate) {
      action = 'escalate';
      reasons.push('Severity is at or above the escalate line.');
    }

    if (refundProbability == null) {
      action = 'escalate';
      reasons.push('Refund probability is missing.');
    } else {
      const clearNo = 1 - thresholds.refundYes;
      if (refundProbability > clearNo && refundProbability < thresholds.refundYes) {
        action = 'escalate';
        reasons.push('P(refund) sits between a clear no and a clear yes.');
      }
    }
  }

  if (action === 'auto') {
    reasons.push('Queue, severity, and refund intent all cleared the lines you set.');
  }

  return {
    action,
    reasons,
    thresholds,
    readings: {
      departmentChoice: choice,
      departmentProbability: selectedProbability,
      severityScore,
      refundProbability,
    },
  };
}

// Same lines as decideTriage, for a situation whose question ids are not
// the support triad. A missing score question is skipped, not treated as
// a missing score. Each boolean uses the one clear-yes line.
export function decideShaped(answers, thresholdsInput, playground) {
  const thresholds = clampThresholds(thresholdsInput);
  const choiceAnswer = answers?.[playground.choiceId];
  const choice = choiceAnswer?.type === 'choice' ? choiceAnswer.choice : null;
  const selectedProbability = choice != null
    ? finiteOrNull(choiceAnswer?.probabilities?.[choice])
    : null;

  const reasons = [];
  let action = 'auto';

  if (selectedProbability == null) {
    action = 'escalate';
    reasons.push(playground.missingChoice);
  } else if (selectedProbability < thresholds.departmentReject) {
    action = 'reject';
    reasons.push(playground.lowChoice);
  } else if (selectedProbability < thresholds.departmentAuto) {
    action = 'escalate';
    reasons.push(playground.midChoice);
  }

  let severityScore = null;
  if (action !== 'reject' && playground.scoreId) {
    const severity = answers?.[playground.scoreId];
    severityScore = severity?.type === 'score' ? finiteOrNull(severity.score) : null;
    if (severityScore == null) {
      action = 'escalate';
      reasons.push(playground.missingScore);
    } else if (severityScore >= thresholds.severityEscalate) {
      action = 'escalate';
      reasons.push(playground.highScore);
    }
  }

  const booleanReadings = {};
  if (action !== 'reject') {
    const clearNo = 1 - thresholds.refundYes;
    for (const item of playground.booleans) {
      const answer = answers?.[item.id];
      const probability = answer?.type === 'boolean' ? finiteOrNull(answer.probability) : null;
      booleanReadings[item.id] = probability;
      if (probability == null) {
        action = 'escalate';
        reasons.push(item.missing);
      } else if (probability > clearNo && probability < thresholds.refundYes) {
        action = 'escalate';
        reasons.push(item.gap);
      }
    }
  }

  if (action === 'auto') reasons.push(playground.autoReason);

  return {
    action,
    reasons,
    thresholds,
    readings: {
      choice,
      choiceProbability: selectedProbability,
      severityScore,
      booleans: booleanReadings,
    },
  };
}

export function decideForScenario(scenario, answers, thresholdsInput) {
  if (scenario?.judge === 'shaped') {
    return decideShaped(answers, thresholdsInput, scenario.playground);
  }
  return decideTriage(answers, thresholdsInput);
}

export function answerRows(question, answer) {
  if (!question || !answer) return [];
  if (answer.type === 'choice' && question.criteria && !Array.isArray(question.criteria)) {
    return Object.keys(question.criteria).map((key) => ({
      key,
      label: String(question.criteria[key] ?? key),
      probability: finiteOrNull(answer.probabilities?.[key]),
      selected: answer.choice === key,
    }));
  }
  if (answer.type === 'score' && Array.isArray(question.criteria)) {
    return question.criteria.map((label, index) => ({
      key: String(index),
      label: String(label),
      probability: finiteOrNull(answer.probabilities?.[String(index)] ?? answer.probabilities?.[index]),
      selected: false,
    }));
  }
  return [];
}

export function scoreCaption(score, levels) {
  if (!Number.isFinite(score) || !Array.isArray(levels) || levels.length === 0) return null;
  const max = levels.length - 1;
  const clamped = Math.min(max, Math.max(0, score));
  const lo = Math.floor(clamped);
  const hi = Math.ceil(clamped);
  if (lo === hi) return String(levels[lo]);
  return `Between “${levels[lo]}” and “${levels[hi]}”.`;
}

export function formatPercent(probability) {
  if (!Number.isFinite(probability)) return '—';
  return `${(probability * 100).toFixed(1)}%`;
}

export function formatElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// Shown only after a judgment, beside the timing chip. Same clock as
// formatElapsed: milliseconds under a second, seconds from there up.
export function speedVersusLlm(elapsedMs) {
  const shown = formatElapsed(elapsedMs);
  if (!shown) return null;
  return `${shown} — a chat reply usually takes seconds because it writes tokens.`;
}
