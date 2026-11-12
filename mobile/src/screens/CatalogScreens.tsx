import { RepositoryPicker, repositoryStatus } from "../components/RepositoryPicker";
import type { RepositoryBranch } from "@zotigo/shared/clientTypes";
import { stateLabel } from "@zotigo/shared/i18n/display";
import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import LoaderCircle from "lucide-react-native/icons/loader-circle";
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
  Animated,
  Easing,
  Platform,
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
  colors,
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
  useLocale();
  const insets = useSafeAreaInsets();
  return (
    <View style={[css.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>
      {children}
    </View>
  );
}
function RunningIndicator() {
  useLocale();
  const rotation = useRef(new Animated.Value(0)).current;
  useFocusEffect(
    useCallback(() => {
      rotation.setValue(0);
      const animation = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
      );
      animation.start();
      return () => animation.stop();
    }, [rotation]),
  );
  return (
    <Animated.View
      accessible
      accessibilityLabel={t("app.running")}
      style={{ transform: [{ rotate: rotation.interpolate({
        inputRange: [0, 1], outputRange: ["0deg", "360deg"],
      }) }] }}
    >
      <LoaderCircle size={13} strokeWidth={1.9} color={colors.muted} />
    </Animated.View>
  );
}
function SessionRow({ item }: { item: CatalogSessionProjection }) {
  useLocale();
  const nav = useNavigation<Nav>();
  return (
    <Row
      title={sessionTitle(item)}
      right={
        item.runtime?.working ? (
          <RunningIndicator />
        ) : item.runtime?.read_state?.unread ? (
          <View
            accessible
            accessibilityLabel={t("app.unread")}
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: "#3b82f6",
            }}
          />
        ) : undefined
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
  const locale = useLocale();
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
    [load.data, query, collapsed, expanded, locale],
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
            label={item.expanded ? t("conversationTimeline.showLess") : t("mobile.showValueMore", {p0: item.remaining})}
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
          accessibilityLabel={`${item.open ? t("common.collapse") : t("common.expand")} ${item.title}`}
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
          accessibilityLabel={`${item.open ? t("common.collapse") : t("common.expand")} ${title}`}
          accessibilityState={{ expanded: item.open }}
          onLongPress={() =>
            nav.navigate(project ? "Project" : "Workspace", {
              id: item.value.id,
              title,
            })
          }
          accessibilityHint={t("mobile.longPressManage")}
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
          label={project ? t("mobile.manageValue", {p0: title}) : t("app.newSessionIn", {p0: title})}
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
                    accessibilityLabel={t("mobile.searchSessionsAndProjects")}
                    placeholder={t("mobile.searchSessionsAndProjects")}
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
                  label={t("mobile.moreOptions")}
                  disabled={action.busy}
                  onPress={() => setPanel("menu")}
                />
              </View>
              <Notice text={load.error || action.error} error />
            </>
          }
          ListEmptyComponent={
            <Notice
              text={load.loading ? t("markdownImage.loading") : t("mobile.noSessionsOrProjects")}
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
                {panel === "project" ? t("searchPalette.newProject") : "More"}
              </Text>
              <Action
                label={t("subagentPanel.done")}
                secondary
                disabled={action.busy}
                onPress={() => setPanel(null)}
              />
            </View>
            {panel === "project" ? (
              <>
                <TextField
                  label={t("app.projectName")}
                  value={name}
                  onChangeText={setName}
                />
                <Notice text={action.error} error />
                <Action
                  label={t("app.createProject")}
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
                  title={t("searchPalette.newProject")}
                  onPress={action.busy ? undefined : () => setPanel("project")}
                />
                <Row
                  title={t("mobile.files")}
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
                  title={t("app.channels")}
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
                  title={t("hostShell.settings")}
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
                  label={action.busy ? t("settingsPage.syncing") : t("mobile.syncCodexSessions")}
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
  projectId,
  value,
  onChange,
}: {
  source: CatalogSource;
  projectId: string;
  value?: CatalogWorkspaceSourceInput;
  onChange: (value?: CatalogWorkspaceSourceInput) => void;
}) {
  useLocale();
  const daemon = useDaemon();
  const [branches, setBranches] = useState<RepositoryBranch[]>([]);
  const [open, setOpen] = useState(false);
  const [branchError, setBranchError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    daemon.repositoryBranches(projectId, source.id).then(items => { if (active) { setBranches(items); setBranchError(""); } }).catch(() => { if (active) setBranchError(t("repositories.branchListFailed")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [daemon, projectId, source.id, open]);
  return (
    <View>
      <View style={css.line}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("mobile.sourceDetailsValue", {p0: source.canonical_path})}
          onPress={() => Alert.alert("Source", source.canonical_path)}
          style={{ flex: 1, minHeight: 44, justifyContent: "center" }}
        >
          <Text style={css.text} numberOfLines={1}>
            {pathLabel(source.canonical_path)}
          </Text>
        </Pressable>
        <Switch
          accessibilityLabel={t("mobile.includeValue", {p0: source.canonical_path})}
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
              label={t("repositories.autoBranch")}
              placeholder={source.default_branch ?? ""}
              value={value.base_ref ?? ""}
              onChangeText={(v) =>
                onChange({ ...value, base_ref: v || undefined })
              }
            />
            <Action label={t(open ? "repositories.hideBranches" : "repositories.chooseBranch")} secondary onPress={() => setOpen(!open)} />
            {open && <>
              <Notice text={loading ? t("repositories.loadingBranches") : branchError} error={!!branchError} />
              <Row title={t("repositories.useDefault")} onPress={() => { onChange({ ...value, base_ref: undefined }); setOpen(false); }} />
              {branches.map(branch => <Row key={branch.ref} title={branch.name} subtitle={t(`repositories.branches.${branch.kind}`)} onPress={() => { onChange({ ...value, base_ref: branch.ref }); setOpen(false); }} />)}
              {!loading && !branchError && !branches.length && <Notice text={t("repositories.noBranches")} />}
              {branches.some(branch => branch.kind === "imported") && <Notice text={t("repositories.importedSnapshotHelp")} />}
            </>}
            <TextField
              label={t("mobile.branchNameOptional")}
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
  useLocale();
  return (
    <View>
      {(["reference", "copy", "direct"] as const).map((mode) => (
        <Action
          key={mode}
          label={`${value === mode ? t("mobile.selected") : ""}${mode}`}
          secondary
          onPress={() => onChange(mode)}
        />
      ))}
      <Notice text={t("mobile.referenceLinksTheOriginalFolderCopyCreatesAWorkspaceCopyDirectUsesTheOriginalFolder")} />
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
  useLocale();
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
            projectId={project.id}
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
            <Text style={css.title}>{t("app.newWorkspace")}</Text>
            <TextField
              label={t("mobile.workspaceTitle")}
              value={title}
              onChangeText={setTitle}
            />
            <Notice text={t("mobile.chooseSourcesToIncludeOrCreateAnEmptyWorkspace")} />
          </>
        }
        ListFooterComponent={
          <>
            <Notice text={mutation.error} error />
            <Action
              label={t("app.createWorkspace")}
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
              label={t("app.cancel")}
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
  useLocale();
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
            subtitle={item.status === "ready" ? undefined : stateLabel(item.status)}
            onPress={() =>
              nav.navigate("Workspace", { id: item.id, title: item.title })
            }
          />
        )}
        ListHeaderComponent={
          <>
            <View style={css.toolbar}>
              <Text style={css.muted}>{t("app.workspaces")}</Text>
              <Action
                label={t("settingsPage.manage")}
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
          <Notice text={load.loading ? t("markdownImage.loading") : t("mobile.noWorkspacesYet")} />
        }
      />
      <Footer>
        <Action
          label={t("app.newWorkspace")}
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
                <Text style={css.title}>{t("app.project")}</Text>
                <Action
                  label={t("subagentPanel.done")}
                  secondary
                  disabled={action.busy}
                  onPress={() => setPanel(null)}
                />
              </View>
              <Row
                title={t("mobile.projectSources")}
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
                label={t("app.projectName")}
                value={name}
                onChangeText={setName}
              />
              <Notice text={action.error} error />
              <Action
                label={t("mobile.saveName")}
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
  useLocale();
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
          <Text style={css.title}>{t("mobile.addWorkspaceSource")}</Text>
        }
        ListEmptyComponent={
          <Notice
            text={
              load.loading
                ? t("mobile.loadingSources")
                : t("mobile.noUnusedSourcesAddASourceToTheProjectFirst")
            }
          />
        }
        renderItem={({ item }) => (
          <SourceOptions
            projectId={projectId}
            source={item}
            value={selected?.source_id === item.id ? selected : undefined}
            onChange={setSelected}
          />
        )}
        ListFooterComponent={
          <>
            <Notice text={load.error || mutation.error} error />
            <Action
              label={t("mobile.addSelectedSource")}
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
              label={t("app.cancel")}
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
  useLocale();
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
          t("mobile.archiveDirty", { paths: preview.dirty_worktree_paths.join("\n") }),
        );
      Alert.alert(
        t("app.archiveWorkspace"),
        t("mobile.archiveSummary", { title: preview.workspace_title, path: preview.root_path, count: preview.worktree_paths.length, changes: t("mobile.noDirtyWorktreesReported") }),
        [
          { text: t("app.cancel"), style: "cancel" },
          {
            text: t("app.archive"),
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
                  ? t("app.unpinWorkspace")
                  : t("app.pinWorkspace")
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
                  ? t("mobile.conversations")
                  : (workspace?.status ? stateLabel(workspace.status) : t("markdownImage.loading"))}
              </Text>
              <View style={{ flexDirection: "row" }}>
                <Action
                  label={t("mobile.files")}
                  secondary
                  disabled={!workspace?.root_path || action.busy}
                  onPress={() =>
                    nav.navigate("Files", { path: workspace?.root_path })
                  }
                />
                <Action
                  label={t("settingsPage.manage")}
                  secondary
                  onPress={() => {
                    setTitle(workspace?.title ?? params.title);
                    setPanel("manage");
                  }}
                />
              </View>
            </View>
            {load.data?.sources.filter(source => source.used_cached_base).map(source => <Notice key={source.source.id} text={source.base_synced_at ? t("repositories.workspaceUsedCache", { time: new Date(source.base_synced_at).toLocaleString() }) : t("repositories.workspaceUsedCacheUnknown")} />)}
            <Notice
              text={load.error || action.error || workspace?.error || ""}
              error
            />
          </>
        }
        ListEmptyComponent={
          <Notice
            text={load.loading ? t("markdownImage.loading") : t("mobile.noActiveConversations")}
          />
        }
      />
      <Footer>
        <Action
          label={t("app.newSession")}
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
                <Text style={css.title}>{t("channelsPage.workspace")}</Text>
                <Action
                  label={t("subagentPanel.done")}
                  secondary
                  disabled={action.busy}
                  onPress={() => setPanel(null)}
                />
              </View>
              <Text selectable style={css.muted}>
                {workspace?.root_path}
              </Text>
              <Section title={t("app.sources")}>
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
                label={t("app.addSource2")}
                secondary
                disabled={workspace?.status !== "ready" || action.busy}
                onPress={() => setPanel("add")}
              />
              <TextField
                label={t("app.workspaceName")}
                value={title}
                onChangeText={setTitle}
              />
              <Action
                label={t("mobile.saveName")}
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
                  label={t("mobile.retryProvisioning")}
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
                label={t("mobile.reviewArchive")}
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
  useLocale();
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
            label={t("app.addSource2")}
            disabled={action.busy}
            onPress={() =>
              nav.navigate("SourcePicker", { projectId: params.projectId })
            }
          />
          <Notice text={load.error || action.error} error />
        </>
      }
      ListEmptyComponent={<Notice text={t("mobile.noProjectSources")} />}
      renderItem={({ item }) => (
        <Section title={item.kind}>
          <Row
            title={pathLabel(item.canonical_path)}
            subtitle={item.repository_id ? repositoryStatus(item) : item.folder_mode}
          />
          <Text selectable style={css.muted}>
            {item.canonical_path}
          </Text>
          <Action
            label={t("mobile.removeFromProject")}
            danger
            disabled={action.busy}
            onPress={() =>
              Alert.alert(
                t("mobile.removeSource"),
                t("mobile.removeValueFromThisProjectExistingWorkspaceBindingsAndFilesArePreserved", {p0: item.canonical_path}),
                [
                  { text: t("app.cancel"), style: "cancel" },
                  {
                    text: t("favoriteModelSettings.remove"),
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
  useLocale();
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
          <Section title={t("repositories.library")}>
            <RepositoryPicker projectId={params.projectId} onLinked={() => nav.goBack()} />
          </Section>
          <Text style={css.title}>{t("repositories.localSources")}</Text>
          <Notice text={t("repositories.localHelp")} />
          <TextField
            label={t("mobile.directoryOnDaemon")}
            value={path}
            onChangeText={(value) => {
              pathRevision.current++;
              setPath(value);
              setInspection(undefined);
            }}
          />
          <Action
            label={t("mobile.browse")}
            disabled={action.busy}
            onPress={() => browse(path)}
          />
          {listing?.parentPath && (
            <Action
              label={t("directoryBrowser.parentDirectory")}
              secondary
              disabled={action.busy}
              onPress={() => browse(listing.parentPath!)}
            />
          )}
          <Action
            label={t("mobile.inspectSelectedDirectory")}
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
                label={t("mobile.addInspectedSource")}
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
            <Notice text={t("mobile.directoryListingTruncatedEnterAMoreSpecificPath")} />
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
