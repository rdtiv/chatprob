import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCodeEvent, readCodeStream, reduceCodeEvents, visibleTypeScript } from './codeStream.js';

const blank = {
  typescript: '',
  markdown: '',
  error: '',
  output: null,
  live: true,
  livePhase: 'code',
};

test('visible TypeScript grows inside an open fence and settles when it closes', () => {
  assert.equal(visibleTypeScript('```ts\nfunction analyze() {'), 'function analyze() {');
  assert.equal(
    visibleTypeScript('```ts\nfunction analyze() {\n  return { tickets: 200 };\n}\n```'),
    'function analyze() {\n  return { tickets: 200 };\n}',
  );
});

test('the client applies code, running, result, markdown, then done', () => {
  const turn = reduceCodeEvents(blank, [
    { type: 'code', text: '```ts\nfunction ' },
    { type: 'code', text: 'analyze() {}\n```' },
    { type: 'running' },
    { type: 'result', ok: true, output: { tickets: 200 } },
    { type: 'markdown', text: 'There were 99999' },
    { type: 'markdown', text: '| Tickets | 200 |', replace: true },
    { type: 'done', markdownSource: 'run' },
  ]);
  assert.equal(turn.typescript.includes('function analyze'), true);
  assert.equal(turn.output.tickets, 200);
  assert.equal(turn.markdown.includes('99999'), false);
  assert.match(turn.markdown, /200/);
  assert.equal(turn.live, false);
  assert.equal(turn.livePhase, 'done');
  assert.equal(turn.markdownSource, 'run');
});

test('an error event ends the live turn', () => {
  const turn = applyCodeEvent(blank, { type: 'error', message: 'The model did not answer. Try again.' });
  assert.equal(turn.live, false);
  assert.equal(turn.error, 'The model did not answer. Try again.');
});

function ndjson(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

test('a split NDJSON line is still one event, in order', async () => {
  const events = [];
  await readCodeStream(ndjson([
    '{"type":"code","text":"fun',
    'ction"}\n{"type":"running"}\n{"type":"result","ok":true,"output":{"tickets":200}}\n',
    '{"type":"markdown","text":"200"}\n{"type":"done","markdownSource":"model"}',
  ]), (event) => events.push(event));
  assert.deepEqual(events.map((event) => event.type), ['code', 'running', 'result', 'markdown', 'done']);
  assert.equal(events[0].text, 'function');
  assert.equal(events[2].output.tickets, 200);
  const turn = reduceCodeEvents(blank, events);
  assert.equal(turn.markdown, '200');
  assert.equal(turn.markdownSource, 'model');
});

test('abort stops the reader before later events', async () => {
  const controller = new AbortController();
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(stream) {
      stream.enqueue(encoder.encode('{"type":"code","text":"a"}\n'));
    },
  });
  const events = [];
  await readCodeStream(body, (event) => {
    events.push(event);
    controller.abort();
  }, controller.signal);
  assert.deepEqual(events.map((event) => event.type), ['code']);
});
