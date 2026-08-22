// messageCount is the raw number of transcript bubbles above the line
// (forgetting.cutoffIndex) — deliberately NOT contextWindow's droppedCount,
// which counts only payload-eligible messages and would undercount whenever
// an error bubble sits above the cut.
export default function ForgottenDivider({ messageCount }) {
  if (!(messageCount > 0)) return null;

  return (
    <div className="forgotten-divider">
      <span className="forgotten-divider-rule" aria-hidden="true" />
      <p className="forgotten-divider-text">
        <strong>Everything above is forgotten.</strong>{' '}
        {`These ${messageCount} message${messageCount === 1 ? '' : 's'} are still on your screen, but they are not part of the request anymore — the model never sees them.`}
      </p>
    </div>
  );
}
