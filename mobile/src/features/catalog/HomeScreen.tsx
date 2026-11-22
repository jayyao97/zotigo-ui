import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../../platform/i18n";
import LoaderCircle from "lucide-react-native/icons/loader-circle";
import SquarePen from "lucide-react-native/icons/square-pen";
import FolderOpen from "lucide-react-native/icons/folder-open";
import Folder from "lucide-react-native/icons/folder";
import FolderPlus from "lucide-react-native/icons/folder-plus";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Search from "lucide-react-native/icons/search";
import X from "lucide-react-native/icons/x";
import MessageSquare from "lucide-react-native/icons/message-square";
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
  Animated,
  Easing,
  Platform,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useVisibleEffect } from "../../platform/visibility";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CatalogWorkspace, CatalogSessionProjection } from "@zotigo/shared/zotigod";
import { useDaemon } from "../../platform/context";
import type { Routes } from "../../navigation";
import { useLayoutTransition } from "../../components/useLayoutTransition";
import { BottomSheet } from "../../components/BottomSheet";
import {
  Action,
  EmptyState,
  IconButton,
  Notice,
  TextField,
  colors,
  errorText,
  radius,
  space,
  type,
} from "../../components/ui";
import {
  sessionId,
  sessionTitle,
  catalogRows,
  stickyCatalogRows,
  type CatalogRow,
  type CatalogLayout,
} from "../../core/catalog";
import { compactAge, sessionActivity } from "../../core/relativeTime";
import { useCatalogLoad, useMutation } from "./hooks";

type Nav = NativeStackNavigationProp<Routes>;
const indent = 20;

