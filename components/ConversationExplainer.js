function lastTabOut(assistant) {
  if (!assistant?.completions?.length) return null;
  const active = assistant.completions[assistant.activeIndex || 0];
  return active?.tokenProbabilities?.length || null;
}

export default function ConversationExplainer({ inSeries, sessionSeries, lastAssistant }) {
  const turns = inSeries.length;
  if (!turns || !lastAssistant?.usage) {
    return (
      <p className="conversation-explainer">
        Send a message and I will walk through what the model actually did with your tokens — like we are sitting together looking at the receipt.
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

  let text;
  if (turns === 1) {
    text = `You sent ${lastIn} tokens in — a short system note plus your question. The model sampled ${samples} possible replies. This tab is ${tabOut ?? 'a few'} tokens; all ${samples} together were ${totalOut} out. This one request billed ${lastPaid}. The model will not remember this chat. Next message, those ${lastIn} tokens plus the tab you leave selected get shipped back in.`;
  } else if (turns === 2) {
    text = `See the prompt jump ${prevIn} → ${lastIn}? About ${replayed} of that is last turn's prompt, sent again — the API has no memory. The other ${added} tokens are new: the reply you locked in, plus what you just typed. You already paid for those ${replayed} once. This request billed ${thisTurnBill}. Conversation total ${prevPaid} → ${lastPaid}.`;
  } else {
    text = `Prompt so far: ${inSeries.join(' → ')}. That staircase is the conversation tax — each request resends everything. This tab only wrote ${tabOut ?? 'a short'} tokens, but ${lastIn} went in. Paid so far ${sessionSeries.join(' → ')}. Long chats get expensive even when answers stay short, because you are paying to re-read the past. Only the selected tab continues; the other samples were paid for and then dropped.`;
  }

  return <p className="conversation-explainer">{text}</p>;
}
