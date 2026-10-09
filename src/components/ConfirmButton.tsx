import { useState } from "react";

/** Two-step destructive action with an in-page confirmation (no confirm() dialogs). */
export function ConfirmButton({
  label, prompt, confirmLabel = "Delete", onConfirm,
}: { label: string; prompt: string; confirmLabel?: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" className="btn danger" onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <div className="confirm" role="alert">
      <p>{prompt}</p>
      <div className="row">
        <button type="button" className="btn danger" onClick={onConfirm}>{confirmLabel}</button>
        <button type="button" className="btn" onClick={() => setAsking(false)}>Cancel</button>
      </div>
    </div>
  );
}
