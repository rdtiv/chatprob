import test from 'node:test';
import assert from 'node:assert/strict';
import { runInSandbox } from './codeSandbox.js';

const rows = [
  { week: 1, queue: 'billing', tickets: 40 },
  { week: 8, queue: 'billing', tickets: 160 },
];

test('the sandbox counts the saved rows and ignores host files', () => {
  const outcome = runInSandbox(`
    function analyze(): { tickets: number } {
      const billing = supportWeeks.filter((row: { queue: string }) => row.queue === 'billing');
      return { tickets: billing.reduce((sum, row) => sum + row.tickets, 0) };
    }
  `, { constantName: 'supportWeeks', rows });
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.value, { tickets: 200 });
  assert.deepEqual(rows.map((row) => row.tickets), [40, 160]);
});

test('the sandbox rejects the disk and the network', () => {
  const disk = runInSandbox(
    "function analyze(){ return require('fs').readFileSync('/etc/passwd','utf8'); }",
    { constantName: 'supportWeeks', rows },
  );
  assert.equal(disk.ok, false);
  assert.match(disk.error, /network or the disk/);
  assert.equal(disk.error.includes('root:'), false);

  const network = runInSandbox(
    "function analyze(){ return fetch('https://example.com'); }",
    { constantName: 'supportWeeks', rows },
  );
  assert.equal(network.ok, false);
  assert.match(network.error, /network or the disk/);

  const process = runInSandbox(
    'function analyze(){ return process.env; }',
    { constantName: 'supportWeeks', rows },
  );
  assert.equal(process.ok, false);
  assert.match(process.error, /network or the disk|does not run/);
});

test('a constructor escape cannot read the host', () => {
  const named = runInSandbox(
    "function analyze(){ return supportWeeks.constructor.constructor('return process.env')(); }",
    { constantName: 'supportWeeks', rows, timeoutMs: 500 },
  );
  assert.equal(named.ok, false);
  assert.equal(JSON.stringify(named).includes('OPENAI'), false);
  assert.equal(JSON.stringify(named).includes('HOME='), false);

  // The word filter does not see this one. The vm still refuses to build code.
  const built = runInSandbox(
    "function analyze(){ return supportWeeks.constructor.constructor('return 1')(); }",
    { constantName: 'supportWeeks', rows, timeoutMs: 500 },
  );
  assert.equal(built.ok, false);
  assert.match(built.error, /build new code/);
  assert.equal(JSON.stringify(built).includes('OPENAI'), false);
});

test('a loop stops instead of hanging', () => {
  const outcome = runInSandbox(
    'function analyze(){ while (true) {} }',
    { constantName: 'supportWeeks', rows, timeoutMs: 200 },
  );
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /too long/);
});
