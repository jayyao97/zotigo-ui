import SquarePen from "lucide-react-native/icons/square-pen";
import { useLayoutTransition } from "../components/useLayoutTransition";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FolderOpen from "lucide-react-native/icons/folder-open";
import Folder from "lucide-react-native/icons/folder";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
  type ComponentType,
} from "react";
import {
  Alert,
  AppState,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
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
  CatalogWorkspace,
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
  IconButton,
  Row,
  Notice,
  Section,
  errorText,
} from "../components/ui";
import {
  sessionId,
  sessionTitle,
  visibleSessions,
  pathLabel,
  catalogRows,
  stickyCatalogRows,
  type CatalogRow,
  type CatalogLayout,
} from "../core/catalog";

type Nav = NativeStackNavigationProp<Routes>;
const css = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#181818" },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 0 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#383838",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  text: { color: "#ededed", fontSize: 16 },
  title: {
    color: "#ededed",
    fontSize: 18,
    fontWeight: "600",
    marginVertical: 8,
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
function useCatalogLoad<T>(load: () => Promise<T>, poll = false) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const active = useRef(false);
  const inFlight = useRef(0);
  const refresh = useCallback(
    async (silent = false) => {
      if (silent && inFlight.current > 0) return;
      inFlight.current++;
      const ticket = ++generation.current;
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const result = await load();
        if (active.current && ticket === generation.current) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (active.current && ticket === generation.current)
          setError(errorText(e));
      } finally {
        inFlight.current--;
        if (active.current && ticket === generation.current) setLoading(false);
      }
    },
    [load],
  );
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void refresh();
      const timer = poll
        ? setInterval(() => {
            if (AppState.currentState === "active") void refresh(true);
          }, 10000)
        : undefined;
      return () => {
        if (timer) clearInterval(timer);
        active.current = false;
        generation.current++;
      };
    }, [refresh, poll]),
  );
  return { data, error, loading, refresh: () => refresh() };
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
function Footer({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[css.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>
      {children}
    </View>
  );
}
function SessionRow({ item }: { item: CatalogSessionProjection }) {
  const nav = useNavigation<Nav>();
  return (
    <Row
      title={sessionTitle(item)}
      right={
        !item.runtime?.working && item.runtime?.read_state?.unread ? (
          <View
            accessible
            accessibilityLabel="Unread"
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: "#3b82f6",
            }}
          />
        ) : undefined
      }
      subtitle={
        item.runtime?.working
          ? `Working · ${pathLabel(item.runtime.working_directory ?? "")}`
          : undefined
      }
      onPress={() =>
        nav.navigate("Conversation", {
          id: sessionId(item),
          title: sessionTitle(item),
        })
      }
    />
  );
}
export function HomeScreen({ hostPicker }: { hostPicker?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const daemon = useDaemon();
  const nav = useNavigation<Nav>();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const animateLayout = useLayoutTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    animateLayout();
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const [name, setName] = useState("");
  const [panel, setPanel] = useState<"menu" | "project" | null>(null);
  const action = useMutation();
  const load = useCatalogLoad(
    useCallback(async () => {
      const [projects, sessions, navigation] = await Promise.all([
        daemon.projects(),
        daemon.catalog(),
        daemon.navigation(),
      ]);
      const workspaces: CatalogWorkspace[] = [];
      const workspaceErrors: Record<string, string> = {};
      // Read projects in sequence rather than fan out requests to every workspace list.
      for (const project of projects) {
        if (daemon.signal.aborted) break;
        try {
          workspaces.push(...(await daemon.workspaces(project.id)));
        } catch (error) {
          workspaceErrors[project.id] = errorText(error);
        }
      }
      return { projects, sessions, workspaces, workspaceErrors, navigation };
    }, [daemon]),
    true,
  );
  const rows = useMemo(
    () =>
      catalogRows(
        load.data?.projects ?? [],
        load.data?.workspaces ?? [],
        load.data?.sessions ?? [],
        query,
        collapsed,
        load.data?.workspaceErrors,
        expanded,
        load.data?.navigation.pinned,
        load.data?.navigation,
      ),
    [load.data, query, collapsed, expanded],
  );
  const layouts = useRef(new Map<string, CatalogLayout>());
  const offset = useRef(0);
  const currentRows = useRef(rows);
  currentRows.current = rows;
  const [sticky, setSticky] = useState<ReturnType<typeof stickyCatalogRows>>(
    [],
  );
  const refreshSticky = useCallback(() => {
    const next = stickyCatalogRows(
      currentRows.current,
      layouts.current,
      offset.current,
    );
    setSticky((previous) =>
      previous.length === next.length &&
      previous.every(
        (entry, i) => entry.row === next[i].row && entry.top === next[i].top,
      )
        ? previous
        : next,
    );
  }, []);
  useEffect(() => {
    refreshSticky();
  }, [rows, refreshSticky]);
  const Cell = useMemo(() => {
    type Props = ComponentProps<
      NonNullable<
        ComponentProps<typeof FlatList<CatalogRow>>["CellRendererComponent"]
      >
    >;
    const CellView: ComponentType<Props> = ({
      children,
      onLayout,
      style,
      item,
    }) => (
      <View
        style={style}
        onLayout={(event) => {
          onLayout?.(event);
          layouts.current.set(item.key, event.nativeEvent.layout);
          refreshSticky();
        }}
      >
        {children}
      </View>
    );
    return CellView;
  }, [refreshSticky]);
  const renderRow = (item: CatalogRow, overlay = false) => {
    if (item.kind === "session")
      return (
        <View style={{ paddingLeft: item.depth * 18 }}>
          <SessionRow item={item.value} />
        </View>
      );
    if (item.kind === "notice")
      return (
        <View style={{ paddingLeft: (item.depth ?? 2) * 18 }}>
          <Notice text={item.title} />
        </View>
      );
    if (item.kind === "more")
      return (
        <View style={{ paddingLeft: (item.depth ?? 2) * 18 }}>
          <Action
            secondary
            label={item.expanded ? "Show less" : `Show ${item.remaining} more`}
            onPress={() => {
              animateLayout();
              setExpanded((previous) => {
                const next = new Set(previous);
                if (next.has(item.workspaceKey)) next.delete(item.workspaceKey);
                else next.add(item.workspaceKey);
                return next;
              });
            }}
          />
        </View>
      );
    const Chevron = item.open ? ChevronDown : ChevronRight;
    if (item.kind === "heading")
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.open ? "Collapse" : "Expand"} ${item.title}`}
          accessibilityState={{ expanded: item.open }}
          onPress={() => toggle(item.key)}
          style={[
            css.line,
            {
              justifyContent: "flex-start",
              gap: 6,
              paddingHorizontal: 10,
              marginTop: 12,
            },
          ]}
        >
          <Text style={css.muted}>{item.title}</Text>
          <Chevron size={16} color="#afafaf" />
        </Pressable>
      );
    const FolderIcon = item.open ? FolderOpen : Folder;
    const project = item.kind === "project";
    const title = project ? item.value.name : item.value.title;
    return (
      <View
        accessibilityElementsHidden={
          !overlay && sticky.some((entry) => entry.row.key === item.key)
        }
        importantForAccessibility={
          !overlay && sticky.some((entry) => entry.row.key === item.key)
            ? "no-hide-descendants"
            : "auto"
        }
        style={[css.line, { paddingLeft: project ? 0 : item.depth * 18 }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.open ? "Collapse" : "Expand"} ${title}`}
          accessibilityState={{ expanded: item.open }}
          onLongPress={() =>
            nav.navigate(project ? "Project" : "Workspace", {
              id: item.value.id,
              title,
            })
          }
          accessibilityHint="Long press to manage"
          onPress={() => toggle(item.key)}
          style={[
            css.line,
            {
              flex: 1,
              justifyContent: "flex-start",
              gap: 8,
              paddingHorizontal: 8,
            },
          ]}
        >
          <FolderIcon size={18} color="#afafaf" />
          <Text
            style={[css.text, { flex: 1, fontWeight: project ? "600" : "400" }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </Pressable>
        <IconButton
          icon={project ? Ellipsis : SquarePen}
          label={project ? `Manage ${title}` : `New session in ${title}`}
          onPress={() =>
            project
              ? nav.navigate("Project", { id: item.value.id, title })
              : nav.navigate("NewSession", { workspaceId: item.value.id })
          }
        />
      </View>
    );
  };
  return (
    <View style={css.page}>
      {hostPicker}
      <View style={{ flex: 1, overflow: "hidden" }}>
        <FlatList
          CellRendererComponent={Cell}
          onScroll={(event) => {
            offset.current = event.nativeEvent.contentOffset.y;
            refreshSticky();
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={[
            css.body,
            { paddingBottom: Math.max(16, insets.bottom) },
          ]}
          data={rows}
          keyExtractor={(item) => item.key}
          initialNumToRender={18}
          windowSize={7}
          refreshing={load.loading}
          onRefresh={() => void load.refresh()}
          renderItem={({ item }) => renderRow(item)}
          ListHeaderComponent={
            <>
              <View style={[css.toolbar, { gap: 8 }]}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    accessibilityLabel="Search sessions and projects"
                    placeholder="Search sessions and projects"
                    placeholderTextColor="#898989"
                    value={query}
                    onChangeText={setQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: "#212121",
                      paddingHorizontal: 12,
                      color: "#ededed",
                      fontSize: 14,
                    }}
                  />
                </View>
                <IconButton
                  icon={Ellipsis}
                  label="More options"
                  disabled={action.busy}
                  onPress={() => setPanel("menu")}
                />
              </View>
              <Notice text={load.error || action.error} error />
            </>
          }
          ListEmptyComponent={
            <Notice
              text={load.loading ? "Loading…" : "No sessions or projects."}
            />
          }
        />
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", top: 0, left: 16, right: 16 }}
        >
          {sticky.map(({ row, top }, index) => (
            <View
              key={row.key}
              style={{
                position: "absolute",
                top,
                left: 0,
                right: 0,
                zIndex: 2 - index,
                backgroundColor: "#181818",
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: "#383838",
              }}
            >
              {renderRow(row, true)}
            </View>
          ))}
        </View>
      </View>
      <Modal
        visible={panel !== null}
        animationType="slide"
        onRequestClose={() => {
          if (!action.busy) setPanel(null);
        }}
      >
        <SafeAreaView style={css.page}>
          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={css.toolbar}>
              <Text style={css.title}>
                {panel === "project" ? "New project" : "More"}
              </Text>
              <Action
                label="Done"
                secondary
                disabled={action.busy}
                onPress={() => setPanel(null)}
              />
            </View>
            {panel === "project" ? (
              <>
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
                      const project = await daemon.createProject(name.trim());
                      if (!action.isCurrent() || daemon.signal.aborted) return;
                      setPanel(null);
                      setName("");
                      nav.navigate("Project", {
                        id: project.id,
                        title: project.name,
                      });
                    })
                  }
                />
              </>
            ) : (
              <>
                <Row
                  title="New project"
                  onPress={action.busy ? undefined : () => setPanel("project")}
                />
                <Row
                  title="Files"
                  onPress={
                    action.busy
                      ? undefined
                      : () => {
                          setPanel(null);
                          nav.navigate("Files", {});
                        }
                  }
                />
                <Row
                  title="Channels"
                  onPress={
                    action.busy
                      ? undefined
                      : () => {
                          setPanel(null);
                          nav.navigate("Channels");
                        }
                  }
                />
                <Row
                  title="Settings"
                  onPress={
                    action.busy
                      ? undefined
                      : () => {
                          setPanel(null);
                          nav.navigate("Settings");
                        }
                  }
                />
                <Action
                  label={action.busy ? "Syncing…" : "Sync Codex sessions"}
                  secondary
                  disabled={action.busy}
                  onPress={() =>
                    void action.run(async () => {
                      await daemon.catalog(true);
                      await load.refresh();
                      if (action.isCurrent()) setPanel(null);
                    })
                  }
                />
                <Notice text={action.error} error />
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Source details: ${source.canonical_path}`}
          onPress={() => Alert.alert("Source", source.canonical_path)}
          style={{ flex: 1, minHeight: 44, justifyContent: "center" }}
        >
          <Text style={css.text} numberOfLines={1}>
            {pathLabel(source.canonical_path)}
          </Text>
        </Pressable>
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
  const [panel, setPanel] = useState<"manage" | "create" | null>(null);
  const action = useMutation();
  const load = useCatalogLoad(
    useCallback(async () => {
      const [project, workspaces] = await Promise.all([
        daemon.project(params.id),
        daemon.workspaces(params.id),
      ]);
      return { project, workspaces };
    }, [daemon, params.id]),
  );
  return (
    <View style={css.page}>
      <FlatList
        contentContainerStyle={css.body}
        data={
          load.data?.workspaces.filter((item) => item.status !== "deleted") ??
          []
        }
        keyExtractor={(item) => item.id}
        refreshing={load.loading}
        onRefresh={() => void load.refresh()}
        renderItem={({ item }) => (
          <Row
            title={item.title}
            subtitle={item.status === "ready" ? undefined : item.status}
            onPress={() =>
              nav.navigate("Workspace", { id: item.id, title: item.title })
            }
          />
        )}
        ListHeaderComponent={
          <>
            <View style={css.toolbar}>
              <Text style={css.muted}>Workspaces</Text>
              <Action
                label="Manage"
                secondary
                onPress={() => {
                  setName(load.data?.project.name ?? params.title);
                  setPanel("manage");
                }}
              />
            </View>
            <Notice text={load.error || action.error} error />
          </>
        }
        ListEmptyComponent={
          <Notice text={load.loading ? "Loading…" : "No workspaces yet."} />
        }
      />
      <Footer>
        <Action
          label="New workspace"
          disabled={!load.data || action.busy}
          onPress={() => setPanel("create")}
        />
      </Footer>
      <Modal
        visible={panel !== null}
        animationType="slide"
        onRequestClose={() => {
          if (!action.busy) setPanel(null);
        }}
      >
        {panel === "create" && load.data ? (
          <WorkspaceForm
            project={load.data.project}
            close={() => setPanel(null)}
            created={(id, title) => {
              setPanel(null);
              nav.navigate("Workspace", { id, title });
            }}
          />
        ) : (
          <SafeAreaView style={css.page}>
            <ScrollView
              contentContainerStyle={{ padding: 20, gap: 12 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={css.toolbar}>
                <Text style={css.title}>Project</Text>
                <Action
                  label="Done"
                  secondary
                  disabled={action.busy}
                  onPress={() => setPanel(null)}
                />
              </View>
              <Row
                title="Project sources"
                onPress={
                  action.busy
                    ? undefined
                    : () => {
                        setPanel(null);
                        nav.navigate("Sources", {
                          projectId: params.id,
                          title: params.title,
                        });
                      }
                }
              />
              <TextField
                label="Project name"
                value={name}
                onChangeText={setName}
              />
              <Notice text={action.error} error />
              <Action
                label="Save name"
                secondary
                disabled={action.busy || !name.trim()}
                onPress={() =>
                  void action.run(async () => {
                    await daemon.renameProject(params.id, name.trim());
                    await load.refresh();
                    if (action.isCurrent()) {
                      nav.setParams({ title: name.trim() });
                      setPanel(null);
                    }
                  })
                }
              />
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </View>
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
  const [panel, setPanel] = useState<"manage" | "add" | null>(null);
  const action = useMutation();
  const load = useCatalogLoad(
    useCallback(async () => {
      const [workspace, sources, sessions, navigation] = await Promise.all([
        daemon.workspace(params.id),
        daemon.workspaceSources(params.id),
        daemon.catalog(),
        daemon.navigation(),
      ]);
      return { workspace, sources, sessions, navigation };
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
    <View style={css.page}>
      <FlatList
        contentContainerStyle={css.body}
        data={sessions}
        keyExtractor={sessionId}
        refreshing={load.loading}
        onRefresh={() => void load.refresh()}
        renderItem={({ item }) => <SessionRow item={item} />}
        ListHeaderComponent={
          <>
            <Action
              secondary
              label={
                load.data?.navigation.pinned.some(
                  (p) => p.kind === "workspace" && p.id === params.id,
                )
                  ? "Unpin workspace"
                  : "Pin workspace"
              }
              disabled={action.busy || !load.data}
              onPress={() =>
                void action.run(async () => {
                  await daemon.pinWorkspace(
                    params.id,
                    !load.data?.navigation.pinned.some(
                      (p) => p.kind === "workspace" && p.id === params.id,
                    ),
                  );
                  await load.refresh();
                })
              }
            />
            <View style={css.toolbar}>
              <Text style={css.muted}>
                {workspace?.status === "ready"
                  ? "Conversations"
                  : (workspace?.status ?? "Loading…")}
              </Text>
              <View style={{ flexDirection: "row" }}>
                <Action
                  label="Files"
                  secondary
                  disabled={!workspace?.root_path || action.busy}
                  onPress={() =>
                    nav.navigate("Files", { path: workspace?.root_path })
                  }
                />
                <Action
                  label="Manage"
                  secondary
                  onPress={() => {
                    setTitle(workspace?.title ?? params.title);
                    setPanel("manage");
                  }}
                />
              </View>
            </View>
            <Notice
              text={load.error || action.error || workspace?.error || ""}
              error
            />
          </>
        }
        ListEmptyComponent={
          <Notice
            text={load.loading ? "Loading…" : "No active conversations."}
          />
        }
      />
      <Footer>
        <Action
          label="New session"
          disabled={workspace?.status !== "ready" || action.busy}
          onPress={() =>
            nav.navigate("NewSession", {
              workspaceId: params.id,
              directory: workspace?.root_path,
            })
          }
        />
      </Footer>
      <Modal
        visible={panel !== null}
        animationType="slide"
        onRequestClose={() => {
          if (!action.busy) setPanel(null);
        }}
      >
        {panel === "add" && workspace ? (
          <AttachSourceForm
            projectId={workspace.project_id}
            workspaceId={params.id}
            existing={load.data?.sources.map((item) => item.source.id) ?? []}
            close={() => setPanel("manage")}
            attached={() => {
              setPanel("manage");
              void load.refresh();
            }}
          />
        ) : (
          <SafeAreaView style={css.page}>
            <ScrollView
              contentContainerStyle={{ padding: 20, gap: 12 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={css.toolbar}>
                <Text style={css.title}>Workspace</Text>
                <Action
                  label="Done"
                  secondary
                  disabled={action.busy}
                  onPress={() => setPanel(null)}
                />
              </View>
              <Text selectable style={css.muted}>
                {workspace?.root_path}
              </Text>
              <Section title="Sources">
                {load.data?.sources.map((item) => (
                  <Row
                    key={item.source.id}
                    title={pathLabel(item.source.canonical_path)}
                    subtitle={[
                      item.branch_name,
                      item.base_ref,
                      item.mode,
                      item.status,
                      item.error,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    onPress={
                      action.busy
                        ? undefined
                        : () => {
                            setPanel(null);
                            nav.navigate("Files", { path: item.target_path });
                          }
                    }
                  />
                ))}
              </Section>
              <Action
                label="Add source"
                secondary
                disabled={workspace?.status !== "ready" || action.busy}
                onPress={() => setPanel("add")}
              />
              <TextField
                label="Workspace name"
                value={title}
                onChangeText={setTitle}
              />
              <Action
                label="Save name"
                secondary
                disabled={action.busy || !title.trim()}
                onPress={() =>
                  void action.run(async () => {
                    await daemon.renameWorkspace(params.id, title.trim());
                    await load.refresh();
                    if (action.isCurrent()) {
                      nav.setParams({ title: title.trim() });
                      setPanel(null);
                    }
                  })
                }
              />
              {workspace?.status === "error" && (
                <Action
                  label="Retry provisioning"
                  secondary
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
                secondary
                disabled={
                  action.busy ||
                  !workspace ||
                  !["ready", "error"].includes(workspace.status)
                }
                onPress={archive}
              />
              <Notice text={action.error || workspace?.error || ""} error />
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </View>
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
            disabled={action.busy}
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
          <Row
            title={pathLabel(item.canonical_path)}
            subtitle={item.folder_mode}
          />
          <Text selectable style={css.muted}>
            {item.canonical_path}
          </Text>
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
