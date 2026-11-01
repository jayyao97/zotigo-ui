import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useClient } from "./ClientContext";
import { t } from "../shared/i18n";
import type { UpdateAction, UpdateChannel, UpdateStatus } from "../shared/updates";
import type { ClientApi } from "../shared/clientTypes";
import type { HostProfile } from "../shared/hosts";

// An initiated update survives page navigation, but never starts again just by opening settings.
const runningUpdates = new Set<string>();
const updateListeners = new Set<() => void>();
function subscribeUpdates(listener: () => void) { updateListeners.add(listener); return () => { updateListeners.delete(listener); }; }
function markUpdate(key: string, running: boolean) {
  if (running) runningUpdates.add(key); else runningUpdates.delete(key);
  for (const listener of updateListeners) listener();
}

export function UpdateSettings({ hosts, api }: { hosts: HostProfile[]; api: ClientApi }) {
  const { kind } = useClient();
  const [selected, setSelected] = useState("client");
  const targets = [
    {id:"client", title:t(kind === "desktop" ? "updates.desktop" : "updates.web"), host:undefined},
    ...hosts.map(host => ({id:`daemon:${host.id}`, title:t("updates.daemon", {host:host.id === "local" ? t(kind === "desktop" ? "settings.thisComputer" : "settings.servingHost") : host.name}), host})),
  ];
  const current = targets.find(target => target.id === selected) ?? targets[0];
  useEffect(() => { if (current.id !== selected) setSelected(current.id); }, [current.id, selected]);
  return <>
    <label className="settings-row settings-host-picker"><span><strong>{t("updates.target")}</strong><small>{current.host?.baseUrl}</small></span>
      <select aria-label={t("updates.target")} value={current.id} onChange={event => setSelected(event.target.value)}>
        {targets.map(target => <option key={target.id} value={target.id}>{target.title}</option>)}
      </select>
    </label>
    <h1>{t("updates.title")}</h1>
    {targets.map(target => <div key={target.id} hidden={target.id !== current.id}>
      <UpdateCard api={api} target={target.host ? "daemon" : "client"} hostId={target.host?.id} title={target.title} />
    </div>)}
  </>;
}

