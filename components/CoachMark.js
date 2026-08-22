// A single coach mark: short guidance text, a step counter, and a dismiss
// button. Renders in place of what used to be the static hover hint —
// `anchorRef` is accepted for callers that want to point one at a specific
// element later, but this component itself renders inline, no positioning.
export default function CoachMark({ step, total, text, onDone, anchorRef }) {
  return (
    <div className="hover-hint coach-mark" role="status" ref={anchorRef}>
      <span>{text}</span>
      <span className="coach-mark-step">{step} of {total}</span>
      <button type="button" className="coach-mark-done" onClick={onDone}>Got it</button>
    </div>
  );
}
