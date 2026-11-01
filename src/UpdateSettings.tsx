import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useClient } from "./ClientContext";
import { t } from "../shared/i18n";
import type { UpdateAction, UpdateChannel, UpdateStatus } from "../shared/updates";
import type { ClientApi } from "../shared/clientTypes";
import type { HostProfile } from "../shared/hosts";

import { runningUpdates, subscribeUpdates, markUpdate, machineJob, updateMachine, updateMachines, type UpdateMachine } from "./machineUpdates";

export function UpdateSettings({ hosts, api }: { hosts: HostProfile[]; api: ClientApi }) {
  const { kind } = useClient();
  const [selected, setSelected] = useState("local");
  const machines = updateMachines(hosts);
  const current = machines.find(machine => machine.id === selected) ?? machines[0];
  const machineName = (machine: UpdateMachine) => machine.includeClient ? t(kind === "desktop" ? "settings.thisComputer" : "settings.servingHost") : machine.host!.id === "local" ? t("updates.defaultDaemon") : machine.host!.name;
  useEffect(() => { if (current && current.id !== selected) setSelected(current.id); }, [current?.id, selected]);
  return <>
    <label className="settings-row settings-host-picker"><span><strong>{t("updates.target")}</strong><small>{current?.host?.baseUrl}</small></span>
      <select aria-label={t("updates.target")} value={current?.id ?? ""} onChange={event => setSelected(event.target.value)}>
        {machines.map(machine => <option key={machine.id} value={machine.id}>{machineName(machine)}</option>)}
      </select>
    </label>
    <h1>{t("updates.title")}</h1>
    {machines.map(machine => <div key={machine.id} hidden={machine.id !== current?.id}>
      <MachineUpdates api={api} machine={machine} name={machineName(machine)}/>
    </div>)}
  </>;
}

interface CardState { status?: UpdateStatus; busy: boolean; error: string; }
function MachineUpdates({api,machine,name}: {api:ClientApi;machine:UpdateMachine;name:string}) {
  const {kind} = useClient();
  const [cards,setCards] = useState<Record<string,CardState>>({});
  const report = useCallback((target: string, state: CardState) => setCards(value=>({...value,[target]:state})),[]);
  const job = useSyncExternalStore(subscribeUpdates,()=>machineJob(machine.id));
  const targets = [...(machine.host ? ["daemon"] : []), ...(machine.includeClient ? ["client"] : [])];
  const available = targets.every(target => cards[target]?.status && !cards[target].busy && !cards[target].error
    && !["preparing","waiting","applying","verifying"].includes(cards[target].status!.phase));
  const hasUpdate = targets.some(target => cards[target]?.status?.target || cards[target]?.status?.phase === "ready");
  const confirmRestart = () => kind !== "desktop" || window.dispatchEvent(new Event("zotigo:before-update",{cancelable:true})) || window.confirm(t("updates.unsaved"));
  return <>
    <div className="settings-row"><span><strong>{t("updates.machineHelp")}</strong>{targets.length > 1 && <small>{t("updates.partialHelp")}</small>}</span>
      <button className="settings-secondary-button" disabled={!available || !hasUpdate || job?.running} onClick={()=>void updateMachine(api,machine,confirmRestart)}>{t(job?.running ? "updates.updatingAll" : "updates.all")}</button>
    </div>
    {job?.error && <p role="alert">{job.error}</p>}
    {job?.completed && <p role="status">{t("updates.allCompleted")}</p>}
    {machine.host && <UpdateCard api={api} target="daemon" hostId={machine.host.id} machineId={machine.id} title={t("updates.daemon",{host:name})} onState={report}/>}
    {machine.includeClient && <UpdateCard api={api} target="client" machineId={machine.id} title={t(kind === "desktop" ? "updates.desktop" : "updates.web")} onState={report}/>}
  </>;
}

function UpdateCard({ api, target, title, hostId, machineId, onState }: { api: ClientApi; target: "client" | "daemon"; title: string; hostId?: string; machineId: string; onState: (target: string, state: CardState) => void }) {
  const { kind } = useClient();
  const [status, setStatus] = useState<UpdateStatus>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const updateKey = `${target}:${hostId ?? "client"}`;
  const updating = useSyncExternalStore(subscribeUpdates, () => runningUpdates.has(updateKey));
  const machineRunning = useSyncExternalStore(subscribeUpdates,()=>machineJob(machineId)?.running);
  const wasUpdating = useRef(updating);
  const inFlight = useRef(false);
  useEffect(() => onState(target,{status,busy:busy || updating,error}),[onState,target,status,busy,updating,error]);
  const active = status && ["preparing", "waiting", "applying", "verifying"].includes(status.phase);
  useEffect(() => {
    const id = ++generation.current;
    inFlight.current = false;
    setStatus(undefined); setError(""); setBusy(true);
    void api.updateComponent(target, "status", undefined, hostId).then(async value => {
      if (generation.current !== id) return;
      setStatus(value);
      const elapsed = Date.now() - Date.parse(value.checked_at ?? "");
      if (!runningUpdates.has(updateKey) && ["idle", "completed", "failed"].includes(value.phase) && (!Number.isFinite(elapsed) || elapsed > 4 * 60 * 60 * 1000)) {
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
      if (!stopped) { setStatus(value); setError(""); }
    }).catch(() => {});
    return () => { stopped = true; };
  }, [api, target, hostId, updating]);
  useEffect(() => {
    if ((!active && !machineRunning) || (updating && !machineRunning)) return;
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
  }, [api, target, hostId, active, updating, machineRunning]);

  async function perform(action: UpdateAction, channel?: UpdateChannel) {
    if (inFlight.current || (runningUpdates.has(updateKey) && action !== "cancel")) return;
    if (action === "apply" && target === "client" && kind === "desktop" && !window.dispatchEvent(new Event("zotigo:before-update", {cancelable: true}))) {
      if (!window.confirm(t("updates.unsaved"))) return;
    }
    const id = generation.current;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      if (action !== "cancel") markUpdate(updateKey, true);
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
      if (action !== "cancel") markUpdate(updateKey, false);
      if (generation.current === id) { inFlight.current = false; setBusy(false); }
    }
  }

  const canCancel = status?.phase === "waiting" && target === "daemon";
  const action: UpdateAction = canCancel ? "cancel" : status?.phase === "ready" ? "apply" : status?.target ? "prepare" : status ? "check" : "status";
  const buttonText = canCancel ? t("updates.cancel") : active ? t(`updates.phase.${status!.phase}`) : status?.phase === "ready" || status?.target ? t("updates.now") : t("updates.check");
  return <section className="settings-section">
    <h2>{title}</h2>
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
      <div className="settings-row"><button className="settings-secondary-button" disabled={busy || (updating && !canCancel) || (!!active && !canCancel)} onClick={() => void perform(action)}>{buttonText}</button></div>
    </div>
    {(error || status?.error) && <p role="alert">{error || status?.error}</p>}
    {!status && error && <p>{t("updates.statusUnavailable")}</p>}
  </section>;
}