function UpdateCard({ api, target, title, hostId, address }: { api: ClientApi; target: "client" | "daemon"; title: string; hostId?: string; address?: string }) {
  const { kind } = useClient();
  const [status, setStatus] = useState<UpdateStatus>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const updateKey = `${target}:${hostId ?? "client"}`;
  const updating = useSyncExternalStore(subscribeUpdates, () => runningUpdates.has(updateKey));
  const wasUpdating = useRef(updating);
  const inFlight = useRef(false);
  const active = status && ["preparing", "waiting", "applying", "verifying"].includes(status.phase);
  useEffect(() => {
    const id = ++generation.current;
    inFlight.current = false;
    setStatus(undefined); setError(""); setBusy(true);
    void api.updateComponent(target, "status", undefined, hostId).then(async value => {
      if (generation.current !== id) return;
      setStatus(value);
      const elapsed = Date.now() - Date.parse(value.checked_at ?? "");
      if (["idle", "completed", "failed"].includes(value.phase) && (!Number.isFinite(elapsed) || elapsed > 4 * 60 * 60 * 1000)) {
        const checked = await api.updateComponent(target, "check", undefined, hostId);
        if (generation.current === id) setStatus(checked);
      }
    }).catch(err => { if (generation.current === id) setError(String(err instanceof Error ? err.message : err)); })
      .finally(() => { if (generation.current === id) setBusy(false); });
    return () => { generation.current++; };
  }, [api, target, hostId]);
  useEffect(() => {
    const finished = wasUpdating.current && !updating;
    wasUpdating.current = updating;
    if (!finished) return;
    let stopped = false;
    void api.updateComponent(target, "status", undefined, hostId).then(value => {
      if (!stopped) setStatus(value);
    }).catch(() => {});
    return () => { stopped = true; };
  }, [api, target, hostId, updating]);
  useEffect(() => {
    if (!active || updating) return;
    const id = generation.current;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await api.updateComponent(target, "status", undefined, hostId);
        if (!stopped && generation.current === id) {
          setStatus(value); setError("");
        }
      } catch { if (!stopped && generation.current === id) setError(t("updates.reconnecting")); }
      if (!stopped) timer = setTimeout(poll, 2000);
    };
    timer = setTimeout(poll, 2000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [api, target, hostId, active, updating]);

  async function perform(action: UpdateAction, channel?: UpdateChannel) {
    if (inFlight.current || runningUpdates.has(updateKey)) return;
    if (action === "apply" && target === "client" && kind === "desktop" && !window.dispatchEvent(new Event("zotigo:before-update", {cancelable: true}))) {
      if (!window.confirm(t("updates.unsaved"))) return;
    }
    const id = generation.current;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      if (action === "prepare") markUpdate(updateKey, true);
      let value = await api.updateComponent(target, action, channel, hostId);
      if (action === "prepare") {
        // Keep the explicit destination and request alive when this card unmounts.
        while (value.phase === "preparing") {
          if (generation.current === id) setStatus(value);
          await new Promise(resolve => setTimeout(resolve, 2000));
          value = await api.updateComponent(target, "status", undefined, hostId);
        }
        if (value.phase === "ready") {
          const canRestart = target !== "client" || kind !== "desktop"
            || window.dispatchEvent(new Event("zotigo:before-update", {cancelable: true}))
            || window.confirm(t("updates.unsaved"));
          if (canRestart) value = await api.updateComponent(target, "apply", undefined, hostId);
        }
      }
      if (generation.current !== id) return;
      setStatus(value);
      if (action === "channel") {
        value = await api.updateComponent(target, "check", undefined, hostId);
        if (generation.current === id) setStatus(value);
      }
    } catch (err) { if (generation.current === id) setError(err instanceof Error ? err.message : String(err)); }
    finally {
      if (action === "prepare") markUpdate(updateKey, false);
      if (generation.current === id) { inFlight.current = false; setBusy(false); }
    }
  }

  const canCancel = status?.phase === "waiting" && target === "daemon";
  const action: UpdateAction = canCancel ? "cancel" : status?.phase === "ready" ? "apply" : status?.target ? "prepare" : status ? "check" : "status";
  const buttonText = canCancel ? t("updates.cancel") : active ? t(`updates.phase.${status!.phase}`) : status?.phase === "ready" || status?.target ? t("updates.now") : t("updates.check");
  return <section className="settings-section">
    <h2>{title}</h2>
    {address && <p className="settings-host-address">{address}</p>}
    <div className="settings-card">
      {status && <>
        <div className="settings-row"><span><strong>{status.version}</strong><small>{status.commit.slice(0, 12)}{status.custom ? ` · ${t("updates.custom")}` : ""}</small></span></div>
        <label className="settings-row"><span><strong>{t("updates.channel")}</strong><small>{t("updates.channelHelp")}</small></span>
          <select aria-label={`${title} · ${t("updates.channel")}`} value={status.channel} disabled={busy || updating || active || status.phase === "ready"} onChange={e => void perform("channel", e.target.value as UpdateChannel)}>
            <option value="stable">{t("updates.stable")}</option><option value="development">{t("updates.development")}</option>
          </select>
        </label>
        <div className="settings-row"><span aria-live="polite"><strong>{status.phase === "idle" && status.checked_at ? t("updates.checked") : t(`updates.phase.${status.phase}`)}</strong>
          <small>{status.target ? t("updates.available", { version: status.target.version }) : status.checked_at ? t("updates.latest") : t("updates.unchecked")}</small>
          {target === "daemon" && <small>{t("updates.daemonHelp")}</small>}
        </span>
        </div>
      </>}
      <div className="settings-row"><button className="settings-secondary-button" disabled={busy || updating || (!!active && !canCancel)} onClick={() => void perform(action)}>{buttonText}</button></div>
    </div>
    {(error || status?.error) && <p role="alert">{error || status?.error}</p>}
    {!status && error && <p>{t("updates.statusUnavailable")}</p>}
  </section>;
}
