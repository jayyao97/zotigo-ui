import { useLocale } from "../i18n";
import { t } from "../../shared/i18n/index";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Pencil, Trash2, ListOrdered, X, LoaderCircle } from "lucide-react";
import type { QueuedInput, DisplayItem } from "../../shared/zotigod";
import type { ClientApi } from "../../shared/clientTypes";

import { PreviewImage } from "../ImagePreview";
import { userImageUrl } from "../../shared/codexUserMessage";

export function InputQueue({ client, sessionId, refresh, active, daemonUrl = "", pending = [], onReconciled, onRetry, onRestore, onDismiss }: { client: Pick<ClientApi, "listQueuedInputs" | "editQueuedInput" | "deleteQueuedInput" | "resumeInputQueue" | "sendQueuedInput">; sessionId: string; refresh: number; active: boolean; daemonUrl?: string; pending?: DisplayItem[]; onReconciled?: (ids: string[]) => void; onRetry?: (id: string) => void; onRestore?: (id: string) => void; onDismiss?: (id: string) => void }) {
  useLocale();
  const [items, setItems] = useState<QueuedInput[]>([]);
  const [editing, setEditing] = useState<{ item: QueuedInput; text: string; imageIndices: number[] } | null>(null);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const reconciliation = useRef({ pending, onReconciled });
  useEffect(() => { reconciliation.current = { pending, onReconciled }; });
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (document.visibilityState === "hidden") return;
        // Only an acknowledgment preceding this request can confirm an absent entry.
        const confirmed = new Set(reconciliation.current.pending.filter(item => item.queueConfirmed).map(item => item.id));
        const result = await client.listQueuedInputs(sessionId);
        if (!stopped) {
          setItems(result ?? []); setPollError("");
          if (result !== null) {
            const queued = new Set(result.map(item => item.id));
            const { pending, onReconciled } = reconciliation.current;
            const ids = pending.filter(item => confirmed.has(item.id) || queued.has(item.id)).map(item => item.id);
            if (ids.length) onReconciled?.(ids);
          }
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
    try { await action(); setEditing(null); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); setRevision(value => value + 1); }
  }
  function images(item: QueuedInput, indices: number[], removable = false) {
    return indices.length > 0 && <div className="queue-images">{indices.map(index => {
      const url = userImageUrl(item.images?.[index]?.url, daemonUrl, sessionId, 0, index);
      return <div className="queue-image" key={index}>
        {url ? <PreviewImage src={url} alt={t("conversationTimeline.attachedImage", { p0: index + 1 })} /> : <span>{t("markdownImage.image")}{" "}{index + 1} {t("inputQueue.previewUnavailable")}</span>}
        {removable && <button type="button" className="icon-button" aria-label={t("inputQueue.removeImage", { p0: index + 1 })} disabled={busy} onClick={() => setEditing(value => value && ({ ...value, imageIndices: value.imageIndices.filter(i => i !== index) }))}><X size={14} /></button>}
      </div>;
    })}</div>;
  }
  const previews = pending.filter(item => !items.some(queued => queued.id === item.id));
  if (!items.length && !previews.length && !error && !pollError) return null;
  return <section className="input-queue" aria-label={t("inputQueue.queuedMessages")}>
    <header><span><ListOrdered size={15} /> {t("inputQueue.nextTurn")}{(items.length + previews.length) ? ` · ${items.length + previews.length}` : ""}</span>{items.some(item => item.state === "paused") && <button type="button" disabled={busy} onClick={() => void change(() => client.resumeInputQueue(sessionId))}>{t("inputQueue.resumeQueue")}</button>}</header>
    <ol>{items.map(item => <li key={item.id}>
      {editing?.item.id === item.id ? <div className="queue-editor">
        <textarea aria-label={t("inputQueue.editQueuedMessage")} value={editing.text} onChange={event => setEditing({ ...editing, text: event.target.value })} autoFocus />
        {images(editing.item, editing.imageIndices, editing.item.image_editing_supported === true)}
        {!!editing.item.images?.length && !editing.item.image_editing_supported && <p>{t("inputQueue.imagesWillBeKeptUpdateTheConnectedDaemon")}</p>}
        <div><button type="button" disabled={busy} onClick={() => setEditing(null)}>{t("app.cancel")}</button><button type="button" disabled={busy || !item.editable || (!editing.text.trim() && !editing.imageIndices.length)} onClick={() => void change(() => client.editQueuedInput(sessionId, item.id, editing.item.revision, editing.text, editing.item.image_editing_supported ? editing.imageIndices : undefined))}>{t("app.save")}</button></div>
      </div> : <>
        <div className="queue-message"><span>{item.text || t("inputQueue.imageAttachment")}</span>{images(item, (item.images ?? []).map((_, index) => index))}{item.state !== "queued" && <small>{item.state === "paused" ? t("inputQueue.paused") : t("conversationTimeline.sending")}</small>}</div>
        <button type="button" className="icon-button" aria-label={t("inputQueue.sendNow")} title={t("inputQueue.sendNow")} disabled={busy || !item.editable} onClick={() => void change(() => client.sendQueuedInput(sessionId, item.id, item.revision))}><ArrowUp size={14} /></button>
        <button type="button" className="icon-button" aria-label={t("inputQueue.editQueuedMessage")} disabled={busy || !item.editable} onClick={() => setEditing({ item, text: item.text ?? "", imageIndices: (item.images ?? []).map((_, index) => index) })}><Pencil size={14} /></button>
        <button type="button" className="icon-button" aria-label={t("inputQueue.deleteQueuedMessage")} disabled={busy || !item.editable} onClick={() => void change(() => client.deleteQueuedInput(sessionId, item.id, item.revision))}><Trash2 size={14} /></button>
      </>}
    </li>)}{previews.map(item => <li key={item.id}>
      <div className="queue-message">
        <span>{item.content?.map(part => part.text ?? "").join("") || t("inputQueue.imageAttachment")}</span>
        <div className="queue-images">{item.content?.flatMap((part, index) => part.image?.url ? [<PreviewImage key={index} src={part.image.url} alt={t("conversationTimeline.attachedImage", { p0: index + 1 })} />] : [])}</div>
        <small>{item.queueConfirmed ? t("inputQueue.queued") : item.delivery?.state === "sending" ? <><LoaderCircle size={13} className="spinning" /> {t("inputQueue.addingToQueue")}</> : item.delivery?.state === "rejected" ? item.delivery.error || t("inputQueue.messageWasNotQueued") : t("inputQueue.couldNotConfirmQueueSubmission")}</small>
        {item.delivery?.state === "failed" && <button type="button" onClick={() => onRetry?.(item.id)}>{t("app.retry2")}</button>}
        {item.delivery?.state === "rejected" && <><button type="button" onClick={() => onRestore?.(item.id)}>{t("app.restoreDraft")}</button><button type="button" onClick={() => onDismiss?.(item.id)}>{t("app.delete")}</button></>}
      </div>
    </li>)}</ol>
    {(error || pollError) && <p role="alert">{error || pollError}</p>}
  </section>;
}
