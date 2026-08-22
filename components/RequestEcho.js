import { useState, useId } from 'react';

export default function RequestEcho({ echoedMessages, echoedTools, echoedToolChoice }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!Array.isArray(echoedMessages) || echoedMessages.length === 0) return null;

  // An assistant message with tool_calls and null content is part of THIS
  // request (the injected round-2 replay), not an earlier reply — only a
  // string-content assistant message is a real past turn.
  const lastAssistantIdx = echoedMessages.reduce(
    (found, m, i) => (m.role === 'assistant' && typeof m.content === 'string' ? i : found),
    -1
  );
  const newFrom = lastAssistantIdx >= 0 ? lastAssistantIdx : 0;

  return (
    <div className="request-echo">
      <button
        type="button"
        className="request-echo-toggle"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide the exact request' : 'View the exact request'}
      </button>
      {open && (
        <>
          <div id={panelId} className="request-echo-panel">
            {echoedMessages.map((message, index) => (
              <pre
                key={index}
                className={`request-echo-message ${index >= newFrom ? 'is-new' : 'is-replayed'}`}
              >
                {JSON.stringify(message, null, 2)}
              </pre>
            ))}
            {Array.isArray(echoedTools) && echoedTools.length > 0 && (
              <div className="request-echo-tools">
                <p className="request-echo-tools-label">tools — sent beside the messages on every request while the switch is on{echoedToolChoice ? `, with tool_choice: "${echoedToolChoice}" this time` : ''}</p>
                <pre className="request-echo-message is-replayed">{JSON.stringify(echoedTools, null, 2)}</pre>
              </div>
            )}
          </div>
          <p className="request-echo-note">
            This is the literal array we sent, system prompt included. Pale blocks were part of an earlier request; dark blocks are the newest exchange. The newest reply is missing on purpose: it didn&rsquo;t exist when this request was sent — it only gets replayed in the <em>next</em> request. The chart&rsquo;s token counts run a little higher than these message bodies — the chat wrapper is counted too.{Array.isArray(echoedTools) && echoedTools.length > 0 ? ' The tools block is how the model knew a weather function existed — nothing in the system prompt mentions it; the description inside that block is the only documentation the model gets, and its tokens are counted in the prompt.' : ''}
          </p>
        </>
      )}
    </div>
  );
}
