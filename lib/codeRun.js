// One Code-tab turn. The browser may send a dataset id, a question, and
// earlier turns. It may not send rows. The model writes TypeScript. The
// sandbox runs it on the saved table. The markdown is allowed to use
// only numbers that run returned.

import { getDataset } from './codeDatasets.js';
import { loadTable } from './codeAnalysis/loadTables.js';
import { extractTypeScript, runInSandbox } from './codeSandbox.js';
import { buildNarrativeMessages, markdownFromRun } from './codeMarkdown.js';

export const UNKNOWN_DATASET_ERROR = 'That table is not on this page.';

export const ROWS_REJECTED_ERROR = 'The table stays on the server. Send the question, not the rows.';

export const QUESTION_ERROR = 'Ask about this table in a sentence or two.';

const ALLOWED_KEYS = new Set(['datasetId', 'message', 'history']);
const MAX_MESSAGE = 2000;
const MAX_HISTORY = 8;
const MAX_HISTORY_TEXT = 4000;

export const CODE_SYSTEM = [
  'You write one TypeScript function for a teaching page.',
  'A constant array is already in scope. Do not import it, fetch, read files, or use the network.',
  'Do not mention process, require, fetch, or fs, even in a comment.',
  'Each object is one row. Cells are strings, so convert with Number before you add or compare.',
  'Neighboring rows are not a time series. Group by the fields the question needs, then compare those groups.',
  'A follow-up is still those same rows. Use only the listed fields. Earlier JSON is a previous count, not a new column.',
  'Count from that constant. Do not paste totals you did not count.',
  'Return the groups you counted, not only a single winner.',
  'Write lightly commented TypeScript in one fenced ts block:',
  'function analyze(): Record<string, unknown> {',
  '  return { /* numbers, strings, arrays, and plain objects */ };',
  '}',
  'The return value is plain JSON data. No functions and no class instances.',
].join('\n');

function shapeOf(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const first = list[0] && typeof list[0] === 'object' ? list[0] : null;
  const fields = first ? Object.keys(first) : [];
  return {
    rowCount: list.length,
    fields,
    sample: list.slice(0, 4),
  };
}

export function normalizeHistory(history) {
  if (history == null) return { ok: true, history: [] };
  if (!Array.isArray(history)) return { ok: false, error: ROWS_REJECTED_ERROR };
  if (history.length > MAX_HISTORY) return { ok: false, error: 'That thread is too long. Reset and start again.' };
  const next = [];
  for (const item of history) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, error: ROWS_REJECTED_ERROR };
    if (item.role !== 'user' && item.role !== 'assistant') return { ok: false, error: ROWS_REJECTED_ERROR };
    if (typeof item.content !== 'string') return { ok: false, error: ROWS_REJECTED_ERROR };
    next.push({ role: item.role, content: item.content.slice(0, MAX_HISTORY_TEXT) });
  }
  return { ok: true, history: next };
}

export function resolveCodeRequest(body) {
  if (typeof body !== 'object' || body == null || Array.isArray(body)) {
    return { ok: false, error: ROWS_REJECTED_ERROR };
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false, error: ROWS_REJECTED_ERROR };
  }
  const dataset = getDataset(body.datasetId);
  if (!dataset) return { ok: false, error: UNKNOWN_DATASET_ERROR };
  if (typeof body.message !== 'string') return { ok: false, error: QUESTION_ERROR };
  const message = body.message.trim();
  if (!message || message.length > MAX_MESSAGE) return { ok: false, error: QUESTION_ERROR };
  const history = normalizeHistory(body.history);
  if (!history.ok) return history;
  return {
    ok: true,
    datasetId: dataset.id,
    constant: dataset.constant,
    message,
    history: history.history,
  };
}

export function buildCodeMessages({ constant, rows, message, history }) {
  const shape = shapeOf(rows);
  const brief = [
    `The constant \`${constant}\` is already in scope. It has ${shape.rowCount} objects.`,
    `Fields: ${shape.fields.join(', ') || 'unknown'}.`,
    `First rows, so you can see the grain: ${JSON.stringify(shape.sample)}`,
    `Question: ${message}`,
  ].join('\n');
  return [
    { role: 'system', content: `${CODE_SYSTEM}\nThe constant name is ${constant}.` },
    ...history,
    { role: 'user', content: brief },
  ];
}

export async function runCodeTurn(body, { complete, readTable = loadTable } = {}) {
  const resolved = resolveCodeRequest(body);
  if (!resolved.ok) return { status: 400, body: { error: resolved.error } };
  if (typeof complete !== 'function') {
    return { status: 500, body: { error: 'OPENAI_API_KEY is not set' } };
  }

  const table = readTable(resolved.datasetId);
  if (!table?.rows) return { status: 400, body: { error: UNKNOWN_DATASET_ERROR } };

  const codeReply = await complete(
    buildCodeMessages({
      constant: resolved.constant,
      rows: table.rows,
      message: resolved.message,
      history: resolved.history,
    }),
    1400,
  );
  const typescript = extractTypeScript(codeReply);
  if (!typescript) {
    return {
      status: 200,
      body: {
        datasetId: resolved.datasetId,
        constant: resolved.constant,
        typescript: null,
        sandbox: { ok: false, error: 'The model did not write a function named analyze.' },
        markdown: null,
      },
    };
  }

  const sandbox = runInSandbox(typescript, {
    constantName: resolved.constant,
    rows: table.rows,
  });
  if (!sandbox.ok) {
    return {
      status: 200,
      body: {
        datasetId: resolved.datasetId,
        constant: resolved.constant,
        typescript,
        sandbox: { ok: false, error: sandbox.error },
        markdown: null,
      },
    };
  }

  const narrativeReply = await complete(
    buildNarrativeMessages({ question: resolved.message, output: sandbox.value }),
    800,
  );
  const grounded = markdownFromRun(narrativeReply, sandbox.value);
  return {
    status: 200,
    body: {
      datasetId: resolved.datasetId,
      constant: resolved.constant,
      typescript,
      sandbox: { ok: true, output: sandbox.value },
      markdown: grounded.markdown,
      markdownSource: grounded.source,
    },
  };
}
