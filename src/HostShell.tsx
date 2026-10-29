import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import { useTranslationLanguage, useTranslationProfile } from "./translationLanguage";
import { useDefaultSendMode } from "./sendMode";
import { ModelFavoritesProvider } from "./modelFavorites";
import { ToastProvider } from "./Toast";
import { bindClientGeneration } from "../shared/bindClientGeneration";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Server, Settings, X } from "lucide-react";
import App, { discardHostVolatileState } from "./App";
import { DirectoryBrowser } from "./DirectoryBrowser";
import { ClientContext, useClient } from "./ClientContext";
import { HostSettings } from "./HostSettings";
import { SettingsPage } from "./SettingsPage";
import { parseThinkingDisplayMode, thinkingDisplayStorageKey, type ThinkingDisplayMode } from "./thinkingDisplay";
import type { AgentCatalogEntry } from "../shared/zotigod";
import type { HostProfile } from "../shared/hosts";
import type { SourceCandidate } from "../shared/clientTypes";

const HostContext = createContext<{ profiles: HostProfile[]; selected: string; busy: boolean; switchHost(id: string): void; settings(): void } | null>(null);

export function HostMenu() {
  useLocale();
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
    <button className="brand-button" aria-label={t("hostShell.switchHost")} aria-expanded={open} onClick={() => setOpen(!open)} disabled={hosts.busy}>
      <span>{hosts.profiles.find((host) => host.id === hosts.selected)?.name ?? t("app.zotigo")}</span><ChevronDown size={13} />
    </button>
    {open && <div className="host-menu-popover">
      <div className="search-palette-heading">{t("hostShell.hosts")}</div>
      {hosts.profiles.map((host) => <button key={host.id} onClick={() => { setOpen(false); hosts.switchHost(host.id); }}><Server size={15} /><span>{host.name}</span>{host.id === hosts.selected && <Check size={14} />}</button>)}
      <button onClick={() => { setOpen(false); hosts.settings(); }}><Settings size={15} /><span>{t("hostShell.settings")}</span></button>
    </div>}
  </div>;
}

