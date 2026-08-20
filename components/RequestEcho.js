import { useState, useId } from 'react';

export default function RequestEcho({ echoedMessages }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!Array.isArray(echoedMessages) || echoedMessages.length === 0) return null;

  const lastAssistantIdx = echoedMessages.map((m) => m.role).lastIndexOf('assistant');
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
          </div>
          <p className="request-echo-note">
            This is the literal array we sent, system prompt included. Pale blocks were part of an earlier request; dark blocks are the newest exchange. The chart&rsquo;s token counts run a little higher than these message bodies — the chat wrapper is counted too.
          </p>
        </>
      )}
    </div>
  );
}
