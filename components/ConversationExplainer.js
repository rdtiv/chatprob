import { formatUsd, rateFor, sumCosts, turnCost } from '../lib/openaiRates';

function lastTabOut(assistant) {
  if (!assistant?.completions?.length) return null;
  const active = assistant.completions[assistant.activeIndex || 0];
  return active?.tokenProbabilities?.length || null;
}

function conversationCost(messages, rates) {
  return sumCosts(
    (messages || [])
      .filter((item) => item.role === 'assistant' && item.usage)
      .map((item) => turnCost(item.usage, rates))
  );
}

export default function ConversationExplainer({
  inSeries,
  sessionSeries,
  lastAssistant,
  messages,
  droppedMessages = 0,
  keepTurns = null,
  // Turn count for copy-branch selection (1 / 2 / >2). Kept separate from
  // inSeries.length: a tool turn expands into two prompt-series entries
  // (one per request) but is still a single turn, so the caller passes the
  // real count. Falls back to inSeries.length for callers with no tool turns
  // (e.g. the empty-conversation screen), where the two always agree.
  turns = inSeries.length,
  // Turn-to-turn, first-request-to-first-request baseline computed by the
  // caller (roundPrompt in ChatInterface.js). When lastIn is finite it wins
  // over indexing inSeries — inSeries is per-REQUEST, not per-turn, so its
  // last two entries are the wrong pair on a tool turn. Absent (the empty
  // conversation screen), the original inSeries-based indexing still applies.
  lastIn: lastInProp,
  prevIn: prevInProp,
  // Second-round prompt tokens for a tool turn, or null/undefined otherwise.
  toolRoundIn,
}) {
  const rates = rateFor(lastAssistant?.usage?.model);
  const lastSpend = lastAssistant?.usage ? turnCost(lastAssistant.usage, rates) : null;
  const paidSoFar = conversationCost(messages, rates);
  const breakdown = (spend) => spend.cachedInput > 0
    ? `${formatUsd(spend.input)} in + ${formatUsd(spend.cachedInput)} cached in + ${formatUsd(spend.output)} out`
    : `${formatUsd(spend.input)} in + ${formatUsd(spend.output)} out`;
  const cachedTokens = (messages || [])
    .filter((item) => item.role === 'assistant' && Number.isFinite(item.usage?.cached_tokens))
    .reduce((sum, item) => sum + Math.min(Math.max(0, item.usage.cached_tokens), item.usage.prompt_tokens ?? Infinity), 0);

  if (!turns || !lastAssistant?.usage) {
    return (
      <p className="conversation-explainer">
        Send a message and I will walk you through what the model did with your tokens, like reading the receipt together.
        {' '}Try sending <strong>strawberry</strong>: your message will show it as three pieces, not ten letters. That is why counting letters is hard for a model.
      </p>
    );
  }

  // lastIn/prevIn: when the caller supplies a finite lastIn (the normal
  // path), use it and prevIn as given — that pair is turn-to-turn,
  // first-request-to-first-request. Otherwise fall back to indexing the
  // last two entries of inSeries, exactly as before (the empty-conversation
  // screen never passes these props). lastPaid/prevPaid stay per-turn — cost
  // is billed once per turn regardless of how many requests it took.
  const usePropIn = Number.isFinite(lastInProp);
  const lastIn = usePropIn ? lastInProp : inSeries[inSeries.length - 1];
  const lastPaid = sessionSeries[turns - 1];
  const prevIn = usePropIn
    ? (Number.isFinite(prevInProp) ? prevInProp : null)
    : (inSeries.length > 1 ? inSeries[inSeries.length - 2] : null);
  const prevPaid = turns > 1 ? sessionSeries[turns - 2] : null;
  const tabOut = lastTabOut(lastAssistant);
  const totalOut = lastAssistant.usage.completion_tokens;
  const samples = lastAssistant.completions?.length || 3;
  const replayed = prevIn;
  const added = prevIn != null ? Math.max(0, lastIn - prevIn) : null;
  const thisTurnBill = prevPaid != null ? lastPaid - prevPaid : lastPaid;
  const millionTurns = lastSpend ? lastSpend.total * 1_000_000 : null;

  let text;
  if (turns === 1) {
    text = `You sent ${lastIn} tokens in — a short system note plus your question. The model sampled ${samples} possible replies. This tab is ${tabOut ?? 'a few'} tokens; all ${samples} together were ${totalOut} out. This one request billed ${lastPaid} tokens, about ${formatUsd(lastSpend.total)} (${breakdown(lastSpend)}). The model will not remember this chat. Next message, those ${lastIn} tokens plus the tab you leave selected get shipped back in.`;
  } else if (turns === 2) {
    text = `See the prompt jump ${prevIn} → ${lastIn}? About ${replayed} of that is last turn's prompt, sent again — the API has no memory. The other ${added} tokens are new: the reply you locked in, plus what you just typed. You already paid for those ${replayed} once. This request billed ${thisTurnBill} tokens, about ${formatUsd(lastSpend.total)} (${breakdown(lastSpend)}). Conversation total ${prevPaid} → ${lastPaid} tokens, about ${formatUsd(paidSoFar.total)}.`;
  } else {
    text = `Prompt so far: ${inSeries.join(' → ')}. That staircase is the conversation tax — each request resends everything. This tab only wrote ${tabOut ?? 'a short'} tokens, but ${lastIn} went in. This turn cost about ${formatUsd(lastSpend.total)} (${breakdown(lastSpend)}); paid so far ${sessionSeries.join(' → ')} tokens, about ${formatUsd(paidSoFar.total)}. Long chats get expensive even when answers stay short, because you are paying to re-read the past. Only the selected tab continues; the other samples were paid for at the higher output rate and then dropped.`;
  }

  if (Number.isFinite(toolRoundIn)) {
    text += ` This turn took two requests: the second carried the tool call and its result — ${toolRoundIn} tokens in, ${Math.max(0, toolRoundIn - lastIn)} of them new.`;
  }

  if (millionTurns != null && millionTurns >= 1) {
    text += ` A million turns like this last one would be about ${formatUsd(millionTurns)}.`;
  }

  if (cachedTokens > 0) {
    text += ` Across this conversation, ${cachedTokens} input tokens came back from OpenAI's prompt cache at the discounted rate.`;
  }

  const forgettingText = droppedMessages > 0 && keepTurns != null
    ? `Right now the memory control is on: ${droppedMessages} older message${droppedMessages === 1 ? '' : 's'} sit above the line and are not replayed. Only the last ${keepTurns} exchange${keepTurns === 1 ? '' : 's'} plus your newest message go out, so watch the prompt count fall instead of climb — forgetting is cheaper. The system prompt never falls off; the server adds it to every request.`
    : null;

  return (
    <>
      <p className="conversation-explainer">{text}</p>
      {forgettingText && (
        <p className="conversation-explainer">
          <strong>Why did it forget?</strong> {forgettingText}
        </p>
      )}
      <p className="rate-card">
        {rates.model} rate card: ${rates.inputPerMillion.toFixed(2)} / 1M in · ${rates.outputPerMillion.toFixed(2)} / 1M out
        {rates.approximate ? ' (list price for a similar mini model)' : ''}
        {cachedTokens > 0 ? ` · $${rates.cachedInputPerMillion.toFixed(3)} / 1M cached in` : ''}
        {' — '}
        this turn {formatUsd(lastSpend.input)} in ·{lastSpend.cachedInput > 0 ? ` ${formatUsd(lastSpend.cachedInput)} cached in ·` : ''} {formatUsd(lastSpend.output)} out · {formatUsd(lastSpend.total)} total
        {' | '}
        conversation {formatUsd(paidSoFar.input)} in ·{paidSoFar.cachedInput > 0 ? ` ${formatUsd(paidSoFar.cachedInput)} cached in ·` : ''} {formatUsd(paidSoFar.output)} out · {formatUsd(paidSoFar.total)} total
      </p>
    </>
  );
}