export function HostShell() {
  useLocale();
  const parent = useClient(); const api = parent.api;
  const [profiles, setProfiles] = useState<HostProfile[]>([]);
  const [selected, setSelected] = useState("local");
  const [generation, setGeneration] = useState(0);
  const [newSessionGeneration, setNewSessionGeneration] = useState<number | null>(null);
  const generationRef = useRef(0);
  const [refreshedCodex, setRefreshedCodex] = useState<{ host: string; catalog: AgentCatalogEntry } | null>(null);
  const onCodexRefresh = useCallback((catalog: AgentCatalogEntry) => setRefreshedCodex({ host: selected, catalog }), [selected]);
  const [catalogSyncRevision, setCatalogSyncRevision] = useState(0);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [catalogSyncStatus, setCatalogSyncStatus] = useState("");
  const [catalogSyncError, setCatalogSyncError] = useState("");
  const catalogSyncInFlight = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [surface, setSurface] = useState<"workbench" | "settings">("workbench");
  const [modelSetup, setModelSetup] = useState(false);
  const [hostSettingsOpen, setHostSettingsOpen] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useTranslationLanguage(selected);
  const [translationProfile, setTranslationProfile] = useTranslationProfile(selected);
  const [defaultSendMode, setDefaultSendMode] = useDefaultSendMode(selected);
  const [thinkingDisplay, setThinkingDisplay] = useState<ThinkingDisplayMode>(() => {
    try { return parseThinkingDisplayMode(localStorage.getItem(thinkingDisplayStorageKey)); }
    catch { return "expanded"; }
  });
  const [status, setStatus] = useState("");
  const [picker, setPicker] = useState(false);
  const pickerResult = useRef<((value: SourceCandidate[]) => void) | null>(null);
  const storage = parent.kind === "web" ? sessionStorage : localStorage;
  useEffect(() => {
    let active = true;
    void api.listHosts().then(async (list) => {
      let saved = "local"; try { saved = storage.getItem("zotigo.host") ?? "local"; } catch { /* In-memory selection still works. */ }
      if (!list.some((host) => host.id === saved)) saved = "local";
      await api.setActiveHost(saved);
      if (active) { setProfiles(list); setSelected(saved); setReady(true); }
    }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => {
      active = false;
      pickerResult.current?.([]);
      if (parent.kind === "web") discardHostVolatileState();
    };
  }, [api, parent.kind, storage]);
  useEffect(() => {
    const openSettings = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "," && !event.shiftKey && !event.altKey && !event.isComposing) {
        event.preventDefault();
        setSurface("settings");
      }
    };
    window.addEventListener("keydown", openSettings);
    return () => window.removeEventListener("keydown", openSettings);
  }, []);
  const client = useMemo(() => bindClientGeneration({ ...api,
    chooseSourceFolders: () => new Promise<SourceCandidate[]>((resolve) => { pickerResult.current?.([]); pickerResult.current = resolve; setPicker(true); }),
    revealPath: selected === "local" ? api.revealPath : async (value: string) => { await navigator.clipboard.writeText(value); },
    getDaemonConfig: async () => { const config = await api.getDaemonConfig(); const url = new URL(config.baseUrl); url.searchParams.set("zotigoHost", selected); return { ...config, baseUrl: url.toString() }; },
  }, () => generationRef.current === generation), [api, selected, generation]);
  async function switchHost(id: string) {
    if (busy || catalogSyncInFlight.current) return false;
    if (id === selected) return true;
    setBusy(true); setError("");
    let prepared = false;
    try {
      await api.testHost(id);
      if (!window.dispatchEvent(new Event("zotigo:before-host-switch", { cancelable: true }))) return false;
      prepared = true;
      await api.unsubscribeSessionEvents();
      await api.unsubscribeFileEvents();
      generationRef.current++;
      await api.setActiveHost(id);
      setRefreshedCodex(null); setCatalogSyncStatus(""); setCatalogSyncError(""); setSelected(id); setGeneration(generationRef.current); setNewSessionGeneration(generationRef.current);
      try { storage.setItem("zotigo.host", id); } catch { /* In-memory selection still works. */ }
      return true;
    } catch (cause) {
      if (prepared) window.dispatchEvent(new Event("zotigo:host-switch-cancelled"));
      setError(cause instanceof Error ? cause.message : t("hostShell.couldNotConnectToHost"));
      return false;
    }
    finally { setGeneration(generationRef.current); setBusy(false); }
  }
  async function syncCatalog() {
    if (busy || catalogSyncInFlight.current) return;
    catalogSyncInFlight.current = true;
    setSyncingCatalog(true); setCatalogSyncStatus(""); setCatalogSyncError("");
    try {
      if (!client.syncDesktopState) throw new Error(t("hostShell.sessionSyncIsUnavailableOnThisClient"));
      await client.syncDesktopState();
      setCatalogSyncRevision((revision) => revision + 1);
      setCatalogSyncStatus(t("hostShell.sessionsSynced"));
    } catch (cause) {
      setCatalogSyncError(cause instanceof Error ? cause.message : t("hostShell.couldNotSyncSessions"));
    } finally {
      catalogSyncInFlight.current = false; setSyncingCatalog(false);
    }
  }
  function openHostSettings() {
    setStatus("");
    setHostSettingsOpen(true);
    void api.listHosts().then(setProfiles).catch((cause: Error) => setStatus(cause.message));
  }
  function updateThinkingDisplay(mode: ThinkingDisplayMode) {
    setThinkingDisplay(mode);
    try { localStorage.setItem(thinkingDisplayStorageKey, mode); } catch { /* In-memory preference still works. */ }
  }
  function closePicker(values: SourceCandidate[]) { setPicker(false); pickerResult.current?.(values); pickerResult.current = null; }
  return <HostContext.Provider value={{ profiles, selected, busy: busy || syncingCatalog, switchHost: (id) => void switchHost(id), settings: () => setSurface("settings") }}>
    <ClientContext.Provider value={{ ...parent, api: client, remote: selected !== "local" }}>
      {ready ? <ToastProvider key={selected}><ModelFavoritesProvider host={selected}>
        <div style={{ display: surface === "workbench" ? "contents" : "none" }} inert={busy || surface !== "workbench"}>
          <App onConfigureModels={() => { setModelSetup(true); setSurface("settings"); }} defaultSendMode={defaultSendMode} surfaceActive={surface === "workbench" && !busy} catalogSyncRevision={catalogSyncRevision} refreshedCodex={refreshedCodex?.host === selected ? refreshedCodex.catalog : undefined} key={`${selected}:${generation}`} clientScope={selected} hostName={profiles.find((host) => host.id === selected)?.name ?? selected} thinkingDisplay={thinkingDisplay} translationLanguage={translationLanguage} translationProfile={translationProfile} openNewSessionOnMount={generation === newSessionGeneration} />
        </div>
        {surface === "settings" && <SettingsPage
          initialPage={modelSetup ? "models" : "general"}
          key={selected}
          onSync={() => void syncCatalog()}
          syncing={syncingCatalog || busy}
          syncStatus={catalogSyncStatus}
          syncError={catalogSyncError}
          onCodexRefresh={onCodexRefresh}
          hostName={profiles.find((host) => host.id === selected)?.name ?? selected}
          thinkingDisplay={thinkingDisplay}
          translationLanguage={translationLanguage}
          defaultSendMode={defaultSendMode}
          onDefaultSendModeChange={setDefaultSendMode}
          onTranslationLanguageChange={setTranslationLanguage}
          translationProfile={translationProfile}
          onTranslationProfileChange={setTranslationProfile}
          onThinkingDisplayChange={updateThinkingDisplay}
          onManageHosts={openHostSettings}
          onBack={() => { setModelSetup(false); setSurface("workbench"); }}
        />}
      </ModelFavoritesProvider></ToastProvider> : <main className="web-login"><p>{error || t("hostShell.loadingHosts")}</p></main>}
    </ClientContext.Provider>
    {error && ready && <div className="host-error" role="alert">{error}<button onClick={() => setError("")} aria-label={t("hostShell.dismissError")}><X size={14} /></button></div>}
    {hostSettingsOpen && <HostSettings api={api} kind={parent.kind} profiles={profiles} selected={selected} busy={busy || syncingCatalog} status={status} onProfiles={setProfiles} onClose={() => setHostSettingsOpen(false)} beforeChange={async (id) => id !== selected || await switchHost("local")} onDiscard={discardHostVolatileState} />}
    {picker && <DirectoryBrowser api={client} purpose="sources" title={t("hostShell.chooseFoldersOn", { p0: profiles.find((host) => host.id === selected)?.name ?? "" })} onClose={() => closePicker([])} onSelect={async (paths) => {
      const sources = await client.inspectHostSources(paths);
      closePicker(sources);
    }} />}

  </HostContext.Provider>;
}
