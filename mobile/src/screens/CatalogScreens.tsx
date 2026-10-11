import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type {
  CatalogProject,
  CatalogSessionProjection,
  CatalogSource,
  CatalogWorkspaceSourceInput,
  FolderSourceMode,
} from "@zotigo/shared/zotigod";
import type { DirectoryListing } from "@zotigo/shared/clientTypes";
import { useDaemon } from "../platform/context";
import type { Routes } from "../navigation";
import {
  TextField,
  Action,
  Row,
  Notice,
  Section,
  errorText,
} from "../components/ui";
import { sessionId, sessionTitle, visibleSessions } from "../core/catalog";

type Nav = NativeStackNavigationProp<Routes>;
const css = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#181818" },
  body: { padding: 16, gap: 12 },
  text: { color: "#ededed", fontSize: 16 },
  title: {
    color: "#ededed",
    fontSize: 22,
    fontWeight: "600",
    marginVertical: 12,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  muted: { color: "#afafaf", fontSize: 14 },
});

// Focus-bound reads cannot commit after a route blur, host replacement, or newer refresh.
function useCatalogLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const active = useRef(false);
  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const result = await load();
      if (active.current && ticket === generation.current) setData(result);
    } catch (e) {
      if (active.current && ticket === generation.current)
        setError(errorText(e));
    } finally {
      if (active.current && ticket === generation.current) setLoading(false);
    }
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void refresh();
      return () => {
        active.current = false;
        generation.current++;
      };
    }, [refresh]),
  );
  return { data, error, loading, refresh };
}
function useMutation() {
  const lock = useRef(false);
  const alive = useRef(true);
  const focused = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const isCurrent = () => alive.current && focused.current;
  const run = async (work: () => Promise<unknown>) => {
    if (lock.current || !isCurrent()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return { busy, error, run, isCurrent };
}
function SessionRow({ item }: { item: CatalogSessionProjection }) {
  const nav = useNavigation<Nav>();
  return (
    <Row
      title={`${item.organization?.pinned_at ? "Pinned · " : ""}${sessionTitle(item)}`}
      subtitle={`${item.runtime?.working ? "Working" : (item.runtime?.state ?? item.availability)} · ${item.runtime?.working_directory ?? ""}`}
      onPress={() =>
        nav.navigate("Conversation", {
          id: sessionId(item),
          title: sessionTitle(item),
        })
      }
    />
  );
}
export function HomeScreen() {
  const daemon = useDaemon();
  const nav = useNavigation<Nav>();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"sessions" | "projects">("sessions");
  const action = useMutation();
  const load = useCatalogLoad(
    useCallback(async () => {
      const [projects, sessions] = await Promise.all([
        daemon.projects(),
        daemon.catalog(),
      ]);
      return { projects, sessions };
    }, [daemon]),
  );
  type HomeItem =
    | { kind: "project"; value: CatalogProject }
    | { kind: "session"; value: CatalogSessionProjection };
  const rows = useMemo<HomeItem[]>(
    () =>
      tab === "sessions"
        ? visibleSessions(load.data?.sessions ?? [], query).map((value) => ({
            kind: "session",
            value,
          }))
        : (load.data?.projects ?? [])
            .filter((project) =>
              project.name
                .toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase()),
            )
            .map((value) => ({ kind: "project", value })),
    [load.data, query, tab],
  );
  return (
    <>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        style={css.page}
        contentContainerStyle={css.body}
        data={rows}
        keyExtractor={(item) =>
          item.kind === "project"
            ? "project:" + item.value.id
            : "session:" + sessionId(item.value)
        }
        initialNumToRender={12}
        windowSize={7}
        refreshing={load.loading}
        onRefresh={() => void load.refresh()}
        renderItem={({ item }) =>
          item.kind === "session" ? (
            <SessionRow item={item.value} />
          ) : (
            <Row
              title={item.value.name}
              onPress={() =>
                nav.navigate("Project", {
                  id: item.value.id,
                  title: item.value.name,
                })
              }
            />
          )
        }
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <Text style={css.title}>{daemon.connection.name}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
              <Action
                label="Settings"
                secondary
                onPress={() => nav.navigate("Settings")}
              />
              <Action
                label="Channels"
                secondary
                onPress={() => nav.navigate("Channels")}
              />
              <Action
                label="Files"
                secondary
                onPress={() => nav.navigate("Files", {})}
              />
            </View>
            <Action
              label="New session"
              onPress={() => nav.navigate("NewSession", {})}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Action
                label={tab === "sessions" ? "✓ Sessions" : "Sessions"}
                secondary={tab !== "sessions"}
                onPress={() => setTab("sessions")}
              />
              <Action
                label={tab === "projects" ? "✓ Projects" : "Projects"}
                secondary={tab !== "projects"}
                onPress={() => setTab("projects")}
              />
            </View>
            <TextField
              label={tab === "sessions" ? "Search sessions" : "Search projects"}
              value={query}
              onChangeText={setQuery}
            />
            {tab === "projects" ? (
              <Action
                label="New project"
                secondary
                onPress={() => setCreating(true)}
              />
            ) : (
              <Action
                label="Sync Codex sessions"
                secondary
                disabled={action.busy}
                onPress={() =>
                  void action.run(async () => {
                    await daemon.catalog(true);
                    await load.refresh();
                  })
                }
              />
            )}
            {!!(load.error || action.error) && (
              <Notice text={load.error || action.error} error />
            )}
          </View>
        }
        ListEmptyComponent={
          <Notice
            text={
              load.loading
                ? "Loading…"
                : tab === "sessions"
                  ? "No matching sessions. Pull to refresh."
                  : "No matching projects."
            }
          />
        }
      />
      <Modal
        visible={creating}
        animationType="slide"
        onRequestClose={() => {
          if (!action.busy) setCreating(false);
        }}
      >
        <SafeAreaView style={css.page}>
          <View style={css.body}>
            <Text style={css.title}>New project</Text>
            <TextField
              label="Project name"
              value={name}
              onChangeText={setName}
            />
            <Notice text={action.error} error />
            <Action
              label="Create project"
              disabled={action.busy || !name.trim()}
              onPress={() =>
                void action.run(async () => {
                  const p = await daemon.createProject(name.trim());
                  if (daemon.signal.aborted || !action.isCurrent()) return;
                  setName("");
                  setCreating(false);
                  nav.navigate("Project", { id: p.id, title: p.name });
                })
              }
            />
            <Action
              label="Cancel"
              secondary
              disabled={action.busy}
              onPress={() => setCreating(false)}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
function SourceOptions({
  source,
  value,
  onChange,
}: {
  source: CatalogSource;
  value?: CatalogWorkspaceSourceInput;
  onChange: (value?: CatalogWorkspaceSourceInput) => void;
}) {
  return (
    <View>
      <View style={css.line}>
        <Text style={[css.text, { flex: 1 }]}>{source.canonical_path}</Text>
        <Switch
          accessibilityLabel={`Include ${source.canonical_path}`}
          value={!!value}
          onValueChange={(checked) =>
            onChange(
              checked
                ? {
                    source_id: source.id,
                    ...(source.kind === "folder"
                      ? { mode: source.folder_mode ?? "reference" }
                      : {}),
                  }
                : undefined,
            )
          }
        />
      </View>
      {value &&
        (source.kind === "git" ? (
          <>
            <TextField
              label="Base ref (optional)"
              value={value.base_ref ?? ""}
              onChangeText={(v) =>
                onChange({ ...value, base_ref: v || undefined })
              }
            />
            <TextField
              label="Branch name (optional)"
              value={value.branch_name ?? ""}
              onChangeText={(v) =>
                onChange({ ...value, branch_name: v || undefined })
              }
            />
          </>
        ) : (
          <ModeSelector
            value={value.mode ?? "reference"}
            onChange={(mode) => onChange({ ...value, mode })}
          />
        ))}
    </View>
  );
}
function ModeSelector({
  value,
  onChange,
}: {
  value: FolderSourceMode;
  onChange: (mode: FolderSourceMode) => void;
}) {
  return (
    <View>
      {(["reference", "copy", "direct"] as const).map((mode) => (
        <Action
          key={mode}
          label={`${value === mode ? "Selected: " : ""}${mode}`}
          secondary
          onPress={() => onChange(mode)}
        />
      ))}
      <Notice text="Reference links the original folder; copy creates a workspace copy; direct uses the original folder." />
    </View>
  );
}
function WorkspaceForm({
  project,
  close,
  created,
}: {
  project: CatalogProject & { sources: CatalogSource[] };
  close: () => void;
  created: (id: string, title: string) => void;
}) {
  const daemon = useDaemon();
  const mutation = useMutation();
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<
    Record<string, CatalogWorkspaceSourceInput>
  >({});
  return (
    <SafeAreaView style={css.page}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={css.body}
        data={project.sources}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <SourceOptions
            source={item}
            value={selected[item.id]}
            onChange={(value) =>
              setSelected((previous) => {
                const next = { ...previous };
                if (value) next[item.id] = value;
                else delete next[item.id];
                return next;
              })
            }
          />
        )}
        ListHeaderComponent={
          <>
            <Text style={css.title}>New workspace</Text>
            <TextField
              label="Workspace title"
              value={title}
              onChangeText={setTitle}
            />
            <Notice text="Choose sources to include, or create an empty workspace." />
          </>
        }
        ListFooterComponent={
          <>
            <Notice text={mutation.error} error />
            <Action
              label="Create workspace"
              disabled={mutation.busy || !title.trim()}
              onPress={() =>
                void mutation.run(async () => {
                  const workspace = await daemon.createWorkspace(
                    project.id,
                    title.trim(),
                    Object.values(selected),
                  );
                  if (!daemon.signal.aborted && mutation.isCurrent())
                    created(workspace.id, workspace.title);
                })
              }
            />
            <Action
              label="Cancel"
              secondary
              disabled={mutation.busy}
              onPress={close}
            />
          </>
        }
      />
    </SafeAreaView>
  );
}
export function ProjectScreen() {
  const { params } = useRoute<RouteProp<Routes, "Project">>();
  const daemon = useDaemon();
  const nav = useNavigation<Nav>();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const action = useMutation();
  const load = useCatalogLoad(
    useCallback(
      async () => ({
        project: await daemon.project(params.id),
        workspaces: await daemon.workspaces(params.id),
      }),
      [daemon, params.id],
    ),
  );
  return (
    <>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        style={css.page}
        contentContainerStyle={css.body}
        data={load.data?.workspaces.filter((w) => w.status !== "deleted") ?? []}
        keyExtractor={(w) => w.id}
        refreshing={load.loading}
        onRefresh={() => void load.refresh()}
        renderItem={({ item }) => (
          <Row
            title={item.title}
            subtitle={item.status}
            onPress={() =>
              nav.navigate("Workspace", { id: item.id, title: item.title })
            }
          />
        )}
        ListHeaderComponent={
          <>
            <Text style={css.title}>
              {load.data?.project.name ?? params.title}
            </Text>
            <Action
              label="Project sources"
              onPress={() =>
                nav.navigate("Sources", {
                  projectId: params.id,
                  title: params.title,
                })
              }
            />
            <Action
              label="New workspace"
              disabled={!load.data}
              onPress={() => setCreating(true)}
            />
            <TextField
              label="Rename project"
              value={name}
              onChangeText={setName}
            />
            <Action
              label="Save name"
              secondary
              disabled={action.busy || !name.trim()}
              onPress={() =>
                void action.run(async () => {
                  await daemon.renameProject(params.id, name.trim());
                  await load.refresh();
                })
              }
            />
            <Notice text={load.error || action.error} error />
            <Text style={css.title}>Workspaces</Text>
          </>
        }
        ListEmptyComponent={
          <Notice text={load.loading ? "Loading…" : "No workspaces yet."} />
        }
      />
      <Modal
        visible={creating}
        animationType="slide"
        onRequestClose={() => setCreating(false)}
      >
        {creating && load.data && (
          <WorkspaceForm
            project={load.data.project}
            close={() => setCreating(false)}
            created={(id, title) => {
              setCreating(false);
              nav.navigate("Workspace", { id, title });
            }}
          />
        )}
      </Modal>
    </>
  );
}
function AttachSourceForm({
  projectId,
  workspaceId,
  existing,
  close,
  attached,
}: {
  projectId: string;
  workspaceId: string;
  existing: string[];
  close: () => void;
  attached: () => void;
}) {
  const daemon = useDaemon();
  const mutation = useMutation();
  const [selected, setSelected] = useState<CatalogWorkspaceSourceInput>();
  const load = useCatalogLoad(
    useCallback(() => daemon.project(projectId), [daemon, projectId]),
  );
  const available =
    load.data?.sources.filter((source) => !existing.includes(source.id)) ?? [];
  return (
    <SafeAreaView style={css.page}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={css.body}
        data={available}
        keyExtractor={(source) => source.id}
        ListHeaderComponent={
          <Text style={css.title}>Add workspace source</Text>
        }
        ListEmptyComponent={
          <Notice
            text={
              load.loading
                ? "Loading sources…"
                : "No unused sources. Add a source to the project first."
            }
          />
        }
        renderItem={({ item }) => (
          <SourceOptions
            source={item}
            value={selected?.source_id === item.id ? selected : undefined}
            onChange={setSelected}
          />
        )}
        ListFooterComponent={
          <>
            <Notice text={load.error || mutation.error} error />
            <Action
              label="Add selected source"
              disabled={mutation.busy || !selected}
              onPress={() =>
                void mutation.run(async () => {
                  if (!selected) return;
                  await daemon.addWorkspaceSource(workspaceId, selected);
                  if (!daemon.signal.aborted && mutation.isCurrent())
                    attached();
                })
              }
            />
            <Action
              label="Cancel"
              secondary
              disabled={mutation.busy}
              onPress={close}
            />
          </>
        }
      />
    </SafeAreaView>
  );
}
export function WorkspaceScreen() {
  const { params } = useRoute<RouteProp<Routes, "Workspace">>();
  const daemon = useDaemon();
  const nav = useNavigation<Nav>();
  const [title, setTitle] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const action = useMutation();
  const load = useCatalogLoad(
    useCallback(async () => {
      const [workspace, sources, sessions] = await Promise.all([
        daemon.workspace(params.id),
        daemon.workspaceSources(params.id),
        daemon.catalog(),
      ]);
      return { workspace, sources, sessions };
    }, [daemon, params.id]),
  );
  const sessions = useMemo(
    () => visibleSessions(load.data?.sessions ?? [], "", params.id),
    [load.data, params.id],
  );
  const archive = () =>
    void action.run(async () => {
      const preview = await daemon.archivePreview(params.id);
      if (daemon.signal.aborted || !action.isCurrent()) return;
      if (preview.dirty_worktree_paths.length)
        throw new Error(
          "Commit or discard changes before archiving:\n" +
            preview.dirty_worktree_paths.join("\n"),
        );
      Alert.alert(
        "Archive workspace?",
        `${preview.workspace_title}\n${preview.root_path}\n${preview.worktree_paths.length} worktrees\n${preview.dirty_worktree_paths.length ? "Uncommitted changes:\n" + preview.dirty_worktree_paths.join("\n") : "No dirty worktrees reported."}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Archive",
            style: "destructive",
            onPress: () =>
              void action.run(async () => {
                await daemon.archiveWorkspace(params.id);
                await load.refresh();
              }),
          },
        ],
      );
    });
  const workspace = load.data?.workspace;
  return (
    <>
      <FlatList
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        style={css.page}
        contentContainerStyle={css.body}
        data={sessions}
        keyExtractor={sessionId}
        refreshing={load.loading}
        onRefresh={() => void load.refresh()}
        renderItem={({ item }) => <SessionRow item={item} />}
        ListHeaderComponent={
          <>
            <Text style={css.title}>{workspace?.title ?? params.title}</Text>
            <Notice
              text={
                workspace
                  ? `${workspace.status} · ${workspace.root_path}`
                  : "Loading…"
              }
            />
            <Notice
              text={load.error || action.error || workspace?.error || ""}
              error
            />
            <Action
              label="New session"
              disabled={workspace?.status !== "ready"}
              onPress={() =>
                nav.navigate("NewSession", {
                  workspaceId: params.id,
                  directory: workspace?.root_path,
                })
              }
            />
            <Action
              label="Workspace files"
              disabled={!workspace?.root_path}
              onPress={() =>
                nav.navigate("Files", { path: workspace?.root_path })
              }
            />
            <Section title="Sources">
              {load.data?.sources.map((s) => (
                <Row
                  key={s.source.id}
                  title={s.source.canonical_path}
                  subtitle={[
                    s.status,
                    s.branch_name,
                    s.base_ref,
                    s.mode,
                    s.error,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onPress={() => nav.navigate("Files", { path: s.target_path })}
                />
              ))}
            </Section>
            <Action
              label="Add source to workspace"
              disabled={workspace?.status !== "ready"}
              onPress={() => setAddingSource(true)}
            />
            <TextField
              label="Rename workspace"
              value={title}
              onChangeText={setTitle}
            />
            <Action
              label="Save title"
              secondary
              disabled={action.busy || !title.trim()}
              onPress={() =>
                void action.run(async () => {
                  await daemon.renameWorkspace(params.id, title.trim());
                  await load.refresh();
                })
              }
            />
            {workspace?.status === "error" && (
              <Action
                label="Retry provisioning"
                disabled={action.busy}
                onPress={() =>
                  void action.run(async () => {
                    await daemon.retryWorkspace(params.id);
                    await load.refresh();
                  })
                }
              />
            )}
            <Action
              label="Review archive"
              danger
              disabled={
                action.busy ||
                !workspace ||
                !["ready", "error"].includes(workspace.status)
              }
              onPress={archive}
            />
            <Text style={css.title}>Sessions</Text>
          </>
        }
        ListEmptyComponent={
          <Notice text="No active sessions in this workspace." />
        }
      />
      <Modal
        visible={addingSource}
        animationType="slide"
        onRequestClose={() => setAddingSource(false)}
      >
        {addingSource && workspace && (
          <AttachSourceForm
            projectId={workspace.project_id}
            workspaceId={params.id}
            existing={load.data?.sources.map((s) => s.source.id) ?? []}
            close={() => setAddingSource(false)}
            attached={() => {
              setAddingSource(false);
              void load.refresh();
            }}
          />
        )}
      </Modal>
    </>
  );
}
export function SourcesScreen() {
  const { params } = useRoute<RouteProp<Routes, "Sources">>();
  const daemon = useDaemon();
  const nav = useNavigation<Nav>();
  const action = useMutation();
  const load = useCatalogLoad(
    useCallback(
      () => daemon.project(params.projectId),
      [daemon, params.projectId],
    ),
  );
  return (
    <FlatList
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={css.page}
      contentContainerStyle={css.body}
      data={load.data?.sources ?? []}
      keyExtractor={(s) => s.id}
      refreshing={load.loading}
      onRefresh={() => void load.refresh()}
      ListHeaderComponent={
        <>
          <Action
            label="Add source"
            onPress={() =>
              nav.navigate("SourcePicker", { projectId: params.projectId })
            }
          />
          <Notice text={load.error || action.error} error />
        </>
      }
      ListEmptyComponent={<Notice text="No project sources." />}
      renderItem={({ item }) => (
        <Section title={item.kind}>
          <Row title={item.canonical_path} subtitle={item.folder_mode} />
          <Action
            label="Remove from project"
            danger
            disabled={action.busy}
            onPress={() =>
              Alert.alert(
                "Remove source?",
                `Remove ${item.canonical_path} from this project? Existing workspace bindings and files are preserved.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () =>
                      void action.run(async () => {
                        await daemon.removeSource(params.projectId, item.id);
                        await load.refresh();
                      }),
                  },
                ],
              )
            }
          />
        </Section>
      )}
    />
  );
}
export function SourcePickerScreen() {
  const { params } = useRoute<RouteProp<Routes, "SourcePicker">>();
  const daemon = useDaemon();
  const nav = useNavigation<Nav>();
  const action = useMutation();
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<DirectoryListing>();
  const [inspection, setInspection] =
    useState<Awaited<ReturnType<typeof daemon.inspectSource>>>();
  const [mode, setMode] = useState<FolderSourceMode>("reference");
  const pathRevision = useRef(0);
  const browse = (target: string) => {
    const revision = ++pathRevision.current;
    void action.run(async () => {
      const result = await daemon.listDirectory(target, undefined, true);
      if (
        daemon.signal.aborted ||
        !action.isCurrent() ||
        revision !== pathRevision.current
      )
        return;
      setListing(result);
      setPath(result.path);
      setInspection(undefined);
    });
  };
  return (
    <FlatList
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={css.page}
      contentContainerStyle={css.body}
      data={
        listing?.entries.filter((entry) => entry.kind === "directory") ?? []
      }
      keyExtractor={(entry) => entry.path}
      ListHeaderComponent={
        <>
          <TextField
            label="Directory on daemon"
            value={path}
            onChangeText={(value) => {
              pathRevision.current++;
              setPath(value);
              setInspection(undefined);
            }}
          />
          <Action
            label="Browse"
            disabled={action.busy}
            onPress={() => browse(path)}
          />
          {listing?.parentPath && (
            <Action
              label="Parent directory"
              secondary
              disabled={action.busy}
              onPress={() => browse(listing.parentPath!)}
            />
          )}
          <Action
            label="Inspect selected directory"
            disabled={action.busy || !path.trim()}
            onPress={() => {
              const target = path;
              const revision = pathRevision.current;
              void action.run(async () => {
                const result = await daemon.inspectSource(target);
                if (
                  daemon.signal.aborted ||
                  !action.isCurrent() ||
                  revision !== pathRevision.current
                )
                  return;
                setInspection(result);
              });
            }}
          />
          {inspection && (
            <>
              <Notice
                text={`${inspection.kind} · ${inspection.canonical_path}`}
              />
              {inspection.kind === "folder" && (
                <ModeSelector value={mode} onChange={setMode} />
              )}
              <Action
                label="Add inspected source"
                disabled={action.busy}
                onPress={() =>
                  void action.run(async () => {
                    await daemon.addSource(
                      params.projectId,
                      inspection.canonical_path,
                      inspection.kind === "folder" ? mode : undefined,
                    );
                    if (!daemon.signal.aborted && action.isCurrent())
                      nav.goBack();
                  })
                }
              />
            </>
          )}
          <Notice text={action.error} error />
          {listing?.truncated && (
            <Notice text="Directory listing truncated. Enter a more specific path." />
          )}
        </>
      }
      renderItem={({ item }) => (
        <Row
          title={item.name}
          onPress={action.busy ? undefined : () => browse(item.path)}
        />
      )}
    />
  );
}
