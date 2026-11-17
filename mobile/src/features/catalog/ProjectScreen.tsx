import { stateLabel } from "@zotigo/shared/i18n/display";
import { t } from "@zotigo/shared/i18n/index";
import type {
  CatalogProject,
  CatalogSource,
  CatalogWorkspaceSourceInput,
} from "@zotigo/shared/zotigod";
import { useCallback, useState } from "react";
import { FlatList, Modal, RefreshControl, SafeAreaView, ScrollView, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Folder from "lucide-react-native/icons/folder";
import GitFork from "lucide-react-native/icons/git-fork";
import Pencil from "lucide-react-native/icons/pencil";
import Pin from "lucide-react-native/icons/pin";
import PinOff from "lucide-react-native/icons/pin-off";
import Plus from "lucide-react-native/icons/plus";
import { BottomSheet } from "../../components/BottomSheet";
import {
  Action,
  ListGroup,
  ListRow,
  Notice,
  Section,
  TextField,
  colors,
  space,
  styles,
} from "../../components/ui";
import type { Routes } from "../../navigation";
import { useDaemon } from "../../platform/context";
import { useLocale } from "../../platform/i18n";
import { SheetHeader, useCatalogLoad, useMutation } from "./hooks";
import { SourceOptions } from "./SourceOptions";

type Nav = NativeStackNavigationProp<Routes>;

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
  const [selected, setSelected] = useState<Record<string, CatalogWorkspaceSourceInput>>({});
  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
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
          <View style={{ gap: space.md }}>
            <SheetHeader
              title={t("app.newWorkspace")}
              action={t("app.cancel")}
              disabled={mutation.busy}
              onAction={close}
            />
            <TextField
              label={t("mobile.workspaceTitle")}
              value={title}
              onChangeText={setTitle}
              autoFocus
            />
            <Notice text={t("mobile.chooseSourcesToIncludeOrCreateAnEmptyWorkspace")} />
          </View>
        }
        ListFooterComponent={
          <View style={{ gap: space.sm, marginTop: space.sm }}>
            <Notice text={mutation.error} error />
            <Action
              primary
              block
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
          </View>
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
  const [panel, setPanel] = useState<"rename" | "create" | null>(null);
  const action = useMutation();
  const load = useCatalogLoad(
    useCallback(async () => {
      const [project, workspaces, navigation] = await Promise.all([
        daemon.project(params.id),
        daemon.workspaces(params.id),
        daemon.navigation(),
      ]);
      return { project, workspaces, navigation };
    }, [daemon, params.id]),
  );
  const pinned = !!load.data?.navigation.pinned.some(
    (item) => item.kind === "project" && item.id === params.id,
  );
  const workspaces = load.data?.workspaces.filter((item) => item.status !== "deleted") ?? [];
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={load.loading}
            onRefresh={() => void load.refresh()}
            tintColor={colors.muted}
          />
        }
      >
        <Notice text={load.error || action.error} error />
        <Section title={t("app.workspaces")}>
          <ListGroup>
            {workspaces.map((item) => (
              <ListRow
                key={item.id}
                icon={Folder}
                title={item.title}
                value={item.status === "ready" ? undefined : stateLabel(item.status)}
                onPress={() => nav.navigate("Workspace", { id: item.id, title: item.title })}
              />
            ))}
            <ListRow
              icon={Plus}
              title={t("app.newWorkspace")}
              chevron={false}
              disabled={!load.data || action.busy}
              onPress={() => setPanel("create")}
            />
          </ListGroup>
        </Section>
        <Section title={t("app.project")}>
          <ListGroup>
            <ListRow
              icon={pinned ? PinOff : Pin}
              title={pinned ? t("app.unpinProject") : t("app.pinProject")}
              chevron={false}
              disabled={action.busy || !load.data}
              onPress={() =>
                void action.run(async () => {
                  await daemon.pinProject(params.id, !pinned);
                  await load.refresh();
                })
              }
            />
            <ListRow
              icon={Pencil}
              title={t("app.renameProject")}
              disabled={action.busy}
              onPress={() => {
                setName(load.data?.project.name ?? params.title);
                setPanel("rename");
              }}
            />
            <ListRow
              icon={GitFork}
              title={t("mobileUi.manageSources")}
              disabled={action.busy}
              onPress={() => nav.navigate("Sources", { projectId: params.id, title: params.title })}
            />
          </ListGroup>
        </Section>
      </ScrollView>
      <BottomSheet
        visible={panel === "rename"}
        title={t("app.renameProject")}
        disabled={action.busy}
        onClose={() => setPanel(null)}
      >
        <TextField label={t("app.projectName")} value={name} onChangeText={setName} autoFocus />
        <Notice text={action.error} error />
        <Action
          primary
          block
          label={t("app.save")}
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
      </BottomSheet>
      <Modal
        visible={panel === "create"}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!action.busy) setPanel(null);
        }}
      >
        {panel === "create" && load.data && (
          <WorkspaceForm
            project={load.data.project}
            close={() => setPanel(null)}
            created={(id, title) => {
              setPanel(null);
              nav.navigate("Workspace", { id, title });
            }}
          />
        )}
      </Modal>
    </View>
  );
}