function RunningIndicator() {
  useLocale();
  const rotation = useRef(new Animated.Value(0)).current;
  useVisibleEffect(
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
      style={{
        transform: [
          { rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
        ],
      }}
    >
      <LoaderCircle size={14} strokeWidth={2} color={colors.accent} />
    </Animated.View>
  );
}

/**
 * Title on the left; one status on the right: running, unread, or age.
 * `context` names the project and workspace where the tree does not.
 */
export function SessionRow({
  item,
  depth,
  context,
}: {
  item: CatalogSessionProjection;
  depth: number;
  context?: string;
}) {
  const locale = useLocale();
  const nav = useNavigation<Nav>();
  const unread = !!item.runtime?.read_state?.unread;
  const status = item.runtime?.working ? (
    <RunningIndicator />
  ) : unread ? (
    <View
      accessible
      accessibilityLabel={t("app.unread")}
      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentStrong }}
    />
  ) : (
    <Text style={{ color: colors.faint, ...type.footnote }}>
      {compactAge(sessionActivity(item), Date.now(), locale)}
    </Text>
  );
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        nav.navigate("Conversation", { id: sessionId(item), title: sessionTitle(item) })
      }
      style={({ pressed }) => [
        css.line,
        {
          paddingLeft: space.md + depth * indent,
          paddingRight: space.md,
          borderRadius: radius.sm,
          backgroundColor: pressed ? colors.pressed : "transparent",
        },
      ]}
    >
      <View style={{ flex: 1, paddingVertical: context ? 7 : 0 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.text, ...type.callout, fontWeight: unread ? "600" : "400" }}
        >
          {sessionTitle(item)}
        </Text>
        {!!context && (
          <Text numberOfLines={1} style={{ color: colors.faint, ...type.caption }}>
            {context}
          </Text>
        )}
      </View>
      <View style={{ minWidth: 28, alignItems: "flex-end" }}>{status}</View>
    </Pressable>
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
  const [creating, setCreating] = useState(false);
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
  const [sticky, setSticky] = useState<ReturnType<typeof stickyCatalogRows>>([]);
  const refreshSticky = useCallback(() => {
    const next = stickyCatalogRows(currentRows.current, layouts.current, offset.current);
    setSticky((previous) =>
      previous.length === next.length &&
      previous.every((entry, i) => entry.row === next[i].row && entry.top === next[i].top)
        ? previous
        : next,
    );
  }, []);
  useEffect(() => {
    refreshSticky();
  }, [rows, refreshSticky]);
  const Cell = useMemo(() => {
    type Props = ComponentProps<
      NonNullable<ComponentProps<typeof FlatList<CatalogRow>>["CellRendererComponent"]>
    >;
    const CellView: ComponentType<Props> = ({ children, onLayout, style, item }) => (
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
  const hiddenBehindSticky = (key: string, overlay: boolean) =>
    !overlay && sticky.some((entry) => entry.row.key === key);
  const renderRow = (item: CatalogRow, overlay = false) => {
    if (item.kind === "session")
      return <SessionRow item={item.value} depth={item.depth} context={item.context} />;
    if (item.kind === "notice")
      return (
        <Text
          style={{
            color: colors.faint,
            ...type.footnote,
            paddingVertical: space.sm,
            paddingLeft: space.md + (item.depth ?? 1) * indent,
          }}
        >
          {item.title}
        </Text>
      );
    if (item.kind === "more")
      return (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            animateLayout();
            setExpanded((previous) => {
              const next = new Set(previous);
              if (next.has(item.group)) next.delete(item.group);
              else next.add(item.group);
              return next;
            });
          }}
          style={({ pressed }) => [
            css.line,
            { minHeight: 40, paddingLeft: space.md + item.depth * indent, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={{ color: colors.muted, ...type.footnote, fontWeight: "500" }}>
            {item.expanded
              ? t("conversationTimeline.showLess")
              : t("mobileUi.showMore", { count: item.remaining })}
          </Text>
        </Pressable>
      );
    const Chevron = item.open ? ChevronDown : ChevronRight;
    if (item.kind === "heading")
      return (
        <View
          accessibilityElementsHidden={hiddenBehindSticky(item.key, overlay)}
          importantForAccessibility={hiddenBehindSticky(item.key, overlay) ? "no-hide-descendants" : "auto"}
          style={[css.line, { marginTop: space.md, paddingRight: space.xs }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.open ? t("common.collapse") : t("common.expand")} ${item.title}`}
            accessibilityState={{ expanded: item.open }}
            onPress={() => toggle(item.key)}
            style={[css.line, { flex: 1, gap: 4, paddingLeft: space.md }]}
          >
            <Text style={{ color: colors.muted, ...type.section }}>{item.title}</Text>
            <Chevron size={14} color={colors.faint} />
          </Pressable>
          {item.key === "projects" && (
            <IconButton
              icon={FolderPlus}
              color={colors.muted}
              label={t("searchPalette.newProject")}
              onPress={() => setCreating(true)}
            />
          )}
        </View>
      );
    const FolderIcon = item.open ? FolderOpen : Folder;
    const project = item.kind === "project";
    const title = project ? item.value.name : item.value.title;
    const depth = project ? 0 : item.depth;
    return (
      <View
        accessibilityElementsHidden={hiddenBehindSticky(item.key, overlay)}
        importantForAccessibility={hiddenBehindSticky(item.key, overlay) ? "no-hide-descendants" : "auto"}
        style={[css.line, { paddingLeft: depth * indent }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.open ? t("common.collapse") : t("common.expand")} ${title}`}
          accessibilityState={{ expanded: item.open }}
          accessibilityHint={t("mobile.longPressManage")}
          onPress={() => toggle(item.key)}
          onLongPress={() =>
            nav.navigate(project ? "Project" : "Workspace", { id: item.value.id, title })
          }
          style={({ pressed }) => [
            css.line,
            {
              flex: 1,
              gap: 10,
              paddingLeft: space.md,
              borderRadius: radius.sm,
              backgroundColor: pressed ? colors.pressed : "transparent",
            },
          ]}
        >
          <FolderIcon size={17} strokeWidth={1.8} color={colors.muted} />
          <Text
            style={{
              flex: 1,
              color: colors.text,
              ...type.callout,
              fontWeight: project ? "600" : "500",
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {!project && item.value.status !== "ready" && (
            <Text style={{ color: colors.warning, ...type.caption }}>
              {t("mobileUi.workspaceNotReady")}
            </Text>
          )}
        </Pressable>
        <IconButton
          icon={project ? Ellipsis : SquarePen}
          color={colors.muted}
          label={
            project
              ? t("mobileUi.projectOptions", { name: title })
              : t("mobileUi.newInWorkspace", { name: title })
          }
          onPress={() =>
            project
              ? nav.navigate("Project", { id: item.value.id, title })
              : nav.navigate("NewSession", { workspaceId: item.value.id })
          }
        />
      </View>
    );
  };
  const empty = load.data && !load.loading && !rows.length;
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
          keyboardDismissMode="on-drag"
          contentContainerStyle={[css.body, { paddingBottom: Math.max(space.lg, insets.bottom) }]}
          data={rows}
          keyExtractor={(item) => item.key}
          initialNumToRender={18}
          windowSize={7}
          refreshing={load.loading && !!load.data}
          onRefresh={() => void load.refresh()}
          renderItem={({ item }) => renderRow(item)}
          ListHeaderComponent={
            <>
              <View style={css.search}>
                <Search size={16} color={colors.faint} />
                <TextInput
                  accessibilityLabel={t("mobile.searchSessionsAndProjects")}
                  placeholder={t("mobileUi.searchPlaceholder")}
                  placeholderTextColor={colors.faint}
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0, height: 38 }}
                />
                {!!query && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("app.cancel")}
                    hitSlop={10}
                    onPress={() => setQuery("")}
                  >
                    <X size={16} color={colors.muted} />
                  </Pressable>
                )}
              </View>
              <Notice text={load.error || action.error} error />
            </>
          }
          ListEmptyComponent={
            !load.data ? (
              <Notice text={load.loading ? t("markdownImage.loading") : ""} />
            ) : query ? (
              <Notice text={t("mobileUi.noResults", { query })} />
            ) : empty ? (
              <EmptyState
                icon={MessageSquare}
                title={t("mobileUi.emptyHomeTitle")}
                message={t("mobileUi.emptyHomeMessage")}
                action={
                  <View style={{ alignItems: "center", gap: space.xs }}>
                    <Action
                      primary
                      icon={SquarePen}
                      label={t("mobileUi.newConversation")}
                      onPress={() => nav.navigate("NewSession", {})}
                    />
                    <Action
                      secondary
                      icon={FolderPlus}
                      label={t("searchPalette.newProject")}
                      onPress={() => setCreating(true)}
                    />
                  </View>
                }
              />
            ) : null
          }
        />
        <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: space.sm, right: space.sm }}>
          {sticky.map(({ row, top }, index) => (
            <View
              key={row.key}
              style={{
                position: "absolute",
                top,
                left: 0,
                right: 0,
                zIndex: 3 - index,
                backgroundColor: colors.background,
              }}
            >
              {renderRow(row, true)}
            </View>
          ))}
        </View>
      </View>
      <BottomSheet
        visible={creating}
        title={t("searchPalette.newProject")}
        disabled={action.busy}
        onClose={() => setCreating(false)}
      >
        <TextField
          label={t("app.projectName")}
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
        />
        <Notice text={action.error} error />
        <Action
          primary
          block
          label={t("mobileUi.create")}
          disabled={action.busy || !name.trim()}
          onPress={() =>
            void action.run(async () => {
              const project = await daemon.createProject(name.trim());
              if (!action.isCurrent() || daemon.signal.aborted) return;
              setCreating(false);
              setName("");
              nav.navigate("Project", { id: project.id, title: project.name });
            })
          }
        />
      </BottomSheet>
    </View>
  );
}

const css = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: space.sm },
  line: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.sm,
    marginTop: space.xs,
    marginBottom: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
