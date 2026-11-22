import { stateLabel } from "@zotigo/shared/i18n/display";
import { t } from "@zotigo/shared/i18n/index";
import type { CatalogWorkspaceSourceInput } from "@zotigo/shared/zotigod";
import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Modal, SafeAreaView, ScrollView, Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Folder from "lucide-react-native/icons/folder";
import FolderOpen from "lucide-react-native/icons/folder-open";
import GitFork from "lucide-react-native/icons/git-fork";
import Pin from "lucide-react-native/icons/pin";
import PinOff from "lucide-react-native/icons/pin-off";
import Plus from "lucide-react-native/icons/plus";
import Settings2 from "lucide-react-native/icons/settings-2";
import SquarePen from "lucide-react-native/icons/square-pen";
import {
  Action,
  ListGroup,
  ListRow,
  Loading,
  Notice,
  Section,
  TextField,
  space,
  styles,
} from "../../components/ui";
import { pathLabel, sessionId, visibleSessions } from "../../core/catalog";
import type { Routes } from "../../navigation";
import { useDaemon } from "../../platform/context";
import { useLocale } from "../../platform/i18n";
import { SessionRow } from "./HomeScreen";
import { Footer, SheetHeader, useCatalogLoad, useMutation } from "./hooks";
import { SourceOptions } from "./SourceOptions";

type Nav = NativeStackNavigationProp<Routes>;

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
    <SafeAreaView style={styles.screen}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        data={available}
        keyExtractor={(source) => source.id}
        ListHeaderComponent={
          <SheetHeader
            title={t("mobile.addWorkspaceSource")}
            action={t("app.cancel")}
            disabled={mutation.busy}
            onAction={close}
          />
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
          <View style={{ gap: space.sm }}>
            <Notice text={load.error || mutation.error} error />
            <Action
              primary
              block
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
          </View>
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
  const workspacePinned = !!load.data?.navigation.pinned.some(
    (p) => p.kind === "workspace" && p.id === params.id,
  );
  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}
        data={sessions}
        keyExtractor={sessionId}
        refreshing={load.loading}
        onRefresh={() => void load.refresh()}
        renderItem={({ item }) => <SessionRow item={item} depth={0} />}
        ListHeaderComponent={
          <View style={{ gap: space.lg, paddingTop: space.lg, paddingBottom: space.sm }}>
            <Notice
              text={load.error || action.error || workspace?.error || ""}
              error
            />
            {workspace && workspace.status !== "ready" && (
              <Notice text={stateLabel(workspace.status)} />
            )}
            {load.data?.sources.filter(source => source.used_cached_base).map(source => <Notice key={source.source.id} text={source.base_synced_at ? t("repositories.workspaceUsedCache", { time: new Date(source.base_synced_at).toLocaleString() }) : t("repositories.workspaceUsedCacheUnknown")} />)}
            <ListGroup>
              <ListRow
                icon={workspacePinned ? PinOff : Pin}
                title={workspacePinned ? t("app.unpinWorkspace") : t("app.pinWorkspace")}
                chevron={false}
                disabled={action.busy || !load.data}
                onPress={() =>
                  void action.run(async () => {
                    await daemon.pinWorkspace(params.id, !workspacePinned);
                    await load.refresh();
                  })
                }
              />
              <ListRow
                icon={FolderOpen}
                title={t("app.browseFiles")}
                disabled={!workspace?.root_path || action.busy}
                onPress={() => nav.navigate("Files", { path: workspace?.root_path })}
              />
              <ListRow
                icon={Settings2}
                title={t("settingsPage.manage")}
                disabled={action.busy}
                onPress={() => {
                  setTitle(workspace?.title ?? params.title);
                  setPanel("manage");
                }}
              />
            </ListGroup>
            <Text style={[styles.sectionTitle, { marginTop: space.sm }]}>{t("mobile.conversations")}</Text>
          </View>
        }
        ListEmptyComponent={
          load.loading ? <Loading /> : <Notice text={t("mobileUi.noConversationsYet")} />
        }
      />
      <Footer>
        <Action
          primary
          block
          icon={SquarePen}
          label={t("mobileUi.newConversation")}
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
        presentationStyle="pageSheet"
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
          <SafeAreaView style={styles.screen}>
            <ScrollView
              contentContainerStyle={{ padding: space.lg, gap: space.xl }}
              keyboardShouldPersistTaps="handled"
            >
              <SheetHeader
                title={t("mobileUi.manageWorkspace")}
                action={t("subagentPanel.done")}
                disabled={action.busy}
                onAction={() => setPanel(null)}
              />
              <Notice text={action.error || workspace?.error || ""} error />
              <View style={{ gap: space.sm }}>
                <TextField
                  label={t("app.workspaceName")}
                  value={title}
                  onChangeText={setTitle}
                  help={workspace?.root_path}
                />
                <Action
                  label={t("mobile.saveName")}
                  disabled={action.busy || !title.trim() || title.trim() === workspace?.title}
                  onPress={() =>
                    void action.run(async () => {
                      await daemon.renameWorkspace(params.id, title.trim());
                      await load.refresh();
                      if (action.isCurrent()) nav.setParams({ title: title.trim() });
                    })
                  }
                />
              </View>
              <Section title={t("app.sources")}>
                <ListGroup>
                  {load.data?.sources.map((item) => (
                    <ListRow
                      key={item.source.id}
                      icon={item.source.kind === "git" ? GitFork : Folder}
                      title={pathLabel(item.source.canonical_path)}
                      subtitle={[
                        item.branch_name,
                        item.base_ref,
                        item.mode,
                        item.status === "ready" ? "" : stateLabel(item.status),
                        item.error,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      disabled={action.busy}
                      onPress={() => {
                        setPanel(null);
                        nav.navigate("Files", { path: item.target_path });
                      }}
                    />
                  ))}
                  <ListRow
                    icon={Plus}
                    title={t("app.addSource2")}
                    chevron={false}
                    disabled={workspace?.status !== "ready" || action.busy}
                    onPress={() => setPanel("add")}
                  />
                </ListGroup>
              </Section>
              <ListGroup>
                {workspace?.status === "error" && (
                  <ListRow
                    title={t("mobile.retryProvisioning")}
                    chevron={false}
                    disabled={action.busy}
                    onPress={() =>
                      void action.run(async () => {
                        await daemon.retryWorkspace(params.id);
                        await load.refresh();
                      })
                    }
                  />
                )}
                <ListRow
                  danger
                  title={t("app.archiveWorkspace2")}
                  disabled={
                    action.busy || !workspace || !["ready", "error"].includes(workspace.status)
                  }
                  onPress={archive}
                />
              </ListGroup>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </View>
  );
}
