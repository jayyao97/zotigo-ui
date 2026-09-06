import { bindClientGeneration } from "../shared/bindClientGeneration";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Server, Settings, Trash2, X } from "lucide-react";
import App from "./App";
import { DirectoryBrowser } from "./DirectoryBrowser";
import { ClientContext, useClient } from "./ClientContext";
import type { HostProfile } from "../shared/hosts";
import type { SourceCandidate } from "../shared/clientTypes";

const HostContext = createContext<{ profiles: HostProfile[]; selected: string; busy: boolean; switchHost(id: string): void; settings(): void } | null>(null);

export function HostMenu() {
  const hosts = useContext(HostContext);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: globalThis.MouseEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("click", close); return () => document.removeEventListener("click", close);
  }, [open]);
  if (!hosts) return null;
  return <div className="host-menu" ref={container} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <button className="brand-button" aria-label="Switch host" aria-expanded={open} onClick={() => setOpen(!open)} disabled={hosts.busy}>
      <span>{hosts.profiles.find((host) => host.id === hosts.selected)?.name ?? "Zotigo"}</span><ChevronDown size={13} />
    </button>
    {open && <div className="host-menu-popover">
      <div className="search-palette-heading">Hosts</div>
      {hosts.profiles.map((host) => <button key={host.id} onClick={() => { setOpen(false); hosts.switchHost(host.id); }}><Server size={15} /><span>{host.name}</span>{host.id === hosts.selected && <Check size={14} />}</button>)}
      <button onClick={() => { setOpen(false); hosts.settings(); }}><Settings size={15} /><span>Host settings</span></button>
    </div>}
  </div>;
}

export function HostShell() {
  const parent = useClient(); const api = parent.api;
  const [profiles, setProfiles] = useState<HostProfile[]>([]);
  const [selected, setSelected] = useState("local");
  const [generation, setGeneration] = useState(0);
  const generationRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [name, setName] = useState(""); const [address, setAddress] = useState(""); const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [picker, setPicker] = useState(false);
  const pickerResult = useRef<((value: SourceCandidate[]) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const storage = parent.kind === "web" ? sessionStorage : localStorage;
  useEffect(() => {
    let active = true;
    void api.listHosts().then(async (list) => {
      let saved = "local"; try { saved = storage.getItem("zotigo.host") ?? "local"; } catch { /* In-memory selection still works. */ }
      if (!list.some((host) => host.id === saved)) saved = "local";
      await api.setActiveHost(saved);
      if (active) { setProfiles(list); setSelected(saved); setReady(true); }
    }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; pickerResult.current?.([]); };
  }, [api, storage]);
  useEffect(() => { if (settings) dialog.current?.showModal(); }, [settings]);
  const client = useMemo(() => bindClientGeneration({ ...api,
    chooseSourceFolders: () => new Promise<SourceCandidate[]>((resolve) => { pickerResult.current?.([]); pickerResult.current = resolve; setPicker(true); }),
    revealPath: selected === "local" ? api.revealPath : async (value: string) => { await navigator.clipboard.writeText(value); },
    getDaemonConfig: async () => { const config = await api.getDaemonConfig(); const url = new URL(config.baseUrl); url.searchParams.set("zotigoHost", selected); return { ...config, baseUrl: url.toString() }; },
  }, () => generationRef.current === generation), [api, selected, generation]);
  async function switchHost(id: string) {
    if (busy || id === selected) return;
    setBusy(true); setError("");
    try {
      await api.testHost(id);
      if (!window.dispatchEvent(new Event("zotigo:before-host-switch", { cancelable: true }))) return;
      await api.unsubscribeSessionEvents();
      generationRef.current++;
      await api.setActiveHost(id);
      setSelected(id); setGeneration(generationRef.current);
      try { storage.setItem("zotigo.host", id); } catch { /* In-memory selection still works. */ }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not connect to host."); }
    finally { setGeneration(generationRef.current); setBusy(false); }
  }
  function closePicker(values: SourceCandidate[]) { setPicker(false); pickerResult.current?.(values); pickerResult.current = null; }
  return <HostContext.Provider value={{ profiles, selected, busy, switchHost: (id) => void switchHost(id), settings: () => { setStatus(""); setSettings(true); void api.listHosts().then(setProfiles).catch((cause: Error) => setStatus(cause.message)); } }}>
    <ClientContext.Provider value={{ ...parent, api: client, remote: selected !== "local" }}>
      {ready ? <div style={{ display: "contents" }} inert={busy}><App key={`${selected}:${generation}`} /></div> : <main className="web-login"><p>{error || "Loading hosts…"}</p></main>}
    </ClientContext.Provider>
    {error && ready && <div className="host-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div>}
    {settings && <dialog ref={dialog} className="host-settings" onCancel={() => setSettings(false)}>
      <header><div><h2>Hosts</h2><p>{parent.kind === "web" ? "Saved on this Web server and shared with its signed-in clients." : "Saved on this device."}</p></div><button aria-label="Close settings" onClick={() => setSettings(false)}><X size={18} /></button></header>
      <div className="host-settings-list">{profiles.map((host) => <div key={host.id} className="host-settings-row"><Server size={18} /><div><strong>{host.name}</strong><small>{host.baseUrl}</small></div><button disabled={busy} onClick={() => { setBusy(true); setStatus(""); void api.testHost(host.id).then(() => setStatus(`${host.name}: connected`)).catch((cause: Error) => setStatus(cause.message)).finally(() => setBusy(false)); }}>Test</button><button aria-label={`Remove ${host.name}`} disabled={busy || host.id === "local" || host.id === selected} onClick={() => { setBusy(true); void api.deleteHost(host.id).then(() => api.listHosts()).then(setProfiles).catch((cause: Error) => setStatus(cause.message)).finally(() => setBusy(false)); }}><Trash2 size={15} /></button></div>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setStatus(""); void api.saveHost({ name, baseUrl: address, token }).then(() => api.listHosts()).then((list) => { setProfiles(list); setName(""); setAddress(""); setToken(""); setStatus("Host saved. Test the connection or select it from the host menu."); }).catch((cause: Error) => setStatus(cause.message)).finally(() => setBusy(false)); }}>
        <h3>Add host</h3><label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="dev" required maxLength={100} /></label>
        <label>Daemon address<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="http://10.36.6.135:8766" required /></label>
        <label>Daemon token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="new-password" /></label>
        <small>Use HTTPS outside a trusted network. </small>
        <button disabled={busy} type="submit"><Plus size={15} />Save host</button>
      </form>{status && <p role="status">{status}</p>}
    </dialog>}
    {picker && <DirectoryBrowser api={client} purpose="sources" title={`Choose folders on ${profiles.find((host) => host.id === selected)?.name}`} onClose={() => closePicker([])} onSelect={async (paths) => {
      const sources = await client.inspectHostSources(paths);
      closePicker(sources);
    }} />}

  </HostContext.Provider>;
}
