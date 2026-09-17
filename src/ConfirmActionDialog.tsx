import { useId } from "react";

export function ConfirmActionDialog({ title, description, action, busy, error, onCancel, onConfirm }: {
  title: string;
  description: string;
  action: string;
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleID = useId();
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }} onKeyDown={(event) => { if (event.key === "Escape" && !busy) onCancel(); }}>
    <div className="create-project-dialog" role="dialog" aria-modal="true" aria-labelledby={titleID}>
      <header><h2 id={titleID}>{title}</h2></header>
      <p className="archive-workspace-copy">{description}</p>
      {error && <p className="dialog-error">{error}</p>}
      <footer>
        <button autoFocus type="button" className="dialog-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="dialog-submit destructive" disabled={busy} onClick={onConfirm}>{busy ? "Working…" : action}</button>
      </footer>
    </div>
  </div>;
}
