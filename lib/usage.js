function sumNullable(values) {
  const present = values.filter((v) => Number.isFinite(v));
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

function roundUsage(raw) {
  return {
    prompt_tokens: raw?.prompt_tokens ?? null,
    completion_tokens: raw?.completion_tokens ?? null,
    cached_tokens: raw?.prompt_tokens_details?.cached_tokens ?? null,
  };
}

// One turn can cost more than one request. The totals are what you paid;
// `rounds` is the itemised receipt, and only appears when there is more
// than one line on it. `tools: true` is persisted only when the server
// actually attached the weather schema — never when the switch was off.
function buildUsage(rawUsages, model, sampling, offeredTools) {
  const rounds = rawUsages.map(roundUsage);
  return {
    prompt_tokens: sumNullable(rounds.map((r) => r.prompt_tokens)),
    completion_tokens: sumNullable(rounds.map((r) => r.completion_tokens)),
    cached_tokens: sumNullable(rounds.map((r) => r.cached_tokens)),
    model,
    sampling,
    ...(rounds.length > 1 ? { rounds } : {}),
    ...(offeredTools === true ? { tools: true } : {}),
  };
}

// The one-line receipt shown on a reply and in the cost summary:
// "143 in · 13 out", or for a tool turn "270 + 341 in · 49 out · 2 requests".
// A missing completion count omits the "out" segment rather than printing null.
function formatTokenSummary(usage) {
  if (!usage || !Number.isFinite(usage.prompt_tokens)) return null;
  const rounds = Array.isArray(usage.rounds) && usage.rounds.length > 1 ? usage.rounds : null;
  const inPart = rounds
    ? `${rounds.map((r) => r.prompt_tokens ?? '—').join(' + ')} in`
    : `${usage.prompt_tokens} in`;
  const parts = [inPart];
  if (Number.isFinite(usage.completion_tokens)) parts.push(`${usage.completion_tokens} out`);
  if (rounds) parts.push(`${rounds.length} requests`);
  return parts.join(' · ');
}

// The selected tab's token count — the text that actually gets replayed.
function selectedReplyTokens(assistant) {
  if (!assistant?.completions?.length) return null;
  const active = assistant.completions[assistant.activeIndex || 0];
  const n = active?.tokenProbabilities?.length;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function remainderLabel(kind, toolsInRemainder) {
  if (kind === 'first') {
    return toolsInRemainder ? 'system, wrappers, and the tool schema' : 'system and wrappers';
  }
  return toolsInRemainder ? 'wrappers and the tool schema' : 'wrappers';
}

// Highest-grain billed remainder chain for a user bubble.
// First send:  5 this message + 45 system and wrappers = 50 input tokens
// Later send:  50 from earlier turns + 43 last reply + 5 this message + 8 wrappers = 106 input tokens
// Addends always sum to the billed prompt; if they cannot, we fall back to a coarser line.
function userPromptBreakdown({
  messageTokens,
  promptTokens,
  replayedTokens,
  lastReplyTokens,
  toolsOffered,
  previousToolsOffered,
} = {}) {
  if (!Number.isFinite(messageTokens) || !Number.isFinite(promptTokens)) return null;
  const tools = toolsOffered === true;
  const toolsNew = tools && previousToolsOffered !== true;
  const replayed = Number.isFinite(replayedTokens) && replayedTokens > 0 && replayedTokens <= promptTokens
    ? replayedTokens
    : null;

  const addends = [];
  if (replayed != null) {
    addends.push({ tokens: replayed, label: 'from earlier turns' });
    const added = promptTokens - replayed;
    const lastReply = Number.isFinite(lastReplyTokens) && lastReplyTokens > 0 ? lastReplyTokens : null;
    if (lastReply != null) {
      addends.push({ tokens: lastReply, label: 'last reply' });
      addends.push({ tokens: messageTokens, label: 'this message' });
      const wrap = added - lastReply - messageTokens;
      if (wrap > 0) addends.push({ tokens: wrap, label: remainderLabel('later', toolsNew) });
    } else {
      addends.push({ tokens: messageTokens, label: 'this message' });
      const rest = added - messageTokens;
      if (rest > 0) addends.push({ tokens: rest, label: toolsNew ? 'last reply, wrappers, and the tool schema' : 'last reply and wrappers' });
    }
  } else {
    addends.push({ tokens: messageTokens, label: 'this message' });
    const rest = promptTokens - messageTokens;
    if (rest > 0) addends.push({ tokens: rest, label: remainderLabel('first', tools) });
  }

  const sum = addends.reduce((total, part) => total + part.tokens, 0);
  if (sum !== promptTokens) return null;
  return { addends, promptTokens, tools, toolsNamedInRemainder: (replayed != null ? toolsNew : tools) && addends.some((part) => part.label.includes('tool schema')) };
}

// The one-line count under a user bubble. Accepts either the old
// (messageTokens, promptTokens, toolsOffered) positional form or a breakdown object.
function formatUserTokenLine(messageTokens, promptTokens, toolsOffered) {
  const details = messageTokens != null && typeof messageTokens === 'object'
    ? messageTokens
    : { messageTokens, promptTokens, toolsOffered };
  if (!Number.isFinite(details.messageTokens)) return null;
  if (!Number.isFinite(details.promptTokens)) return `≈ ${details.messageTokens} tokens`;

  const breakdown = userPromptBreakdown(details);
  if (!breakdown) {
    const prompt = `${details.promptTokens} input tokens${details.toolsOffered ? ', including the tool schema' : ''}`;
    return `${details.messageTokens} this message · ${prompt}`;
  }
  const sum = breakdown.addends.map((part) => `${part.tokens} ${part.label}`).join(' + ');
  const toolsClause = details.toolsOffered && !breakdown.toolsNamedInRemainder
    ? ', including the tool schema'
    : '';
  return `${sum} = ${breakdown.promptTokens} input tokens${toolsClause}`;
}

// Durable signal: usage.tools survives echoedTools being dropped on the
// next send. The fallbacks cover in-flight turns and older transcripts
// saved before that flag existed — both only appear after a tools-on send.
function offeredTools(assistant) {
  if (!assistant) return false;
  if (assistant.usage?.tools === true) return true;
  if (Array.isArray(assistant.echoedTools) && assistant.echoedTools.length > 0) return true;
  if (assistant.toolCall) return true;
  if (Array.isArray(assistant.toolCalls) && assistant.toolCalls.length > 0) return true;
  return false;
}

export {
  sumNullable,
  roundUsage,
  buildUsage,
  formatTokenSummary,
  selectedReplyTokens,
  userPromptBreakdown,
  formatUserTokenLine,
  offeredTools,
};
