// Fixture registry. The page does not call `analyze`. Those functions
// stay so tests can still lock the planted counts in the CSVs.
// Cards and constant names live in lib/codeDatasets.js.

import { CODE_DATASETS as CARDS, getDataset as getCard } from '../codeDatasets.js';
import { analyzeSupportWeeks } from './supportWeeks.js';
import { analyzeCancelCohorts } from './cancelCohorts.js';
import { analyzeRmaLog } from './rmaLog.js';
import { analyzeWeatherHistory } from './weatherHistory.js';

const ANALYZE = {
  'support-weeks': analyzeSupportWeeks,
  'cancel-cohorts': analyzeCancelCohorts,
  'rma-log': analyzeRmaLog,
  'weather-history': analyzeWeatherHistory,
};

export const CODE_DATASETS = CARDS.map((card) => ({
  ...card,
  analyze: ANALYZE[card.id],
}));

export function getDataset(id) {
  const card = getCard(id);
  if (!card) return null;
  return CODE_DATASETS.find((dataset) => dataset.id === card.id) ?? null;
}
