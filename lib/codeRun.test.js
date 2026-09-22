import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildCodeMessages,
  resolveCodeRequest,
  runCodeTurn,
  streamCodeTurn,
  ROWS_REJECTED_ERROR,
} from './codeRun.js';
import { historyFromTurns, noteFollowUp, pickDataset, initialCodeSession } from './codeSession.js';

const rows = [
  { week: 1, queue: 'billing', tickets: 40 },
  { week: 8, queue: 'billing', tickets: 160 },
];

test('the model is shown the grain, not the whole table', () => {
  const many = Array.from({ length: 6 }, (_, index) => ({
    week: index + 1,
    queue: 'billing',
    tickets: 10,
  }));
  const messages = buildCodeMessages({
    constant: 'supportWeeks',
    rows: many,
    message: 'Which week jumped?',
    history: [],
  });
  const brief = messages.at(-1).content;
  assert.match(brief, /6 objects/);
  assert.match(messages[0].content, /Neighboring rows are not a time series/);
  assert.match(messages[0].content, /Earlier JSON is a previous count/);
  assert.match(brief, /First rows/);
  assert.match(brief, /"week":1/);
  assert.equal(brief.includes('"week":6'), false);
});

test('a client cannot replace the saved table', () => {
  assert.equal(resolveCodeRequest({ datasetId: 'support-weeks', message: 'Count', rows }).error, ROWS_REJECTED_ERROR);
  assert.equal(resolveCodeRequest({ datasetId: 'support-weeks', message: 'Count', schema: [] }).error, ROWS_REJECTED_ERROR);
  assert.equal(resolveCodeRequest({ datasetId: 'support-weeks', message: 'Count', code: '1' }).error, ROWS_REJECTED_ERROR);
  assert.equal(resolveCodeRequest({ datasetId: 'missing', message: 'Count' }).ok, false);
  const ok = resolveCodeRequest({ datasetId: 'rma-log', message: 'What piled up?' });
  assert.equal(ok.ok, true);
  assert.equal(ok.constant, 'rmaLog');
});

test('markdown is built from the sandbox output, not an invented count', async () => {
  const calls = [];
  const complete = async (messages) => {
    calls.push(messages);
    if (calls.length === 1) {
      return '```ts\nfunction analyze() {\n  const tickets = supportWeeks.reduce((sum, row) => sum + row.tickets, 0);\n  return { tickets };\n}\n```';
    }
    return 'There were 99999 tickets in week 8.';
  };
  const outcome = await runCodeTurn(
    { datasetId: 'support-weeks', message: 'How many tickets are in the table?' },
    { complete, readTable: () => ({ rows }) },
  );
  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body.sandbox.output, { tickets: 200 });
  assert.equal(outcome.body.markdown.includes('99999'), false);
  assert.match(outcome.body.markdown, /200/);
  assert.equal(outcome.body.markdownSource, 'run');
  const narrative = calls[1].find((message) => message.role === 'user').content;
  assert.match(narrative, /"tickets":200/);
  assert.equal(narrative.includes('99999'), false);
  assert.equal(outcome.body.typescript.includes('function analyze'), true);
});

test('a grounded model note is kept when every number came from the run', async () => {
  const complete = async (messages) => {
    if (messages[0].content.includes('You write one TypeScript')) {
      return '```ts\nfunction analyze(){ return { tickets: supportWeeks.length }; }\n```';
    }
    return 'The table has 2 rows.\n\n| What | Count |\n| --- | --- |\n| Tickets | 2 |';
  };
  const outcome = await runCodeTurn(
    { datasetId: 'support-weeks', message: 'How many rows?' },
    { complete, readTable: () => ({ rows }) },
  );
  assert.equal(outcome.body.markdownSource, 'model');
  assert.match(outcome.body.markdown, /2/);
  assert.equal(outcome.body.sandbox.output.tickets, 2);
});

test('a follow-up history stays on the same dataset id', () => {
  const session = pickDataset(initialCodeSession(), 'cancel-cohorts');
  const withTurn = {
    ...session,
    turns: [{ user: 'Which month?', output: { month: 3 }, error: '' }],
  };
  const follow = noteFollowUp(withTurn, 'cancel-cohorts');
  assert.equal(follow.ok, true);
  assert.equal(follow.session.datasetId, 'cancel-cohorts');
  const switched = noteFollowUp(withTurn, 'weather-history');
  assert.equal(switched.ok, false);
  assert.equal(withTurn.datasetId, 'cancel-cohorts');
  const history = historyFromTurns(withTurn.turns);
  assert.match(history[1].content, /"month":3/);
  assert.equal(JSON.stringify(history).includes('weatherHistory'), false);
});

test('the code route calls OpenAI directly and does not take rows', () => {
  const source = readFileSync('pages/api/code.js', 'utf8');
  assert.match(source, /from 'openai'/);
  assert.match(source, /OPENAI_API_KEY/);
  assert.match(source, /OPENAI_BASE_URL/);
  assert.match(source, /stream:\s*true/);
  assert.match(source, /application\/x-ndjson/);
  assert.equal(source.includes('experimental_evaluate'), false);
  assert.equal(source.includes('runCanned'), false);
  assert.equal(source.includes('eval('), false);
  assert.equal(source.includes('new Function'), false);
  assert.equal(source.includes('ai-gateway'), false);
});

