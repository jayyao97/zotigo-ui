import { useEffect, useRef, useState } from "react";
import { GitBranch, Plus, RefreshCw, Search } from "lucide-react";
import type { ClientApi, ManagedRepository, DesktopProjectRepository, RepositoryBranch } from "../shared/clientTypes";
import { t } from "../shared/i18n";
import { useLocale } from "./i18n";

type Props = {
  client: Pick<ClientApi, "listRepositories" | "createRepository">;
  selectedIds?: string[];
  linkedIds?: string[];
  hideLinked?: boolean;
  onChange?: (ids: string[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

function RepositorySyncStatus({ repository }: { repository: Pick<ManagedRepository, "last_synced_at" | "last_sync_error"> }) {
  const locale = useLocale();
  const synced = repository.last_synced_at && new Date(repository.last_synced_at);
  const syncedAt = synced && Number.isFinite(synced.getTime()) ? synced.toLocaleString(locale) : null;
  return <small className={`repository-sync-status${repository.last_sync_error ? " repository-sync-warning" : ""}`} title={repository.last_sync_error}>
    {syncedAt ? t(repository.last_sync_error ? "repositories.cachedAfterFailure" : "repositories.syncedAt", { time: syncedAt }) : t(repository.last_sync_error ? "repositories.noCacheAfterFailure" : "repositories.preparing")}
  </small>;
}

export function RepositoryBaseField({ client, repository, value, onChange, disabled }: { client: Pick<ClientApi, "listRepositoryBranches">; repository: DesktopProjectRepository; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  useLocale();
  const [branches, setBranches] = useState<RepositoryBranch[]>([]);
  const [error, setError] = useState("");
  const [defaultBranch, setDefaultBranch] = useState(repository.default_base_ref);
  const defaultValue = repository.repository_id ? "" : repository.default_base_ref || "HEAD";
  useEffect(() => {
    let active = true;
    setBranches([]);
    setDefaultBranch(repository.default_base_ref);
    setError("");
    const showBranches = (items: RepositoryBranch[]) => {
      if (active) {
        setBranches(items.filter(branch => branch.kind === (repository.repository_id ? "remote" : "local")));
        const currentDefault = items.find(branch => branch.kind === "remote" && branch.is_default);
        if (currentDefault) setDefaultBranch(currentDefault.name);
      }
    };
    void (async () => {
      try {
        showBranches(await client.listRepositoryBranches(repository.project_id, repository.id));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      }
      if (!active || !repository.repository_id) return;
      try {
        const fresh = await client.listRepositoryBranches(repository.project_id, repository.id, true);
        if (active) { showBranches(fresh); setError(""); }
      } catch {
        // Keep the cached list and selection when the remote is unavailable.
      }
    })();
    return () => { active = false; };
  }, [client, repository.project_id, repository.id, repository.repository_id, repository.default_base_ref]);
  return <label className="workspace-dialog-field repository-base-field">
    <span>{t("app.startFrom")}</span>
    <select aria-label={t("app.startFrom")} disabled={disabled} value={value || defaultValue} onChange={event => onChange(event.target.value)}>
      <option value={defaultValue}>{repository.repository_id ? (defaultBranch ? t("repositories.defaultBranch", { branch: defaultBranch }) : t("repositories.autoBranch")) : t("repositories.currentBranch")}</option>
      {value && value !== defaultValue && !branches.some(branch => branch.ref === value) && <option value={value}>{value.replace(/^refs\/(?:remotes\/origin|heads)\//, "")}</option>}
      {branches.filter(branch => !repository.repository_id || branch.name !== defaultBranch || branch.ref === value).map(branch => <option key={branch.ref} value={branch.ref}>{branch.name}</option>)}
    </select>
    {error && <small className="error" role="alert">{t("repositories.branchListFailed")}</small>}
  </label>;
}

export function ManagedRepositoryPicker({ client, selectedIds = [], linkedIds = [], hideLinked = false, onChange, disabled = false, onBusyChange }: Props) {
  useLocale();
  const [repositories, setRepositories] = useState<ManagedRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [query, setQuery] = useState("");
  const request = useRef(0);
  const releaseBusy = useRef<(() => void) | null>(null);

  function finishAdding() {
    const release = releaseBusy.current;
    releaseBusy.current = null;
    release?.();
  }

  useEffect(() => {
    const current = ++request.current;
    setAdding(false);
    setLoading(true);
    setError("");
    setRepositories([]);
    void client.listRepositories().then(items => {
      if (request.current === current) setRepositories(items);
    }).catch(cause => {
      if (request.current === current) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (request.current === current) setLoading(false);
    });
    return () => {
      request.current++;
      finishAdding();
    };
  }, [client, refresh]);

  useEffect(() => {
    if (loading || adding || !repositories.some(repository => !repository.last_synced_at)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      void client.listRepositories().then(items => {
        if (active) {
          setError("");
          setRepositories(items);
        }
      }).catch(cause => {
        if (active) {
          setError(cause instanceof Error ? cause.message : String(cause));
          timer = setTimeout(poll, 30000);
        }
      });
    };
    timer = setTimeout(poll, repositories.some(repository => !repository.last_synced_at && !repository.last_sync_error) ? 3000 : 30000);
    return () => { active = false; clearTimeout(timer); };
  }, [client, repositories, loading, adding]);

  async function addRepository() {
    if (adding || disabled || !remoteUrl.trim()) return;
    const current = request.current;
    setAdding(true);
    onBusyChange?.(true);
    releaseBusy.current = () => onBusyChange?.(false);
    setError("");
    try {
      const repository = await client.createRepository({ remoteUrl: remoteUrl.trim() });
      if (current !== request.current) return;
      setRepositories(items => [...items.filter(item => item.id !== repository.id), repository]);
      if (repository.last_synced_at && !linkedIds.includes(repository.id) && !selectedIds.includes(repository.id)) onChange?.([...selectedIds, repository.id]);
      setRemoteUrl("");
      setQuery("");
      setShowRemote(false);
    } catch (cause) {
      if (current === request.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (current === request.current) {
        setAdding(false);
        finishAdding();
      }
    }
  }

  const search = query.trim().toLocaleLowerCase();
  const visibleRepositories = repositories.filter(repository =>
    (!hideLinked || !linkedIds.includes(repository.id)) && `${repository.name}\n${repository.remote_url}`.toLocaleLowerCase().includes(search));

  return <section className="managed-repositories" aria-label={t("repositories.title")}>
    <div className="managed-repositories-heading"><span>{t("repositories.title")}</span><button type="button" title={t("app.reload")} aria-label={t("app.reload")} disabled={disabled || loading || adding} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={13} /></button></div>
    <p className="managed-repositories-help">{t(onChange ? "repositories.selectHelp" : "repositories.libraryHelp")}</p>
    <label className="repository-search">
      <Search size={14} aria-hidden="true" />
      <input type="search" value={query} disabled={disabled || adding} aria-label={t("repositories.search")} placeholder={t("repositories.search")} onInput={event => setQuery(event.currentTarget.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} />
    </label>
    {loading ? <p className="managed-repositories-help" role="status">{t("repositories.loading")}</p> : <div className="managed-repository-list">
      {visibleRepositories.map(repository => {
        const linked = linkedIds.includes(repository.id);
        const content = <><GitBranch size={15} /><span><strong>{repository.name}</strong><small title={repository.remote_url}>{repository.remote_url}</small><RepositorySyncStatus repository={repository} /></span><small className="managed-repository-branch">{linked ? t("repositories.linked") : repository.default_branch || t("repositories.autoBranch")}</small></>;
        return onChange ? <label className="managed-repository-row" key={repository.id}>
          <input type="checkbox" checked={linked || selectedIds.includes(repository.id)} disabled={disabled || adding || linked || !repository.last_synced_at} onChange={event => onChange(event.target.checked ? [...selectedIds, repository.id] : selectedIds.filter(id => id !== repository.id))} />{content}
        </label> : <div className="managed-repository-row" key={repository.id}>{content}</div>;
      })}
      {!repositories.length && !error && <p className="managed-repositories-empty">{t("repositories.empty")}</p>}
      {repositories.length > 0 && !visibleRepositories.length && <p className="managed-repositories-empty" role="status">{t("repositories.noMatches")}</p>}
    </div>}
    {error && <p className="dialog-error" role="alert">{error}</p>}
    {showRemote ? <div className="managed-repository-add">
      <label className="workspace-dialog-field"><span>{t("repositories.remote")}</span><input autoFocus value={remoteUrl} disabled={adding || disabled} placeholder={t("repositories.remotePlaceholder")} onInput={event => setRemoteUrl(event.currentTarget.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void addRepository(); } }} /></label>
      <div className="managed-repository-add-actions"><button type="button" disabled={adding || disabled} onClick={() => { setShowRemote(false); setRemoteUrl(""); }}>{t("app.cancel")}</button><button type="button" className="dialog-submit" disabled={adding || disabled || !remoteUrl.trim()} onClick={() => void addRepository()}>{t(adding ? "repositories.adding" : "repositories.add")}</button></div>
    </div> : <button type="button" className="managed-repository-add-button" disabled={disabled || loading} onClick={() => setShowRemote(true)}><Plus size={14} />{t("repositories.add")}</button>}
  </section>;
}
