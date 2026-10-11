import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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
import { Action, Notice, Row, TextField, colors } from "../components/ui";

type Props = NativeStackScreenProps<Routes, "Files">;
type Capabilities = {
  read: boolean;
  write: boolean;
  list: boolean;
  image?: boolean;
};
export function FilesScreen({ route, navigation }: Props) {
  const client = useDaemon();
  const headerHeight = useHeaderHeight();
  const sessionId = route.params?.sessionId;
  const [path, setPath] = useState(route.params?.path ?? "");
  const [capabilities, setCapabilities] = useState<Capabilities>();
  const [directory, setDirectory] = useState<DirectoryListing>();
  const [file, setFile] = useState<TextFileSnapshot>();
  const [image, setImage] = useState<string>();
  const [draft, setDraft] = useState("");
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
      Alert.alert("Please wait", "Wait for the current operation to finish.");
      return;
    }
    Alert.alert(
      "Discard unsaved changes?",
      "Your edits have not been saved to the daemon.",
      [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard",
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
      "Discard unsaved changes?",
      "Loading another file or directory will discard your edits.",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: work },
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
    setDraft("");
    setConflict(false);
    setNotice("");
  }
  async function open(target: string, explicit = true, caps = capabilities) {
    if (!caps?.read)
      throw new Error("File reading is unavailable on this daemon.");
    const remotePath = daemonPath(target);
    const absolute =
      remotePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(remotePath);
    let base: { basePath: string; baseKind: "directory" } | undefined;
    if (!absolute) {
      if (!sessionId)
        throw new Error("Relative paths require a session working directory.");
      const session = await client.session(sessionId);
      if (!session.working_directory)
        throw new Error("This session has no working directory.");
      base = { basePath: session.working_directory, baseKind: "directory" };
    }
    const result = await client.openFile(remotePath, sessionId, explicit, base);
    if (!alive.current) return;
    if (result.kind === "directory") {
      if (!caps.list) throw new Error("Directory browsing is unavailable.");
      await list(result.path);
      return;
    }
    if (result.kind === "system")
      throw new Error(
        "This binary or oversized file cannot be opened on mobile.",
      );
    if (result.kind === "requires_confirmation")
      throw new Error("This file requires an explicit open action.");
    if (result.kind === "image") {
      if (!caps.image)
        throw new Error("Image previews are unavailable on this daemon.");
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
          "The file may have changed while away. Reload to check; unsaved edits are kept until you confirm.",
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
          setNotice("Saved to daemon.");
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && alive.current) {
          setConflict(true);
          setNotice(
            "The remote file changed. Your draft is preserved. Copy your edits before reloading the remote version.",
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
  return (
    <KeyboardAvoidingView
      style={s.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={s.controls}>
        <TextField
          label="Daemon path"
          value={path}
          onChangeText={setPath}
          placeholder="Empty path lists registered roots"
        />
        <View style={s.actions}>
          <Action
            label="Browse"
            disabled={busy || !capabilities?.list}
            onPress={() => discardThen(() => void run(() => list(path)))}
          />
          <Action
            label="Open file"
            disabled={busy || !capabilities?.read || !path.trim()}
            onPress={() => discardThen(() => void run(() => open(path)))}
          />
          <Action
            label="Roots"
            secondary
            disabled={busy || !capabilities?.list}
            onPress={() => discardThen(() => void run(() => list("")))}
          />
        </View>
        {!!error && <Notice text={error} error />}
        {!!notice && <Notice text={notice} />}
        {!capabilities && !busy && (
          <Action label="Retry capabilities" onPress={initialize} />
        )}
        {busy && <Notice text="Loading…" />}
        {capabilities && !capabilities.read && !capabilities.list && (
          <Notice text="This daemon does not support remote files." />
        )}
      </View>
      {file ? (
        <View style={s.editor}>
          <Text style={s.label}>
            {file.name}
            {dirty ? " · Unsaved" : ""}
          </Text>
          {!editable && (
            <Notice
              text={
                file.readOnly || !capabilities?.write
                  ? "Read-only file"
                  : "Large file preview: mobile editing is limited to 256 KiB."
              }
            />
          )}
          {!editable && draft.length > 128 * 1024 && (
            <Notice text="Preview shows the first 131,072 characters." />
          )}
          <TextInput
            accessibilityLabel="File content"
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
            <Action
              label="Save"
              disabled={!editable || !dirty || busy || conflict}
              onPress={save}
            />
            <Action
              label="Reload remote"
              secondary
              disabled={busy}
              onPress={() => discardThen(() => void run(() => open(file.path)))}
            />
          </View>
        </View>
      ) : image ? (
        <View style={s.editor}>
          <Image
            accessibilityLabel="Remote file preview"
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
          ListHeaderComponent={
            directory?.parentPath ? (
              <Action
                label="Parent directory"
                secondary
                disabled={busy}
                onPress={() => void run(() => list(directory.parentPath!))}
              />
            ) : null
          }
          ListEmptyComponent={
            !busy && capabilities?.list ? (
              <Notice text="No files in this directory." />
            ) : null
          }
          ListFooterComponent={
            directory?.truncated ? (
              <Notice text="Directory listing is limited. Enter a more specific path to find other files." />
            ) : null
          }
          renderItem={({ item }) => (
            <Row
              title={item.name}
              subtitle={item.kind}
              onPress={
                item.kind === "unavailable" || busy
                  ? undefined
                  : () =>
                      void run(() =>
                        item.kind === "directory"
                          ? list(item.path)
                          : open(item.path, false),
                      )
              }
            />
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  controls: { padding: 16, gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  editor: { flex: 1, padding: 16, paddingTop: 0, gap: 12 },
  label: { color: colors.text, fontSize: 16 },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    fontFamily: "Menlo",
    fontSize: 13,
  },
  image: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
});