const ANALYZE = [
  '```ts',
  'function analyze() {',
  '  return { tickets: supportWeeks.reduce((sum, row) => sum + Number(row.tickets), 0) };',
  '}',
  '```',
].join('\n');

function readSupportWeeks() {
  return { rows };
}

async function* twoPieces(text) {
  const mid = Math.max(1, Math.floor(text.length / 2));
  yield text.slice(0, mid);
  yield text.slice(mid);
}

test('stream events run code, then the sandbox, then the write-up', async () => {
  const events = [];
  const outcome = await streamCodeTurn(
    { datasetId: 'support-weeks', message: 'How many tickets are in the table?' },
    {
      readTable: readSupportWeeks,
      emit: (event) => events.push(event),
      async *streamText(messages) {
        const writingCode = messages[0].content.includes('You write one TypeScript');
        yield* twoPieces(writingCode ? ANALYZE : 'The run counted 200 tickets.');
      },
    },
  );
  assert.equal(outcome.status, 200);
  assert.equal(outcome.aborted, undefined);
  const types = events.map((event) => event.type);
  const first = (type) => types.indexOf(type);
  assert.ok(first('code') >= 0);
  assert.ok(first('code') < first('running'));
  assert.ok(first('running') < first('result'));
  assert.ok(first('result') < first('markdown'));
  assert.ok(first('markdown') < types.lastIndexOf('done'));
  assert.equal(events.filter((event) => event.type === 'code').length, 2);
  assert.equal(events.find((event) => event.type === 'result').output.tickets, 200);
  assert.equal(events.at(-1), events.find((event) => event.type === 'done'));
  assert.equal(events.at(-1).markdownSource, 'model');
  assert.equal(types.includes('error'), false);
});

test('an invented count is replaced before the stream ends', async () => {
  const events = [];
  await streamCodeTurn(
    { datasetId: 'support-weeks', message: 'How many tickets are in the table?' },
    {
      readTable: readSupportWeeks,
      emit: (event) => events.push(event),
      async *streamText(messages) {
        if (messages[0].content.includes('You write one TypeScript')) {
          yield* twoPieces(ANALYZE);
          return;
        }
        yield 'There were ';
        yield '99999 tickets.';
      },
    },
  );
  const replaceAt = events.findIndex((event) => event.replace);
  const doneAt = events.findIndex((event) => event.type === 'done');
  assert.ok(replaceAt >= 0 && replaceAt < doneAt);
  assert.equal(events[replaceAt].text.includes('99999'), false);
  assert.match(events[replaceAt].text, /200/);
  assert.equal(events[doneAt].markdownSource, 'run');
});

test('abort during the code stream sends no sandbox result', async () => {
  const controller = new AbortController();
  const events = [];
  const outcome = await streamCodeTurn(
    { datasetId: 'support-weeks', message: 'How many tickets are in the table?' },
    {
      signal: controller.signal,
      readTable: readSupportWeeks,
      emit: (event) => events.push(event),
      async *streamText() {
        yield '```ts\nfunction analyze() {\n';
        controller.abort();
      },
    },
  );
  assert.equal(outcome.status, 200);
  assert.equal(outcome.aborted, true);
  assert.deepEqual(events.map((event) => event.type), ['code']);
  const folded = await runCodeTurn(
    { datasetId: 'support-weeks', message: 'How many tickets are in the table?' },
    {
      signal: AbortSignal.abort(),
      readTable: readSupportWeeks,
      async *streamText() {
        yield ANALYZE;
      },
    },
  );
  assert.deepEqual(folded.body, { aborted: true });
});

test('abort during the write-up sends no done event', async () => {
  const controller = new AbortController();
  const events = [];
  const outcome = await streamCodeTurn(
    { datasetId: 'support-weeks', message: 'How many tickets are in the table?' },
    {
      signal: controller.signal,
      readTable: readSupportWeeks,
      emit: (event) => events.push(event),
      async *streamText(messages) {
        if (messages[0].content.includes('You write one TypeScript')) {
          yield ANALYZE;
          return;
        }
        yield 'The run counted ';
        controller.abort();
        yield '200 tickets.';
      },
    },
  );
  assert.equal(outcome.aborted, true);
  const types = events.map((event) => event.type);
  assert.equal(types.includes('running'), true);
  assert.equal(types.includes('result'), true);
  assert.equal(types.includes('markdown'), true);
  assert.equal(types.includes('done'), false);
  assert.equal(types.at(-1), 'markdown');
});

test('an AbortError from the model stops the turn without a done event', async () => {
  const events = [];
  const outcome = await streamCodeTurn(
    { datasetId: 'support-weeks', message: 'How many tickets are in the table?' },
    {
      readTable: readSupportWeeks,
      emit: (event) => events.push(event),
      async *streamText() {
        yield '```ts\n';
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      },
    },
  );
  assert.equal(outcome.aborted, true);
  assert.deepEqual(events.map((event) => event.type), ['code']);
});
