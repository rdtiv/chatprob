import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsv } from './parseCsv.js';

// Fixed files. The browser never picks a path; the id is an allowlist key.
export const TABLE_FILES = {
  'support-weeks': 'support-weeks.csv',
  'cancel-cohorts': 'cancel-cohorts.csv',
  'rma-log': 'rma-log.csv',
  'weather-history': 'weather-history.csv',
};

export function tablePath(datasetId, root = process.cwd()) {
  const file = TABLE_FILES[datasetId];
  if (!file) return null;
  return path.join(root, 'data', 'code', file);
}

export function loadTable(datasetId, root = process.cwd()) {
  const filePath = tablePath(datasetId, root);
  if (!filePath) return null;
  const text = readFileSync(filePath, 'utf8');
  return { text, rows: parseCsv(text) };
}
