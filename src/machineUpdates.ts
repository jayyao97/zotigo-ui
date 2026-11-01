import type { HostProfile } from "../shared/hosts";
import type { ClientApi } from "../shared/clientTypes";
import type { UpdateStatus } from "../shared/updates";
import { t } from "../shared/i18n";

export interface UpdateMachine { id: string; host?: HostProfile; includeClient: boolean; }

// The default connection can point at a remote daemon in Desktop installations.
// Only a loopback default endpoint is known to share the client's machine.
export function updateMachines(hosts: HostProfile[]): UpdateMachine[] {
  const local = hosts.find(host => host.id === "local");
  const sharesMachine = local && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(local.baseUrl).hostname);
  return [
    {id:"local",host:sharesMachine ? local : undefined,includeClient:true},
    ...hosts.filter(host => host !== (sharesMachine ? local : undefined)).map(host => ({
      id:host.id === "local" ? "daemon:local" : host.id,host,includeClient:false,
    })),
  ];
}

// Jobs belong to the client window, so settings navigation does not abandon them.
export const runningUpdates = new Set<string>();
const listeners = new Set<() => void>();
export function subscribeUpdates(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function markUpdate(key: string, running: boolean) {
  if (running) runningUpdates.add(key); else runningUpdates.delete(key);
  for (const listener of listeners) listener();
}
export interface MachineJob { running: boolean; error?: string; completed?: boolean; }
const jobs = new Map<string, MachineJob>();
export const machineJob = (hostId: string) => jobs.get(hostId);
function publish(hostId: string, job: MachineJob) {
  jobs.set(hostId, job);
  for (const listener of listeners) listener();
}
const active = (s: UpdateStatus) => ["preparing", "waiting", "applying", "verifying"].includes(s.phase);

export async function updateMachine(api: ClientApi, machine: UpdateMachine, beforeClientApply: () => boolean,
  pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 2000))) {
  const hostId = machine.host?.id;
  const targets: Array<"daemon" | "client"> = [...(machine.host ? ["daemon" as const] : []), ...(machine.includeClient ? ["client" as const] : [])];
  const key = (target: string) => `${target}:${target === "daemon" ? hostId : "client"}`;
  if (targets.some(target => runningUpdates.has(key(target)))) return;
  for (const target of targets) markUpdate(key(target), true);
  publish(machine.id, {running:true});
  let current: "daemon" | "client" = "daemon";
  const request = (target: "daemon" | "client", action: "status" | "prepare" | "apply") =>
    api.updateComponent(target, action, undefined, target === "daemon" ? hostId : undefined);
  async function poll(target: "daemon" | "client", done: (s: UpdateStatus) => boolean) {
    let failures = 0;
    while (true) {
      await pause();
      let value: UpdateStatus;
      try { value = await request(target, "status"); failures = 0; }
      catch (error) { if (++failures >= 60) throw error; continue; }
      if (done(value)) return value;
    }
  }
  try {
    const prepared = new Map<"daemon" | "client", UpdateStatus>();
    // Read every member before preparing any: an unavailable module blocks the batch.
    for (const target of targets) {
      current = target;
      const value = await request(target,"status");
      if (active(value)) throw new Error(t("updates.alreadyRunning"));
      prepared.set(target,value);
    }
    for (const target of targets) {
      current = target;
      let value = prepared.get(target)!;
      if (!value.target && value.phase !== "ready") continue;
      if (value.phase !== "ready") value = await request(target,"prepare");
      if (value.phase === "preparing") value = await poll(target, s => s.phase !== "preparing");
      if (value.phase !== "ready" || !value.target) throw new Error(value.error || t("updates.notPrepared"));
      prepared.set(target,value);
    }
    // Updater completion follows version/PID/authenticated health verification.
    // Every release also passes the updater's API/data epoch compatibility checks.
    for (const target of targets) {
      current = target;
      const ready = prepared.get(target)!;
      if (ready.phase !== "ready") continue;
      if (target === "client" && !beforeClientApply()) throw new Error(t("updates.restartCancelled"));
      let value: UpdateStatus;
      try { value = await request(target,"apply"); }
      catch { value = await poll(target, s => !active(s)); }
      if (active(value)) value = await poll(target, s => !active(s));
      if (value.phase !== "completed" || value.version !== ready.target!.version || value.commit !== ready.target!.commit) {
        throw new Error(value.error || t("updates.notCompleted"));
      }
    }
    publish(machine.id,{running:false,completed:true});
  } catch (error) {
    publish(machine.id,{running:false,error:t("updates.batchFailed",{component:current === "daemon" ? "Daemon" : t("updates.client"),error:error instanceof Error ? error.message : String(error)})});
  } finally {
    for (const target of targets) markUpdate(key(target),false);
  }
}
