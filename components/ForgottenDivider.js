export default function ForgottenDivider({ droppedCount }) {
  if (!(droppedCount > 0)) return null;

  return (
    <div className="forgotten-divider">
      <span className="forgotten-divider-rule" aria-hidden="true" />
      <p className="forgotten-divider-text">
        <strong>Everything above is forgotten.</strong>{' '}
        {`These ${droppedCount} message${droppedCount === 1 ? '' : 's'} are still on your screen, but they are not part of the request anymore — the model never sees them.`}
      </p>
    </div>
  );
}
