import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, File, Folder, RefreshCw, X } from "lucide-react";
import type { ClientApi, DirectoryListing } from "../shared/clientTypes";

interface Props {
  api: ClientApi;
  purpose: "files" | "sources";
  title: string;
  initialPath?: string;
  sessionId?: string;
  onClose(): void;
  onSelect(paths: string[]): Promise<void>;
}

export function DirectoryBrowser({ api, purpose, title, initialPath = "", sessionId, onClose, onSelect }: Props) {
  useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(0);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [location, setLocation] = useState(initialPath);
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current?.showModal();
    void load(initialPath);
    return () => { request.current++; if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, [api, purpose, initialPath, sessionId]);

  async function load(path: string) {
    const id = ++request.current;
    setBusy(true); setError(""); setListing(null);
    try {
      const next = await api.listDirectory({ path, purpose, sessionId });
      if (id !== request.current) return;
      setListing(next); setLocation(next.path); setFilter("");
    } catch (cause) {
      if (id === request.current) setError(cause instanceof Error ? cause.message : t("directoryBrowser.couldNotReadDirectory"));
    } finally { if (id === request.current) setBusy(false); }
  }

  async function select(paths: string[]) {
    const id = ++request.current;
    setBusy(true); setError("");
    setSelecting(true);
    try { await onSelect(paths); if (id === request.current) onClose(); }
    catch (cause) { if (id === request.current) setError(cause instanceof Error ? cause.message : t("directoryBrowser.couldNotOpenSelection")); }
    finally { if (id === request.current) { setBusy(false); setSelecting(false); } }
  }

  return <dialog ref={dialog} className="directory-browser" onCancel={(event) => { event.preventDefault(); if (!selecting) onClose(); }}>
    <header><h2>{title}</h2><button type="button" aria-label={t("directoryBrowser.closeDirectoryBrowser")} disabled={selecting} onClick={onClose}><X size={18} /></button></header>
    <form className="directory-location" onSubmit={(event) => { event.preventDefault(); void load(location); }}>
      <button type="button" aria-label={t("directoryBrowser.parentDirectory")} disabled={busy || !listing || listing.parentPath === null} onClick={() => { if (listing?.parentPath != null) void load(listing.parentPath); }}><ArrowUp size={16} /></button>
      <input aria-label={t("directoryBrowser.directoryPath")} value={location} onChange={(event) => setLocation(event.target.value)} placeholder={purpose === "sources" ? t("directoryBrowser.daemonHomeDirectory") : t("directoryBrowser.registeredWorkspaces")} disabled={busy} />
      <button type="submit" disabled={busy}>{t("directoryBrowser.go")}</button>
      <button type="button" aria-label={t("directoryBrowser.refreshDirectory")} disabled={busy} onClick={() => void load(listing?.path ?? initialPath)}><RefreshCw size={16} /></button>
    </form>
    {purpose === "files" && <button type="button" className="directory-roots" disabled={busy} onClick={() => void load("")}>{t("directoryBrowser.registeredSourcesAndWorkspaces")}</button>}
    <input className="directory-filter" aria-label={t("directoryBrowser.filterDirectoryEntries")} placeholder={t("directoryBrowser.filterThisDirectory")} value={filter} onChange={(event) => setFilter(event.target.value)} />
    {error && <p role="alert">{error}</p>}
    <div className="directory-entries" aria-busy={busy}>
      {listing?.entries.filter((entry) => entry.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map((entry) => <div className="directory-entry" key={entry.path}>
        {purpose === "sources" && <input type="checkbox" aria-label={t("directoryBrowser.select", { p0: entry.name })} checked={chosen.includes(entry.path)} disabled={busy || chosen.length >= 20 && !chosen.includes(entry.path)} onChange={(event) => setChosen((current) => event.target.checked ? [...current, entry.path] : current.filter((path) => path !== entry.path))} />}
        <button type="button" disabled={busy || entry.kind === "unavailable"} onClick={() => entry.kind === "directory" ? void load(entry.path) : void select([entry.path])}>
          {entry.kind === "directory" ? <Folder size={16} /> : <File size={16} />}<span>{entry.name}</span>
          {entry.kind === "unavailable" && <small>{t("directoryBrowser.unavailable")}</small>}
        </button>
      </div>)}
      {!busy && listing?.entries.length === 0 && <p>{t(purpose === "sources" ? "directory.emptyFolders" : "directory.emptyEntries")}</p>}
      {busy && <p role="status">{t("directoryBrowser.loading")}</p>}
    </div>
    {listing?.truncated && <p>{t("directoryBrowser.showingTheFirst1000EntriesEnterA")}</p>}
    {purpose === "sources" && <footer>
      <span>{chosen.length ? t("directoryBrowser.foldersSelected", { p0: chosen.length }) : t("directoryBrowser.selectFoldersOrUseTheCurrentDirectory")}</span>
      <button type="button" disabled={busy || !listing?.path || chosen.length > 0} onClick={() => { if (listing?.path) void select([listing.path]); }}>{t("directoryBrowser.useThisFolder")}</button>
      {chosen.length > 0 && <><button type="button" disabled={busy} onClick={() => setChosen([])}>{t("directoryBrowser.clear")}</button><button type="button" disabled={busy} onClick={() => void select(chosen)}>{t("directoryBrowser.addSelected")}</button></>}
    </footer>}
  </dialog>;
}
