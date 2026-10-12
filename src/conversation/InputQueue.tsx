import { useEffect, useState } from "react";
import { Pencil, Trash2, ListOrdered } from "lucide-react";
import type { QueuedInput } from "../../shared/zotigod";
import type { ClientApi } from "../../shared/clientTypes";

export function InputQueue({ client, sessionId, refresh, active }: { client: Pick<ClientApi, "listQueuedInputs" | "editQueuedInput" | "deleteQueuedInput" | "resumeInputQueue">; sessionId: string; refresh: number; active: boolean }) {
  const [items, setItems] = useState<QueuedInput[]>([]);
  const [editing, setEditing] = useState<{ item: QueuedInput; text: string } | null>(null);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (document.visibilityState === "hidden") return;
        const result = await client.listQueuedInputs(sessionId);
        if (!stopped) {
          setItems(result ?? []); setPollError("");
          if (result === null) stopped = true;
        }
      }
      catch (error) { if (!stopped) setPollError(error instanceof Error ? error.message : String(error)); }
      finally { if (!stopped && active) timer = setTimeout(() => void poll(), 2000); }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [client, sessionId, refresh, revision, active]);
  async function change(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); setEditing(null); setRevision(value => value + 1); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  if (!items.length && !error && !pollError) return null;
  return <section className="input-queue" aria-label="Queued messages">
    <header><span><ListOrdered size={15} /> Next turn{items.length ? ` · ${items.length}` : ""}</span>{items.some(item => item.state === "paused") && <button type="button" disabled={busy} onClick={() => void change(() => client.resumeInputQueue(sessionId))}>Resume queue</button>}</header>
    <ol>{items.map(item => <li key={item.id}>
      {editing?.item.id === item.id ? <div className="queue-editor">
        <textarea aria-label="Edit queued message" value={editing.text} onChange={event => setEditing({ ...editing, text: event.target.value })} autoFocus />
        <div><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button type="button" disabled={busy || !item.editable} onClick={() => void change(() => client.editQueuedInput(sessionId, item.id, editing.item.revision, editing.text))}>Save</button></div>
      </div> : <><div className="queue-message"><span>{item.text || "Image attachment"}</span>{!!item.images?.length && <small>{item.images.length} image(s)</small>}{item.state !== "queued" && <small>{item.state === "paused" ? "Paused" : "Sending…"}</small>}</div><button type="button" className="icon-button" aria-label="Edit queued message" disabled={busy || !item.editable} onClick={() => setEditing({ item, text: item.text ?? "" })}><Pencil size={14} /></button><button type="button" className="icon-button" aria-label="Delete queued message" disabled={busy || !item.editable} onClick={() => void change(() => client.deleteQueuedInput(sessionId, item.id, item.revision))}><Trash2 size={14} /></button></>}
    </li>)}</ol>
    {(error || pollError) && <p role="alert">{error || pollError}</p>}
  </section>;
}
