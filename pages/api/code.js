import { runCannedFromRequest } from '../../lib/codeAnalysis/runCanned';

export const config = {
  maxDuration: 10,
};

// Code tab, phase 1. A dataset id selects a fixed function over a fixed
// CSV. This route does not call a model and does not evaluate a string.

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const outcome = runCannedFromRequest(req.body);
  return res.status(outcome.status).json(outcome.body);
}
