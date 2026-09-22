// Four Code tables, in the same order as the Decision cards:
// support, cancel, returns, weather. Each card has one canned question.
// The question is not a Choice, Score, or boolean prompt.

import { analyzeSupportWeeks } from './supportWeeks.js';
import { analyzeCancelCohorts } from './cancelCohorts.js';
import { analyzeRmaLog } from './rmaLog.js';
import { analyzeWeatherHistory } from './weatherHistory.js';

export const PHASE_2_NOTE = 'A follow-up would be new code on this same table. That step is not on this page. Nothing you type is run.';

export const CODE_DATASETS = [
  {
    id: 'support-weeks',
    title: 'A busy support week',
    blurb: 'Twelve weeks of queues, refund asks, and how long tickets took to close.',
    coach: 'A busy week and a slow queue can be two different stories.',
    questionId: 'billing-spike-slow-queue',
    question: 'Which week jumped, and which queue takes the longest to close?',
    tableLine: 'Saved table: one row per week and queue.',
    file: 'support-weeks.csv',
    analyze: analyzeSupportWeeks,
  },
  {
    id: 'cancel-cohorts',
    title: 'Who cancels, and when',
    blurb: 'Monthly cohorts for the classic plan and the newer one, by how long people had stayed.',
    coach: 'A leak in month 3 and a faster new plan can both be true.',
    questionId: 'month-3-leak-new-plan',
    question: 'Which month do people leave, and does the new plan leave faster?',
    tableLine: 'Saved table: cohort, plan, month of tenure, who started, who canceled.',
    file: 'cancel-cohorts.csv',
    analyze: analyzeCancelCohorts,
  },
  {
    id: 'rma-log',
    title: 'Returns over twelve weeks',
    blurb: 'A return log: which part, a remake or a credit, and whether it had come back before.',
    coach: 'A three-week pile-up can sit next to a remake shift and a repeat pattern.',
    questionId: 'adhesive-clip-cluster',
    question: 'What piled up in the return log, and did remakes and repeats move with it?',
    tableLine: 'Saved table: twelve weeks of returns, grouped by part.',
    file: 'rma-log.csv',
    analyze: analyzeRmaLog,
  },
  {
    id: 'weather-history',
    title: 'Weather we already stored',
    blurb: 'About ninety days of saved Denver weather. Not a live look.',
    coach: 'A saved weather file is history. It is not the sky right now.',
    questionId: 'stored-is-not-live',
    question: 'What was the weather lately — and what is it right now?',
    tableLine: 'Saved table: one row per day. No live reading.',
    file: 'weather-history.csv',
    analyze: analyzeWeatherHistory,
  },
];

const BY_ID = new Map(CODE_DATASETS.map((dataset) => [dataset.id, dataset]));

export function getDataset(id) {
  if (typeof id !== 'string') return null;
  return BY_ID.get(id) ?? null;
}
