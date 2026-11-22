import type { DirectoryListing } from "@zotigo/shared/clientTypes";
import { t } from "@zotigo/shared/i18n/index";
import type { FolderSourceMode } from "@zotigo/shared/zotigod";
import { useCallback, useRef, useState } from "react";
import { Alert, FlatList, StyleSheet, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Folder from "lucide-react-native/icons/folder";
import GitFork from "lucide-react-native/icons/git-fork";
import { RepositoryPicker, repositoryStatus } from "../../components/RepositoryPicker";
import {
  Action,
  IconButton,
  ListGroup,
  ListRow,
  Notice,
  Section,
  TextField,
  colors,
  space,
  styles,
} from "../../components/ui";
import { pathLabel } from "../../core/catalog";
import type { Routes } from "../../navigation";
import { useDaemon } from "../../platform/context";
import { useLocale } from "../../platform/i18n";
import { Footer, useCatalogLoad, useMutation } from "./hooks";
import { ModeSelector } from "./SourceOptions";

type Nav = NativeStackNavigationProp<Routes>;

export function SourcesScreen() {
  useLocale();
  const { params } = useRoute<RouteProp<Routes, "Sources">>();
  const daemon = useDaemon();
  const nav = useNavigation<Nav>();
  const action = useMutation();
  const load = useCatalogLoad(
    useCallback(() => daemon.project(params.projectId), [daemon, params.projectId]),
  );
  return (
    <View style={styles.screen}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        data={load.data?.sources ?? []}
        keyExtractor={(s) => s.id}
        refreshing={load.loading}
        onRefresh={() => void load.refresh()}
        ListHeaderComponent={<Notice text={load.error || action.error} error />}
        ListEmptyComponent={
          load.loading ? null : <Notice text={t("mobile.noProjectSources")} />
        }
        renderItem={({ item }) => (
          <ListGroup>
            <ListRow
              icon={item.kind === "git" ? GitFork : Folder}
              title={pathLabel(item.canonical_path)}
              subtitle={[
                item.canonical_path,
                item.repository_id ? repositoryStatus(item) : item.folder_mode,
              ]
                .filter(Boolean)
                .join("\n")}
            />
            <ListRow
              danger
              title={t("mobile.removeFromProject")}
              accessibilityLabel={t("app.remove", { p0: pathLabel(item.canonical_path) })}
              disabled={action.busy}
              onPress={() =>
                Alert.alert(
                  t("mobile.removeSource"),
                  t(
                    "mobile.removeValueFromThisProjectExistingWorkspaceBindingsAndFilesArePreserved",
                    { p0: item.canonical_path },
                  ),
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
          </ListGroup>
        )}
      />
      <Footer>
        <Action
          primary
          block
          label={t("app.addSource2")}
          disabled={action.busy}
          onPress={() => nav.navigate("SourcePicker", { projectId: params.projectId })}
        />
      </Footer>
    </View>
  );
}

/**
 * Add a source: link a repository from the library, or pick a folder on the
 * device. Picking a folder inspects it first so git checkouts and plain
 * folders get the right options before anything is added.
 */
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
      if (daemon.signal.aborted || !action.isCurrent() || revision !== pathRevision.current)
        return;
      setListing(result);
      setPath(result.path);
      setInspection(undefined);
    });
  };
  const inspect = () => {
    const target = path;
    const revision = pathRevision.current;
    void action.run(async () => {
      const result = await daemon.inspectSource(target);
      if (daemon.signal.aborted || !action.isCurrent() || revision !== pathRevision.current)
        return;
      setInspection(result);
    });
  };
  return (
    <FlatList
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={styles.screen}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
      data={listing?.entries.filter((entry) => entry.kind === "directory") ?? []}
      keyExtractor={(entry) => entry.path}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={
        <View style={{ gap: space.lg, paddingBottom: space.sm }}>
          <Section title={t("repositories.library")}>
            <RepositoryPicker projectId={params.projectId} onLinked={() => nav.goBack()} />
          </Section>
          <Section title={t("repositories.localSources")} footer={t("repositories.localHelp")}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.xs }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t("mobile.directoryOnDaemon")}
                  value={path}
                  returnKeyType="go"
                  onSubmitEditing={() => browse(path)}
                  onChangeText={(value) => {
                    pathRevision.current++;
                    setPath(value);
                    setInspection(undefined);
                  }}
                />
              </View>
              <IconButton
                icon={ArrowUp}
                color={colors.muted}
                label={t("directoryBrowser.parentDirectory")}
                disabled={action.busy || !listing?.parentPath}
                onPress={() => listing?.parentPath && browse(listing.parentPath)}
              />
            </View>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Action label={t("mobile.browse")} disabled={action.busy} onPress={() => browse(path)} />
              {!inspection && (
                <Action
                  primary
                  label={t("directoryBrowser.useThisFolder")}
                  disabled={action.busy || !path.trim()}
                  onPress={inspect}
                />
              )}
            </View>
          </Section>
          {inspection && (
            <View style={{ gap: space.sm }}>
              <ListGroup>
                <ListRow
                  icon={inspection.kind === "git" ? GitFork : Folder}
                  title={pathLabel(inspection.canonical_path)}
                  subtitle={inspection.canonical_path}
                />
              </ListGroup>
              {inspection.kind === "folder" && <ModeSelector value={mode} onChange={setMode} />}
              <Action
                primary
                block
                label={t("app.addSource2")}
                disabled={action.busy}
                onPress={() =>
                  void action.run(async () => {
                    await daemon.addSource(
                      params.projectId,
                      inspection.canonical_path,
                      inspection.kind === "folder" ? mode : undefined,
                    );
                    if (!daemon.signal.aborted && action.isCurrent()) nav.goBack();
                  })
                }
              />
            </View>
          )}
          <Notice text={action.error} error />
          {listing?.truncated && (
            <Notice text={t("mobile.directoryListingTruncatedEnterAMoreSpecificPath")} />
          )}
        </View>
      }
      renderItem={({ item }) => (
        <ListRow
          icon={Folder}
          title={item.name}
          disabled={action.busy}
          onPress={() => browse(item.path)}
        />
      )}
    />
  );
}
function Separator() {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        marginLeft: space.lg,
        backgroundColor: colors.separator,
      }}
    />
  );
}
