import { useEffect, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import type { ClientApi } from "../../shared/clientTypes";
import { getLocale, t } from "../../shared/i18n";
import { useLocale } from "../i18n";

type Trigger = NonNullable<Awaited<ReturnType<ClientApi["listCompletionTriggers"]>>>[number];

export function CompletionTriggers({ client, sessionId, active, triggerId, focusRequest }: { client: Pick<ClientApi, "listCompletionTriggers" | "cancelCompletionTrigger">; sessionId: string; active: boolean; triggerId?: string; focusRequest?: object }) {
  useLocale();
  const [items, setItems] = useState<Trigger[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [supported, setSupported] = useState(true);
  const [revision, setRevision] = useState(0);
  const focused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (inFlight || stopped) return;
      inFlight = true;
      if (timer) clearTimeout(timer);
      try {
        if (document.visibilityState === "hidden") return;
        const result = await client.listCompletionTriggers(sessionId, triggerId);
        if (!stopped) { setItems(result ?? []); setSupported(result !== null); setLoaded(true); setError(""); if (result === null) stopped = true; }
      } catch (err) { if (!stopped) { setLoaded(true); setError(err instanceof Error ? err.message : String(err)); } }
      finally { inFlight = false; if (!stopped) timer = setTimeout(() => void poll(), 5000); }
    }
    const visible = () => { if (document.visibilityState !== "hidden") void poll(); };
    void poll();
    document.addEventListener("visibilitychange", visible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [client, sessionId, active, revision, triggerId]);
  const focusedAvailable = items.some(item => item.id === triggerId);
  useEffect(() => {
    if (active && loaded) focused.current?.scrollIntoView?.({ block: "nearest" });
  }, [triggerId, loaded, active, focusedAvailable, focusRequest]);
  async function cancel(id: string) {
    setBusy(true); setError("");
    try { await client.cancelCompletionTrigger(sessionId, id); setItems(current => current.map(item => item.id === id ? { ...item, state: "cancelled" } : item)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); setRevision(value => value + 1); }
  }
  return <section className="completion-panel" aria-label={t("completionTriggers.title")}>
    <h2>{t("completionTriggers.session")}<span>{items.length}</span></h2>
    {error && <p role="alert">{error}</p>}
    {!loaded ? <p role="status">{t("completionTriggers.loading")}</p> : !supported ? <p>{t("completionTriggers.unsupported")}</p> : <>
      {triggerId && !items.some(item => item.id === triggerId) && <p role="status">{t("completionTriggers.unavailable")}</p>}
      {!items.length && !triggerId && <p>{t("completionTriggers.empty")}</p>}
      {items.map(item => {
        const state = (item.state ?? "pending") === "pending" && Date.parse(item.expires_at) <= Date.now() ? "expired" : item.state ?? "pending";
        return <article key={item.id} ref={item.id === triggerId ? focused : undefined} className={`completion-card ${item.id === triggerId ? "selected" : ""}`}>
          <header><strong>{item.title}</strong><span className={`completion-state ${state}`}>{t(`completionTriggers.${state}`)}</span></header>
          <div className="completion-followup"><span>{t("completionTriggers.followup")}</span><p>{item.on_fire}</p></div>
          <footer><small title={t("completionTriggers.expires", { p0: new Date(item.expires_at).toLocaleString(getLocale()) })}><Clock3 size={12} />{t("completionTriggers.expires", { p0: new Date(item.expires_at).toLocaleString(getLocale(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) })}</small>
          {state === "pending" && <button type="button" className="completion-cancel" title={t("completionTriggers.cancelHelp")} disabled={busy} aria-label={t("completionTriggers.cancel", { p0: item.title })} onClick={() => void cancel(item.id)}>{t("completionTriggers.cancelAction")}</button>}</footer>
        </article>;
      })}
    </>}
  </section>;
}
