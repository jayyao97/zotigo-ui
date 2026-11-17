import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import { VideoPreview } from "../components/VideoPreview";
import type { VideoFileSnapshot } from "@zotigo/shared/clientTypes";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Ban from "lucide-react-native/icons/ban";
import FileText from "lucide-react-native/icons/file-text";
import Folder from "lucide-react-native/icons/folder";
import { usePreventRemove } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type {
  DirectoryListing,
  TextFileSnapshot,
} from "@zotigo/shared/clientTypes";
import { ApiError } from "../core/client";
import { daemonPath, fileSaveInput, imagePreviewUri } from "../core/fileEditor";
import { useDaemon } from "../platform/context";
import type { Routes } from "../navigation";
import { BottomSheet } from "../components/BottomSheet";
import {
  Action,
  IconButton,
  ListRow,
  Notice,
  TextField,
  colors,
  radius,
  space,
  type,
} from "../components/ui";

type Props = NativeStackScreenProps<Routes, "Files">;
type Capabilities = {
  read: boolean;
  write: boolean;
  list: boolean;
  image?: boolean;
};
export function FilesScreen({ route, navigation }: Props) {
  useLocale();
  const client = useDaemon();
  const headerHeight = useHeaderHeight();
  const sessionId = route.params?.sessionId;
  const [path, setPath] = useState(route.params?.path ?? "");
  const [capabilities, setCapabilities] = useState<Capabilities>();
  const [directory, setDirectory] = useState<DirectoryListing>();
  const [file, setFile] = useState<TextFileSnapshot>();
  const [image, setImage] = useState<string>();
  const [video, setVideo] = useState<VideoFileSnapshot>();
  const [draft, setDraft] = useState("");
  // Typing a path is the rare case, so it lives one tap away from the list.
  const [goTo, setGoTo] = useState<string>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const alive = useRef(true);
  const dirty = !!file && draft !== file.content;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  usePreventRemove(dirty || busy, ({ data }) => {
    if (locked.current) {
      Alert.alert(t("mobile.pleaseWait"), t("mobile.waitForTheCurrentOperationToFinish"));
      return;
    }
    Alert.alert(
      t("mobile.discardUnsavedChanges"),
      t("mobile.yourEditsHaveNotBeenSavedToTheDaemon"),
      [
        { text: t("mobile.keepEditing"), style: "cancel" },
        {
          text: t("mobile.discard"),
          style: "destructive",
          onPress: () => navigation.dispatch(data.action),
        },
      ],
    );
  });
  async function run(work: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function discardThen(work: () => void) {
    if (locked.current) return;
    if (!dirty) {
      work();
      return;
    }
    Alert.alert(
      t("mobile.discardUnsavedChanges"),
      t("mobile.loadingAnotherFileOrDirectoryWillDiscardYourEdits"),
      [
        { text: t("mobile.keepEditing"), style: "cancel" },
        { text: t("mobile.discard"), style: "destructive", onPress: work },
      ],
    );
  }
  async function list(target: string) {
    const result = await client.listDirectory(daemonPath(target), sessionId);
    if (!alive.current) return;
    setDirectory(result);
    setPath(result.path);
    setFile(undefined);
    setImage(undefined);
    setVideo(undefined);
    setDraft("");
    setConflict(false);
    setNotice("");
  }
  async function open(target: string, explicit = true, caps = capabilities) {
    if (!caps?.read)
      throw new Error(t("mobile.fileReadingIsUnavailableOnThisDaemon"));
    const remotePath = daemonPath(target);
    const absolute =
      remotePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(remotePath);
    let base: { basePath: string; baseKind: "directory" } | undefined;
    if (!absolute) {
      if (!sessionId)
        throw new Error(t("mobile.relativePathsRequireASessionWorkingDirectory"));
      const session = await client.session(sessionId);
      if (!session.working_directory)
        throw new Error(t("mobile.thisSessionHasNoWorkingDirectory"));
      base = { basePath: session.working_directory, baseKind: "directory" };
    }
    const result = await client.openFile(remotePath, sessionId, explicit, base);
    if (!alive.current) return;
    if (result.kind === "directory") {
      if (!caps.list) throw new Error(t("mobile.directoryBrowsingIsUnavailable"));
      await list(result.path);
      return;
    }
    if (result.kind === "system")
      throw new Error(
        t("mobile.thisBinaryOrOversizedFileCannotBeOpenedOnMobile"),
      );
    if (result.kind === "requires_confirmation")
      throw new Error(t("mobile.thisFileRequiresAnExplicitOpenAction"));
    setVideo(undefined);
    if (result.kind === "video") {
      setVideo(result.file);
      setImage(undefined);
      setFile(undefined);
      setDraft("");
      setPath(result.file.path);
    } else if (result.kind === "image") {
      if (!caps.image)
        throw new Error(t("mobile.imagePreviewsAreUnavailableOnThisDaemon"));
      const uri = imagePreviewUri(result.file);
      setImage(uri);
      setFile(undefined);
      setDraft("");
      setPath(result.file.path);
    } else if (result.kind === "text") {
      setFile(result.file);
      setDraft(result.file.content);
      setImage(undefined);
      setPath(result.file.path);
    }
    setConflict(false);
    setNotice("");
  }
  function initialize() {
    void run(async () => {
      const caps = await client.fileCapabilities();
      if (!alive.current) return;
      setCapabilities(caps);
      if (route.params?.open && route.params.path)
        await open(route.params.path, true, caps);
      else if (caps.list) await list(route.params?.path ?? "");
    });
  }
  useEffect(initialize, [client]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && file)
        setNotice(
          t("mobile.theFileMayHaveChangedWhileAwayReloadToCheckUnsavedEditsAreKeptUntilYouConfirm"),
        );
    });
    return () => subscription.remove();
  }, [file]);
  function save() {
    if (!file || !dirty || !capabilities?.write || conflict) return;
    const input = fileSaveInput(file, draft, sessionId);
    void run(async () => {
      try {
        const saved = await client.saveFile(input);
        if (alive.current) {
          setFile(saved);
          setDraft(saved.content);
          setNotice(t("mobile.savedToDaemon"));
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && alive.current) {
          setConflict(true);
          setNotice(
            t("mobile.theRemoteFileChangedYourDraftIsPreservedCopyYourEditsBeforeReloadingTheRemoteVersion"),
          );
        }
        throw e;
      }
    });
  }
  const editable =
    !!file &&
    capabilities?.write &&
    !file.readOnly &&
    file.sizeBytes <= 256 * 1024;
  const viewing = !!file || !!image || !!video;
  // Up: file → its directory, directory → parent, top directory → registered roots.
  const up = viewing
    ? path.replace(/[\\/][^\\/]*$/, "")
    : directory?.parentPath ?? (path ? "" : undefined);
  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={s.controls}>
        <View style={s.pathBar}>
          <IconButton
            icon={ArrowUp}
            color={colors.muted}
            label={t("directoryBrowser.parentDirectory")}
            disabled={busy || up === undefined || !capabilities?.list}
            onPress={() => discardThen(() => void run(() => list(up ?? "")))}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("mobileUi.goToPath")}
            accessibilityValue={{ text: path }}
            disabled={busy || !capabilities}
            onPress={() => setGoTo(path)}
            style={({ pressed }) => [s.path, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text numberOfLines={1} ellipsizeMode="head" style={s.pathText}>
              {path || t("directoryBrowser.registeredSourcesAndWorkspaces")}
            </Text>
          </Pressable>
        </View>
        {!!error && <Notice text={error} error />}
        {!!notice && <Notice text={notice} />}
        {!capabilities && !busy && (
          <Action label={t("app.retry2")} onPress={initialize} />
        )}
        {busy && <Notice text={t("markdownImage.loading")} />}
        {capabilities && !capabilities.read && !capabilities.list && (
          <Notice text={t("mobile.thisDaemonDoesNotSupportRemoteFiles")} />
        )}
      </View>
      {file ? (
        <View style={s.editor}>
          {dirty && <Text style={s.label}>{t("mobileUi.unsaved")}</Text>}
          {!editable && (
            <Notice
              text={
                file.readOnly || !capabilities?.write
                  ? t("mobile.readonlyFile")
                  : t("mobile.largeFilePreviewMobileEditingIsLimitedTo256KiB")
              }
            />
          )}
          {!editable && draft.length > 128 * 1024 && (
            <Notice text={t("mobile.previewShowsTheFirst131072Characters")} />
          )}
          <TextInput
            accessibilityLabel={t("mobile.fileContent")}
            style={s.input}
            multiline
            value={editable ? draft : draft.slice(0, 128 * 1024)}
            onChangeText={setDraft}
            editable={!!editable && !busy}
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
            scrollEnabled
          />
          <View style={s.actions}>
            {editable && (
              <Action
                primary
                label={t("app.save")}
                disabled={!dirty || busy || conflict}
                onPress={save}
              />
            )}
            <Action
              label={t("mobile.reloadRemote")}
              secondary
              disabled={busy}
              onPress={() => discardThen(() => void run(() => open(file.path)))}
            />
          </View>
        </View>
      ) : video ? (
        <VideoPreview data={video.dataBase64} mediaType={video.mediaType} />
      ) : image ? (
        <View style={s.editor}>
          <Image
            accessibilityLabel={t("mobile.remoteFilePreview")}
            source={{ uri: image }}
            style={s.image}
            resizeMode="contain"
          />
        </View>
      ) : (
        <FlatList
          data={directory?.entries ?? []}
          keyExtractor={(entry) => entry.path}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={7}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            !busy && capabilities?.list ? (
              <Notice text={t("mobile.noFilesInThisDirectory")} />
            ) : null
          }
          ListFooterComponent={
            directory?.truncated ? (
              <Notice text={t("mobile.directoryListingIsLimitedEnterAMoreSpecificPathToFindOtherFiles")} />
            ) : null
          }
          renderItem={({ item }) => (
            <ListRow
              icon={item.kind === "directory" ? Folder : item.kind === "file" ? FileText : Ban}
              title={item.name}
              subtitle={item.kind === "unavailable" ? t("directoryBrowser.unavailable") : undefined}
              chevron={item.kind === "directory"}
              disabled={item.kind === "unavailable" || busy}
              onPress={() =>
                void run(() =>
                  item.kind === "directory" ? list(item.path) : open(item.path, false),
                )
              }
            />
          )}
        />
      )}
      <BottomSheet
        visible={goTo !== undefined}
        title={t("mobileUi.goToPath")}
        onClose={() => setGoTo(undefined)}
      >
        <TextField
          label={t("mobile.daemonPath")}
          value={goTo ?? ""}
          onChangeText={setGoTo}
          autoFocus
          returnKeyType="go"
          help={t("mobile.emptyPathListsRegisteredRoots")}
        />
        <Action
          primary
          block
          label={t("directoryBrowser.go")}
          onPress={() => {
            const target = (goTo ?? "").trim();
            setGoTo(undefined);
            // Opening resolves files and directories alike; an empty path lists the roots.
            discardThen(
              () =>
                void run(() => (target && capabilities?.read ? open(target) : list(target))),
            );
          }}
        />
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}
function Separator() {
  return <View style={s.separator} />;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  controls: { paddingHorizontal: space.md, paddingTop: space.xs, gap: space.xs },
  pathBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  path: { flex: 1, minHeight: 44, justifyContent: "center", paddingRight: space.md },
  pathText: { color: colors.text, ...type.callout },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  editor: { flex: 1, padding: space.lg, paddingTop: space.sm, gap: space.md },
  label: { color: colors.warning, ...type.footnote },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    fontFamily: "Menlo",
    fontSize: 13,
  },
  image: { flex: 1 },
  list: { paddingBottom: space.xl },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: space.lg,
    backgroundColor: colors.separator,
  },
});
