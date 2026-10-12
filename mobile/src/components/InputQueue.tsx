import { useCallback, useRef, useState } from "react";
import { AppState, FlatList, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Pencil from "lucide-react-native/icons/pencil";
import Trash from "lucide-react-native/icons/trash";
import type { QueuedInput } from "@zotigo/shared/zotigod";
import { useDaemon } from "../platform/context";
import { BottomSheet } from "./BottomSheet";
import { Action, IconButton, Notice, TextField, errorText, styles } from "./ui";

export function InputQueue({
  sessionId,
  refresh,
}: {
  sessionId: string;
  refresh: number;
}) {
  const client = useDaemon();
  const [items, setItems] = useState<QueuedInput[]>([]);
  const [editing, setEditing] = useState<{ item: QueuedInput; text: string }>();
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const active = useRef(false);
  const [revision, setRevision] = useState(0);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      let controller: AbortController | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let supported = true;
      const cancel = () => {
        controller?.abort();
        clearTimeout(timer);
      };
      const poll = async () => {
        cancel();
        if (!active.current || !supported || AppState.currentState !== "active")
          return;
        const request = new AbortController();
        controller = request;
        try {
          const result = await client.queuedInputs(sessionId, request.signal);
          if (request.signal.aborted) return;
          supported = result !== null;
          setItems(result ?? []);
          setPollError("");
        } catch (e) {
          if (!request.signal.aborted) setPollError(errorText(e));
        } finally {
          if (!request.signal.aborted && active.current && supported)
            timer = setTimeout(() => void poll(), 2000);
        }
      };
      void poll();
      const listener = AppState.addEventListener("change", (state) => {
        cancel();
        if (state === "active") void poll();
      });
      return () => {
        active.current = false;
        cancel();
        listener.remove();
      };
    }, [client, sessionId, refresh, revision]),
  );
  async function change(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      if (active.current) setEditing(undefined);
    } catch (e) {
      if (active.current) setError(errorText(e));
    } finally {
      lock.current = false;
      if (active.current) {
        setBusy(false);
        setRevision((value) => value + 1);
      }
    }
  }
  if (!items.length && !error && !pollError && !editing) return null;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={[styles.muted, { flex: 1 }]}>
          Next turn · {items.length}
        </Text>
        {items.some((item) => item.state === "paused") && (
          <Action
            label="Resume queue"
            disabled={busy}
            onPress={() => void change(() => client.resumeQueue(sessionId))}
          />
        )}
      </View>
      <FlatList
        style={{ maxHeight: 144 }}
        data={items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text numberOfLines={2} style={[styles.muted, { flex: 1 }]}>
              {item.text || "Image attachment"}
              {item.state !== "queued" ? ` · ${item.state}` : ""}
            </Text>
            <IconButton
              icon={Pencil}
              label="Edit queued message"
              disabled={busy || !item.editable}
              onPress={() => setEditing({ item, text: item.text ?? "" })}
            />
            <IconButton
              icon={Trash}
              label="Delete queued message"
              disabled={busy || !item.editable}
              onPress={() =>
                void change(() =>
                  client.changeQueuedInput(sessionId, item.id, item.revision),
                )
              }
            />
          </View>
        )}
      />
      <Notice text={error || pollError} error />
      <BottomSheet
        visible={!!editing}
        title="Edit queued message"
        disabled={busy}
        onClose={() => setEditing(undefined)}
      >
        <TextField
          label="Queued message"
          multiline
          value={editing?.text ?? ""}
          onChangeText={(text) =>
            setEditing((value) => value && { ...value, text })
          }
        />
        <Notice text={error || pollError} error />
        <Action
          label="Save"
          disabled={
            busy ||
            !editing ||
            !items.find((item) => item.id === editing.item.id)?.editable
          }
          onPress={() =>
            editing &&
            void change(() =>
              client.changeQueuedInput(
                sessionId,
                editing.item.id,
                editing.item.revision,
                editing.text,
              ),
            )
          }
        />
      </BottomSheet>
    </View>
  );
}
