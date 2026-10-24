import { useEffect, useId, useRef, useState } from "react";
import { Pencil, Plus, Server, Trash2, X } from "lucide-react";
import type { ClientApi } from "../shared/clientTypes";
import type { HostProfile } from "../shared/hosts";
import { t } from "../shared/i18n/index";
import { useLocale } from "./i18n";

export function HostSettings({ api, kind, profiles, selected, busy, status: initialStatus, onProfiles, onClose, beforeChange, onDiscard }: {
  api: ClientApi; kind: "desktop" | "web"; profiles: HostProfile[]; selected: string; busy: boolean; status: string;
  onProfiles: (profiles: HostProfile[]) => void; onClose: () => void;
  beforeChange: (id: string) => Promise<boolean>; onDiscard: (id: string) => void;
}) {
  useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<{ kind: "list" } | { kind: "form"; host: HostProfile | null } | { kind: "delete"; host: HostProfile }>({ kind: "list" });
  const editing = view.kind === "form" ? view.host : null;
  const deleting = view.kind === "delete" ? view.host : null;
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const disabled = busy || working;
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { setStatus(initialStatus); }, [initialStatus]);
  useEffect(() => { if (view.kind !== "list") heading.current?.focus(); }, [view.kind]);
  function reset() { setView({ kind: "list" }); setName(""); setAddress(""); setToken(""); setClearToken(false); setStatus(""); }
  function openForm(host: HostProfile | null) { setView({ kind: "form", host }); setName(host?.name ?? ""); setAddress(host?.baseUrl ?? ""); setToken(""); setClearToken(false); setStatus(""); }
  function dismiss() { if (view.kind === "list") onClose(); else reset(); }
  async function run(action: () => Promise<void>) {
    setWorking(true); setStatus("");
    try { await action(); } catch (cause) { setStatus(cause instanceof Error ? cause.message : String(cause)); }
    finally { setWorking(false); }
  }
  async function prepare(id: string) {
    if (await beforeChange(id)) return true;
    setStatus(t("hostShell.switchRequired"));
    return false;
  }
  const title = deleting ? t("hostShell.deleteHost") : view.kind === "form" ? editing ? t("hostShell.editHost", { name: editing.name }) : t("hostShell.addHost") : t("hostShell.hosts");
  return <dialog ref={dialog} className={`host-settings${deleting ? " host-settings-confirm" : ""}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!disabled) dismiss(); }}>
    <header><div><h2 id={titleId} ref={heading} tabIndex={-1}>{title}</h2>{view.kind === "list" && <p>{kind === "web" ? t("hostShell.savedOnThisWebServerAndSharedWith") : t("hostShell.savedOnThisDevice")}</p>}</div><button disabled={disabled} aria-label={view.kind === "list" ? t("hostShell.closeSettings") : t("app.cancel")} onClick={dismiss}><X size={18} /></button></header>
    {view.kind === "list" && <>
    <div className="host-settings-list">{profiles.map((host) => <div key={host.id} className="host-settings-row">
      <Server size={18} /><div><strong>{host.name}{host.id === selected && <small>{t("hostShell.currentHost")}</small>}</strong><small>{host.baseUrl}</small>{host.id === "local" && <small>{t("hostShell.builtInHost")}</small>}</div>
      <button disabled={disabled} onClick={() => void run(async () => { await api.testHost(host.id); setStatus(t("host.connected", { host: host.name })); })}>{t("hostShell.test")}</button>
      <button disabled={disabled || host.id === "local"} title={host.id === "local" ? t("hostShell.builtInHost") : t("hostShell.editHost", { name: host.name })} aria-label={t("hostShell.editHost", { name: host.name })} onClick={() => openForm(host)}><Pencil size={15} /></button>
      <button disabled={disabled || host.id === "local"} title={host.id === "local" ? t("hostShell.builtInHost") : t("app.remove", { p0: host.name })} aria-label={t("app.remove", { p0: host.name })} onClick={() => { setView({ kind: "delete", host }); setStatus(""); }}><Trash2 size={15} /></button>
    </div>)}</div>
      {status && <p role="status">{status}</p>}
      <footer><button disabled={disabled} onClick={() => openForm(null)}><Plus size={15} />{t("hostShell.addHost")}</button></footer>
    </>}
    {deleting && <>
      <p className="host-delete-copy">{t("hostShell.deleteConfirmation", { name: deleting.name })}</p>
      {deleting.id === selected && <p>{t("hostShell.switchBeforeChange")}</p>}
      {status && <p role="status">{status}</p>}
      <footer>
        <button disabled={disabled} onClick={reset}>{t("app.cancel")}</button>
        <button className="host-delete-action" disabled={disabled} onClick={() => void run(async () => {
          if (!await prepare(deleting.id)) return;
          await api.deleteHost(deleting.id); onDiscard(deleting.id);
          onProfiles(await api.listHosts()); reset();
        })}>{t("hostShell.deleteHost")}</button>
      </footer>
    </>}
    {view.kind === "form" && <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
      const connectionChanged = editing && (new URL(address).origin !== editing.baseUrl || !!token || clearToken);
      if (connectionChanged && !await prepare(editing.id)) return;
      await api.saveHost({ id: editing?.id, name, baseUrl: address, token: clearToken ? "" : editing && !token ? undefined : token });
      if (connectionChanged) onDiscard(editing.id);
      onProfiles(await api.listHosts()); reset(); setStatus(t("hostShell.hostSavedTestTheConnectionOrSelectIt"));
    }); }}>
      {editing?.id === selected && <p>{t("hostShell.switchBeforeEdit")}</p>}
      <label>{t("hostShell.name")}<input disabled={disabled} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("hostShell.dev")} required maxLength={100} /></label>
      <label>{t("hostShell.daemonAddress")}<input disabled={disabled} value={address} onChange={(event) => setAddress(event.target.value)} placeholder={t("host.urlExample")} required /></label>
      <label>{t("hostShell.daemonToken")}<input disabled={disabled || clearToken} type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="new-password" placeholder={editing?.hasToken ? t("hostShell.keepToken") : undefined} /></label>
      {editing?.hasToken && <label className="host-token-clear"><input disabled={disabled} type="checkbox" checked={clearToken} onChange={(event) => setClearToken(event.target.checked)} />{t("hostShell.clearToken")}</label>}
      <small>{t("hostShell.useHttpsOutsideATrustedNetwork")}</small>
      {status && <p role="status">{status}</p>}
      <footer>
        <button disabled={disabled} type="button" onClick={reset}>{t("app.cancel")}</button>
        <button disabled={disabled} type="submit">{t("hostShell.saveHost")}</button>
      </footer>
    </form>}
  </dialog>;
}
