import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CODE_DATASETS, PHASE_2_NOTE, getDataset } from './codeAnalysis/datasets.js';
import { loadTable, TABLE_FILES } from './codeAnalysis/loadTables.js';
import {
  rejectVisitorBody,
  runCannedAnalysis,
  runCannedFromRequest,
  UNKNOWN_DATASET_ERROR,
  VISITOR_CODE_ERROR,
} from './codeAnalysis/runCanned.js';
import { CODE_COACH, CODE_HONESTY } from './coachCopy.js';

const PLANTED = {
  'support-weeks': {
    questionId: 'billing-spike-slow-queue',
    question: 'Which week jumped, and which queue takes the longest to close?',
    punchline: 'Week 8 is a billing jump: 160 tickets, against 40 in every other week, and 48 refund asks against 6. Technical tickets are the slow ones every week — the slow end stays at 64 hours or more, and every other queue stays at 18 hours or less. The busy week and the slow queue are not the same story.',
    facts: {
      spikeWeek: 8,
      spikeQueue: 'billing',
      spikeTickets: 160,
      typicalBillingTickets: 40,
      spikeRefundAsks: 48,
      typicalBillingRefundAsks: 6,
      technicalHoursP95Min: 64,
      otherQueuesHoursP95Max: 18,
      technicalSlowestEveryWeek: true,
      weekCount: 12,
    },
  },
  'cancel-cohorts': {
    questionId: 'month-3-leak-new-plan',
    question: 'Which month do people leave, and does the new plan leave faster?',
    punchline: 'Month 3 is the leak. The classic plan loses 14% that month and 4% in the months beside it. The new plan loses 32% in month 3 — and it loses people faster in every month we can see, not only in that leak.',
    facts: {
      classicLeakMonth: 3,
      launchLeakMonth: 3,
      classicMonth3Percent: 14,
      classicBesidePercent: 4,
      launchMonth3Percent: 32,
      launchFasterEveryTenure: true,
      sharedTenureCount: 6,
    },
  },
  'rma-log': {
    questionId: 'adhesive-clip-cluster',
    question: 'What piled up in the return log, and did remakes and repeats move with it?',
    punchline: 'Weeks 7–9 pile up on adhesive and clip: 150 of 180 returns those weeks. Remake’s share climbs from 78 of 324 returns in the first six weeks to 180 of 330 in the last six. Inside that adhesive-and-clip pile, 108 of 150 had come back before. In the rest of the log, 27 of 504 had.',
    facts: {
      clusterStart: 7,
      clusterEnd: 9,
      clusterCount: 150,
      clusterWindowTotal: 180,
      remakeFirstSix: 78,
      totalFirstSix: 324,
      remakeLastSix: 180,
      totalLastSix: 330,
      remakeShareRises: true,
      clusterRepeats: 108,
      clusterTotal: 150,
      restRepeats: 27,
      restTotal: 504,
      repeatsOverIndex: true,
    },
  },
  'weather-history': {
    questionId: 'stored-is-not-live',
    question: 'What was the weather lately — and what is it right now?',
    punchline: 'This file is 90 stored days for Denver, through 18 Sep. It remembers a hot stretch from 20 Aug to 26 Aug, highs at 99°, and a mild last day at 71°. It does not know right now. A stored table and a live look are different questions.',
    facts: {
      days: 90,
      city: 'Denver',
      firstDate: '2026-06-21',
      lastDate: '2026-09-18',
      hotStart: '2026-08-20',
      hotEnd: '2026-08-26',
      hotDays: 7,
      hotHigh: 99,
      lastHigh: 71,
      lastConditions: 'mild',
      askedAsOf: '2026-09-22',
      staleDays: 4,
      answersRightNow: false,
    },
  },
};

test('code cards follow the decision domains and stay off choice, score, and boolean', () => {
  assert.deepEqual(CODE_DATASETS.map((dataset) => dataset.id), [
    'support-weeks',
    'cancel-cohorts',
    'rma-log',
    'weather-history',
  ]);
  assert.deepEqual(CODE_DATASETS.map((dataset) => dataset.title), [
    'A busy support week',
    'Who cancels, and when',
    'Returns over twelve weeks',
    'Weather we already stored',
  ]);
  assert.equal(CODE_DATASETS[0].blurb, 'Twelve weeks of queues, refund asks, and how long tickets took to close.');
  assert.equal(CODE_DATASETS[1].coach, 'A leak in month 3 and a faster new plan can both be true.');
  assert.equal(CODE_DATASETS[2].blurb.includes('remake'), true);
  assert.equal(CODE_DATASETS[3].coach, 'A saved weather file is history. It is not the sky right now.');
  assert.equal(getDataset('nope'), null);
  assert.equal(CODE_HONESTY, 'Numbers ≠ narrative');
  assert.equal(CODE_COACH.length, 2);
  assert.equal(PHASE_2_NOTE.includes('not on this page'), true);
  assert.equal(PHASE_2_NOTE.includes('Nothing you type is run.'), true);
  for (const dataset of CODE_DATASETS) {
    const blob = `${dataset.question} ${dataset.coach} ${dataset.blurb}`;
    assert.equal(/choice|score|boolean|noul/i.test(dataset.questionId), false);
    assert.equal(blob.includes('P(true)'), false);
    assert.equal(TABLE_FILES[dataset.id], dataset.file);
  }
});

test('planted punchlines come from the saved csv files', () => {
  for (const dataset of CODE_DATASETS) {
    const planted = PLANTED[dataset.id];
    const table = loadTable(dataset.id);
    assert.equal(/jamak/i.test(table.text), false);
    assert.equal(table.text.includes('@'), false);
    assert.equal(/customer/i.test(table.text), false);
    const outcome = runCannedAnalysis(dataset.id, table.rows);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.body.questionId, planted.questionId);
    assert.equal(outcome.body.question, planted.question);
    assert.equal(outcome.body.punchline, planted.punchline);
    assert.deepEqual(outcome.body.facts, planted.facts);
    assert.equal(outcome.body.model, null);
    assert.equal(outcome.body.lines.length > 0, true);
  }
});

test('a request may name a table and may not send code', () => {
  const ok = runCannedFromRequest({ datasetId: 'support-weeks' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.facts.spikeWeek, 8);
  assert.equal(ok.body.punchline, PLANTED['support-weeks'].punchline);

  assert.equal(runCannedFromRequest({ datasetId: 'missing' }).status, 400);
  assert.equal(runCannedFromRequest({ datasetId: 'missing' }).body.error, UNKNOWN_DATASET_ERROR);
  assert.equal(runCannedFromRequest({}).body.error, VISITOR_CODE_ERROR);
  assert.equal(runCannedFromRequest({ datasetId: 'support-weeks', code: '1+1' }).body.error, VISITOR_CODE_ERROR);
  assert.equal(runCannedFromRequest({ datasetId: 'support-weeks', questions: [] }).body.error, VISITOR_CODE_ERROR);
  assert.equal(rejectVisitorBody(null).ok, false);
  assert.equal(rejectVisitorBody(['support-weeks']).ok, false);
});

test('the canned runner does not evaluate visitor strings', () => {
  const source = [
    'lib/codeAnalysis/runCanned.js',
    'lib/codeAnalysis/supportWeeks.js',
    'lib/codeAnalysis/cancelCohorts.js',
    'lib/codeAnalysis/rmaLog.js',
    'lib/codeAnalysis/weatherHistory.js',
    'pages/api/code.js',
  ].map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.equal(source.includes('eval('), false);
  assert.equal(source.includes('new Function'), false);
  assert.equal(source.includes('experimental_evaluate'), false);
});
