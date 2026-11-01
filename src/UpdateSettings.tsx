import { useEffect, useRef, useState } from "react";
import { useClient } from "./ClientContext";
import { t } from "../shared/i18n";
import type { UpdateAction, UpdateChannel, UpdateStatus } from "../shared/updates";

export function UpdateSettings({ hostName }: { hostName: string }) {
  const { kind } = useClient();
  return <>
    <h1>{t("updates.title")}</h1>
    <UpdateCard target="client" title={t(kind === "desktop" ? "updates.desktop" : "updates.web")} />
    <UpdateCard key={hostName} target="daemon" title={t("updates.daemon", { host: hostName })} />
  </>;
}

function UpdateCard({ target, title }: { target: "client" | "daemon"; title: string }) {
  const { api, kind } = useClient();
  const [status, setStatus] = useState<UpdateStatus>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const active = status && ["preparing", "waiting", "applying", "verifying"].includes(status.phase);
  useEffect(() => {
    const id = ++generation.current;
    setStatus(undefined); setError(""); setBusy(true);
    void api.updateComponent(target, "status").then(async value => {
      if (generation.current !== id) return;
      setStatus(value);
      const elapsed = Date.now() - Date.parse(value.checked_at ?? "");
      if (["idle", "completed", "failed"].includes(value.phase) && (!Number.isFinite(elapsed) || elapsed > 4 * 60 * 60 * 1000)) {
        const checked = await api.updateComponent(target, "check");
        if (generation.current === id) setStatus(checked);
      }
    }).catch(err => { if (generation.current === id) setError(String(err instanceof Error ? err.message : err)); })
      .finally(() => { if (generation.current === id) setBusy(false); });
    return () => { generation.current++; };
  }, [api, target]);
  useEffect(() => {
    if (!active) return;
    const id = generation.current;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await api.updateComponent(target, "status");
        if (!stopped && generation.current === id) { setStatus(value); setError(""); }
      } catch { if (!stopped && generation.current === id) setError(t("updates.reconnecting")); }
      if (!stopped) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 2000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [api, target, active]);

  async function perform(action: UpdateAction, channel?: UpdateChannel) {
    if (busy) return;
    if (action === "apply" && target === "client" && kind === "desktop" && !window.dispatchEvent(new Event("zotigo:before-update", {cancelable: true}))) {
      if (!window.confirm(t("updates.unsaved"))) return;
    }
    const id = generation.current;
    setBusy(true); setError("");
    try {
      let value = await api.updateComponent(target, action, channel);
      if (generation.current !== id) return;
      setStatus(value);
      if (action === "channel") {
        value = await api.updateComponent(target, "check");
        if (generation.current === id) setStatus(value);
      }
    } catch (err) { if (generation.current === id) setError(err instanceof Error ? err.message : String(err)); }
    finally { if (generation.current === id) setBusy(false); }
  }
  return <section className="settings-section">
    <h2>{title}</h2>
    <div className="settings-card">
      {status && <>
        <div className="settings-row"><span><strong>{status.version}</strong><small>{status.commit.slice(0, 12)}{status.custom ? ` · ${t("updates.custom")}` : ""}</small></span></div>
        <label className="settings-row"><span><strong>{t("updates.channel")}</strong><small>{t("updates.channelHelp")}</small></span>
          <select aria-label={`${title} · ${t("updates.channel")}`} value={status.channel} disabled={busy || active || status.phase === "ready"} onChange={e => void perform("channel", e.target.value as UpdateChannel)}>
            <option value="stable">{t("updates.stable")}</option><option value="development">{t("updates.development")}</option>
          </select>
        </label>
        <div className="settings-row"><span aria-live="polite"><strong>{status.phase === "idle" && status.checked_at ? t("updates.checked") : t(`updates.phase.${status.phase}`)}</strong>
          <small>{status.target ? t("updates.available", { version: status.target.version }) : status.checked_at ? t("updates.latest") : t("updates.unchecked")}</small>
          {target === "daemon" && <small>{t("updates.daemonHelp")}</small>}
        </span>
          {status.phase === "waiting" && target === "daemon" && <button className="settings-secondary-button" disabled={busy} onClick={() => void perform("cancel")}>{t("updates.cancel")}</button>}
          {status.phase === "ready" ? <button className="settings-secondary-button" disabled={busy} onClick={() => void perform("apply")}>{t(target === "client" && kind === "desktop" ? "updates.restart" : "updates.apply")}</button>
            : status.target && !active ? <button className="settings-secondary-button" disabled={busy} onClick={() => void perform("prepare")}>{t("updates.prepare")}</button> : null}
        </div>
      </>}
      <div className="settings-row"><button className="settings-secondary-button" disabled={busy || active || status?.phase === "ready"} onClick={() => void perform(status ? "check" : "status")}>{t("updates.check")}</button></div>
    </div>
    {(error || status?.error) && <p role="alert">{error || status?.error}</p>}
    {!status && error && <p>{t("updates.bootstrap")}</p>}
  </section>;
}
