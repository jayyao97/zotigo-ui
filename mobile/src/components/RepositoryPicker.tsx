import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import type { ManagedRepository } from "@zotigo/shared/clientTypes";
import { t } from "@zotigo/shared/i18n/index";
import { workspaceSourceMatches } from "@zotigo/shared/workspaceSourceSelection";
import { useDaemon } from "../platform/context";
import { useLocale } from "../platform/i18n";
import { Action, Notice, Row, TextField, errorText } from "./ui";

export function repositoryStatus(repository: Pick<ManagedRepository, "last_synced_at" | "last_sync_error">): string {
  const time = repository.last_synced_at ? new Date(repository.last_synced_at).toLocaleString() : "";
  return repository.last_sync_error
    ? t(time ? "repositories.cachedAfterFailure" : "repositories.noCacheAfterFailure", { time })
    : time ? t("repositories.syncedAt", { time }) : t("repositories.preparing");
}

export function RepositoryPicker({ projectId, onLinked }: { projectId: string; onLinked: () => void }) {
  useLocale();
  const client = useDaemon();
  const focused = useIsFocused();
  const current = useRef(false);
  useEffect(() => { current.current = focused; return () => { current.current = false; }; }, [focused]);
  const lock = useRef(false);
  const [repositories, setRepositories] = useState<ManagedRepository[]>();
  const [linked, setLinked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState("");
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!focused) return;
    let disposed = false;
    let pending = false;
    const refresh = async (initial = false) => {
      if (disposed || pending || (!initial && AppState.currentState !== "active")) return;
      pending = true;
      try {
        const [items, project] = await Promise.all([client.repositories(), client.project(projectId)]);
        if (!disposed) { setRepositories(items); setLinked(project.sources.flatMap(source => source.repository_id ? [source.repository_id] : [])); setReadError(""); }
      } catch (e) { if (!disposed) setReadError(errorText(e)); }
      finally { pending = false; }
    };
    void refresh(true);
    const timer = setInterval(() => void refresh(), 5000);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { disposed = true; clearInterval(timer); subscription.remove(); };
  }, [client, projectId, focused, revision]);
  const mutate = useCallback(async (work: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError("");
    try { await work(); }
    catch (e) { if (current.current) setError(errorText(e)); }
    finally { lock.current = false; if (current.current) { setBusy(false); setRevision(value => value + 1); } }
  }, []);
  const matches = repositories?.filter(item => workspaceSourceMatches({ name: item.name, source_path: item.canonical_path, remote_url: item.remote_url }, query));
  return <View style={{ gap: 8 }}>
    <TextField label={t("repositories.search")} value={query} onChangeText={setQuery} />
    <Notice text={error || readError} error />
    {!repositories && !error && !readError && <Notice text={t("repositories.loading")} />}
    {matches?.map(item => <Row key={item.id} title={item.name} subtitle={`${item.remote_url}\n${linked.includes(item.id) ? t("repositories.linked") : repositoryStatus(item)}`} onPress={busy || linked.includes(item.id) || !item.last_synced_at ? undefined : () => void mutate(async () => {
      await client.linkRepository(projectId, item.id);
      if (current.current && !client.signal.aborted) onLinked();
    })} />)}
    {matches?.length === 0 && <Notice text={t(repositories?.length ? "repositories.noMatches" : "repositories.empty")} />}
    <TextField label={t("repositories.remote")} value={remote} onChangeText={setRemote} placeholder={t("repositories.remotePlaceholder")} />
    <Action label={t(busy ? "repositories.adding" : "repositories.add")} disabled={busy || !remote.trim()} onPress={() => void mutate(async () => { await client.createRepository(remote.trim()); if (current.current) setRemote(""); })} />
    <Notice text={t("repositories.selectHelp")} />
  </View>;
}
