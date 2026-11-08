import { useEffect, useRef, useState } from "react";
import { GitBranch, Plus, RefreshCw, Search } from "lucide-react";
import type { ClientApi, ManagedRepository, DesktopProjectRepository } from "../shared/clientTypes";
import { t } from "../shared/i18n";
import { useLocale } from "./i18n";

type Props = {
  client: Pick<ClientApi, "listRepositories" | "createRepository">;
  selectedIds?: string[];
  linkedIds?: string[];
  onChange?: (ids: string[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

export function repositoryBaseLabel(repository: DesktopProjectRepository, value: string): string {
  if (value) return value;
  return repository.default_base_ref ? t("repositories.latestDefault", { branch: repository.default_base_ref }) : t("repositories.autoBranch");
}

export function RepositoryBaseField({ repository, value, onChange, disabled }: { repository: DesktopProjectRepository; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  useLocale();
  return <label className="workspace-dialog-field repository-base-field">
    <span>{t("app.startFrom")}</span>
    <input value={value} placeholder={repository.repository_id ? repositoryBaseLabel(repository, "") : undefined} disabled={disabled} onChange={event => onChange(event.target.value)} />
    <small>{t(repository.repository_id ? "repositories.latestHelp" : "app.resolvedByZotigodWhenTheWorkspaceIsCreated")}</small>
    {repository.repository_id && value && <button type="button" disabled={disabled} onClick={() => onChange("")}>{t("repositories.useDefault")}</button>}
  </label>;
}

export function ManagedRepositoryPicker({ client, selectedIds = [], linkedIds = [], onChange, disabled = false, onBusyChange }: Props) {
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
      if (!linkedIds.includes(repository.id) && !selectedIds.includes(repository.id)) onChange?.([...selectedIds, repository.id]);
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
    `${repository.name}\n${repository.remote_url}`.toLocaleLowerCase().includes(search));

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
        const content = <><GitBranch size={15} /><span><strong>{repository.name}</strong><small title={repository.remote_url}>{repository.remote_url}</small></span><small className="managed-repository-branch">{linked ? t("repositories.linked") : repository.default_branch || t("repositories.autoBranch")}</small></>;
        return onChange ? <label className="managed-repository-row" key={repository.id}>
          <input type="checkbox" checked={linked || selectedIds.includes(repository.id)} disabled={disabled || adding || linked} onChange={event => onChange(event.target.checked ? [...selectedIds, repository.id] : selectedIds.filter(id => id !== repository.id))} />{content}
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
