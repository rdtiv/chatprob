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
}) {
  const turns = inSeries.length;
  const rates = rateFor(lastAssistant?.usage?.model);
  const lastSpend = lastAssistant?.usage ? turnCost(lastAssistant.usage, rates) : null;
  const paidSoFar = conversationCost(messages, rates);

  if (!turns || !lastAssistant?.usage) {
    return (
      <p className="conversation-explainer">
        Send a message and I will walk you through what the model did with your tokens, like reading the receipt together.
        {' '}Try sending <strong>strawberry</strong>: your message will show it as three pieces, not ten letters. That is why counting letters is hard for a model.
      </p>
    );
  }

  const lastIn = inSeries[turns - 1];
  const lastPaid = sessionSeries[turns - 1];
  const prevIn = turns > 1 ? inSeries[turns - 2] : null;
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
    text = `You sent ${lastIn} tokens in — a short system note plus your question. The model sampled ${samples} possible replies. This tab is ${tabOut ?? 'a few'} tokens; all ${samples} together were ${totalOut} out. This one request billed ${lastPaid} tokens, about ${formatUsd(lastSpend.total)} (${formatUsd(lastSpend.input)} in + ${formatUsd(lastSpend.output)} out). The model will not remember this chat. Next message, those ${lastIn} tokens plus the tab you leave selected get shipped back in.`;
  } else if (turns === 2) {
    text = `See the prompt jump ${prevIn} → ${lastIn}? About ${replayed} of that is last turn's prompt, sent again — the API has no memory. The other ${added} tokens are new: the reply you locked in, plus what you just typed. You already paid for those ${replayed} once. This request billed ${thisTurnBill} tokens, about ${formatUsd(lastSpend.total)} (${formatUsd(lastSpend.input)} in + ${formatUsd(lastSpend.output)} out). Conversation total ${prevPaid} → ${lastPaid} tokens, about ${formatUsd(paidSoFar.total)}.`;
  } else {
    text = `Prompt so far: ${inSeries.join(' → ')}. That staircase is the conversation tax — each request resends everything. This tab only wrote ${tabOut ?? 'a short'} tokens, but ${lastIn} went in. This turn cost about ${formatUsd(lastSpend.total)} (${formatUsd(lastSpend.input)} in + ${formatUsd(lastSpend.output)} out); paid so far ${sessionSeries.join(' → ')} tokens, about ${formatUsd(paidSoFar.total)}. Long chats get expensive even when answers stay short, because you are paying to re-read the past. Only the selected tab continues; the other samples were paid for at the higher output rate and then dropped.`;
  }

  if (millionTurns != null && millionTurns >= 1) {
    text += ` A million turns like this last one would be about ${formatUsd(millionTurns)}.`;
  }

  return (
    <>
      <p className="conversation-explainer">{text}</p>
      <p className="rate-card">
        {rates.model} rate card: ${rates.inputPerMillion.toFixed(2)} / 1M in · ${rates.outputPerMillion.toFixed(2)} / 1M out
        {rates.approximate ? ' (list price for a similar mini model)' : ''}
        {' — '}
        this turn {formatUsd(lastSpend.input)} in · {formatUsd(lastSpend.output)} out · {formatUsd(lastSpend.total)} total
        {' | '}
        conversation {formatUsd(paidSoFar.input)} in · {formatUsd(paidSoFar.output)} out · {formatUsd(paidSoFar.total)} total
      </p>
    </>
  );
}
