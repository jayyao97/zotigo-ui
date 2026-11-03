import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import type { ClientApi } from "../../shared/clientTypes";
import { t } from "../../shared/i18n";
import { useLocale } from "../i18n";

type Trigger = NonNullable<Awaited<ReturnType<ClientApi["listCompletionTriggers"]>>>[number];

export function CompletionTriggers({ client, sessionId, active }: { client: Pick<ClientApi, "listCompletionTriggers" | "cancelCompletionTrigger">; sessionId: string; active: boolean }) {
  useLocale();
  const [items, setItems] = useState<Trigger[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (document.visibilityState === "hidden") return;
        const result = await client.listCompletionTriggers(sessionId);
        if (!stopped) { setItems(result ?? []); setError(""); if (result === null) stopped = true; }
      } catch (err) { if (!stopped) setError(err instanceof Error ? err.message : String(err)); }
      finally { if (!stopped && active) timer = setTimeout(() => void poll(), 5000); }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [client, sessionId, active, revision]);
  async function cancel(id: string) {
    setBusy(true); setError("");
    try { await client.cancelCompletionTrigger(sessionId, id); setItems(current => current.filter(item => item.id !== id)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); setRevision(value => value + 1); }
  }
  if (!items.length && !error) return null;
  return <section className="input-queue" aria-label={t("completionTriggers.waiting")}>
    <header><span><Bell size={15} /> {t("completionTriggers.waiting")}{items.length ? ` · ${items.length}` : ""}</span></header>
    <ol>{items.map(item => <li key={item.id}>
      <div className="queue-message"><span>{item.title}</span><small>{item.on_fire}</small><small>{t("completionTriggers.expires", { p0: new Date(item.expires_at).toLocaleString() })}</small></div>
      <button type="button" className="icon-button" disabled={busy} aria-label={t("completionTriggers.cancel", { p0: item.title })} onClick={() => void cancel(item.id)}><X size={14} /></button>
    </li>)}</ol>
    {error && <p role="alert">{error}</p>}
  </section>;
}
