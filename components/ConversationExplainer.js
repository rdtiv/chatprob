import { useState } from 'react';
import { formatUsd, formatScale, rateFor, sumCosts, turnCost } from '../lib/openaiRates';

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

function totalCachedTokens(messages) {
  return (messages || [])
    .filter((item) => item.role === 'assistant' && Number.isFinite(item.usage?.cached_tokens))
    .reduce((sum, item) => sum + Math.min(Math.max(0, item.usage.cached_tokens), item.usage.prompt_tokens ?? Infinity), 0);
}

function breakdown(spend) {
  return spend.cachedInput > 0
    ? `${formatUsd(spend.input)} in + ${formatUsd(spend.cachedInput)} cached in + ${formatUsd(spend.output)} out`
    : `${formatUsd(spend.input)} in + ${formatUsd(spend.output)} out`;
}

export function CostFooter({ messages, lastAssistant, sessionBilled }) {
  const [rateCardOpen, setRateCardOpen] = useState(false);
  if (!lastAssistant?.usage) return null;

  const rates = rateFor(lastAssistant.usage.model);
  const lastSpend = turnCost(lastAssistant.usage, rates);
  const paidSoFar = conversationCost(messages, rates);
  const scale = formatScale(lastSpend.total);
  const cachedTokens = totalCachedTokens(messages);

  return (
    <div className="cost-footer">
      <p className="cost-footer-line">
        Conversation so far <strong>{sessionBilled.toLocaleString()} tokens</strong> {formatUsd(paidSoFar.total)}{scale ? ` · ${scale}` : ''}
      </p>
      <button
        type="button"
        className="cost-footer-toggle"
        aria-expanded={rateCardOpen}
        onClick={() => setRateCardOpen((open) => !open)}
      >
        How is this priced?
      </button>
      {rateCardOpen && (
        <>
          <p className="rate-card">
            {rates.model} rate card: ${rates.inputPerMillion.toFixed(2)} / 1M in · ${rates.outputPerMillion.toFixed(2)} / 1M out
            {rates.approximate ? ' (list price for a similar mini model)' : ''}
            {cachedTokens > 0 ? ` · $${rates.cachedInputPerMillion.toFixed(3)} / 1M cached in` : ''}
          </p>
          <p className="cost-footer-breakdown">this turn {breakdown(lastSpend)}</p>
        </>
      )}
    </div>
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
  const cachedTokens = totalCachedTokens(messages);

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
  // screen never passes these props).
  const usePropIn = Number.isFinite(lastInProp);
  const lastIn = usePropIn ? lastInProp : inSeries[inSeries.length - 1];
  const prevIn = usePropIn
    ? (Number.isFinite(prevInProp) ? prevInProp : null)
    : (inSeries.length > 1 ? inSeries[inSeries.length - 2] : null);
  const tabOut = lastTabOut(lastAssistant);
  const totalOut = lastAssistant.usage.completion_tokens;
  const samples = lastAssistant.completions?.length || 3;
  const replayed = prevIn;
  const added = prevIn != null ? Math.max(0, lastIn - prevIn) : null;

  let text;
  if (turns === 1) {
    text = `You sent ${lastIn} tokens in and this reply is ${tabOut ?? 'a few'} tokens out (${totalOut} across all ${samples} samples). The model will not remember any of it — next message, all of this gets sent back in.`;
  } else if (turns === 2) {
    text = `The prompt jumped ${prevIn} → ${lastIn}: about ${replayed} of that is last turn sent again, ${added} is new. The API has no memory, so you pay to resend the past every turn.`;
  } else {
    text = `Prompt so far: ${inSeries.join(' → ')}. Each request resends everything before it — long chats get expensive even when answers stay short.`;
  }

  if (Number.isFinite(toolRoundIn)) {
    text += ` This turn took two requests: the second carried the tool call and its result — ${toolRoundIn} tokens in, ${Math.max(0, toolRoundIn - lastIn)} of them new.`;
  }

  if (cachedTokens > 0) {
    text += ` Across this conversation, ${cachedTokens} input tokens came back from OpenAI's prompt cache at the discounted rate.`;
  }

  const forgettingText = droppedMessages > 0 && keepTurns != null
    ? `Right now the memory control is on: ${droppedMessages} older message${droppedMessages === 1 ? '' : 's'} sit above the line and are not replayed. ${keepTurns === 0 ? 'Only the message you just typed goes out' : `Only the last ${keepTurns} exchange${keepTurns === 1 ? '' : 's'} plus your newest message go out`}, so watch the prompt count fall instead of climb — forgetting is cheaper. The system prompt never falls off; the server adds it to every request.`
    : null;

  return (
    <>
      <p className="conversation-explainer">{text}</p>
      {forgettingText && (
        <p className="conversation-explainer">
          <strong>Why did it forget?</strong> {forgettingText}
        </p>
      )}
    </>
  );
}
