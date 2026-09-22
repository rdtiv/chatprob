// Fixture runner. A dataset id selects a fixed function over a fixed CSV.
// The page does not call this. Tests use it to lock the planted counts.
// Visitor strings are not evaluated. A body that carries code, a question
// list, or any field besides datasetId is refused.

import { getDataset } from './datasets.js';
import { loadTable } from './loadTables.js';

export const UNKNOWN_DATASET_ERROR = 'That table is not on this page.';

export const VISITOR_CODE_ERROR = 'This page runs a fixed check. It does not run code you send.';

export const CODE_BODY_ERROR = 'Send the table id only.';

export function rejectVisitorBody(body) {
  if (typeof body !== 'object' || body == null || Array.isArray(body)) {
    return { ok: false, error: CODE_BODY_ERROR };
  }
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'datasetId') {
    return { ok: false, error: VISITOR_CODE_ERROR };
  }
  if (typeof body.datasetId !== 'string') {
    return { ok: false, error: CODE_BODY_ERROR };
  }
  return { ok: true, datasetId: body.datasetId };
}

export function runCannedAnalysis(datasetId, rows) {
  const dataset = getDataset(datasetId);
  if (!dataset) return { ok: false, status: 400, error: UNKNOWN_DATASET_ERROR };
  const started = Date.now();
  const analysis = dataset.analyze(rows);
  return {
    ok: true,
    status: 200,
    body: {
      datasetId: dataset.id,
      questionId: dataset.questionId,
      question: dataset.question,
      title: dataset.title,
      punchline: analysis.punchline,
      lines: analysis.lines,
      facts: analysis.facts,
      timing: { elapsedMs: Date.now() - started },
      model: null,
    },
  };
}

export function runCannedFromRequest(body, root = process.cwd()) {
  const rejected = rejectVisitorBody(body);
  if (!rejected.ok) return { status: 400, body: { error: rejected.error } };
  const dataset = getDataset(rejected.datasetId);
  if (!dataset) return { status: 400, body: { error: UNKNOWN_DATASET_ERROR } };
  const table = loadTable(dataset.id, root);
  if (!table) return { status: 400, body: { error: UNKNOWN_DATASET_ERROR } };
  const outcome = runCannedAnalysis(dataset.id, table.rows);
  return { status: outcome.status, body: outcome.ok ? outcome.body : { error: outcome.error } };
}
