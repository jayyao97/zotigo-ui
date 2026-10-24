import { useCallback, useRef, useState } from "react";
import { AppState, FlatList, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import X from "lucide-react-native/icons/x";
import { MessageImage } from "./MessageImage";
import Pencil from "lucide-react-native/icons/pencil";
import Trash from "lucide-react-native/icons/trash";
import type { DisplayItem, QueuedInput } from "@zotigo/shared/zotigod";
import { useDaemon } from "../platform/context";
import { BottomSheet } from "./BottomSheet";
import { Action, IconButton, Notice, TextField, errorText, styles } from "./ui";

export function InputQueue({
  sessionId,
  refresh,
  pending = [],
  onReconciled,
}: {
  sessionId: string;
  refresh: number;
  pending?: DisplayItem[];
  onReconciled?: (ids: string[]) => void;
}) {
  const client = useDaemon();
  const reconciliation = useRef({ pending, onReconciled });
  reconciliation.current = { pending, onReconciled };
  const [items, setItems] = useState<QueuedInput[]>([]);
  const [editing, setEditing] = useState<{ item: QueuedInput; text: string; imageIndices: number[] }>();
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
          const confirmed = new Set(reconciliation.current.pending.filter(item => item.queueConfirmed).map(item => item.id));
          const result = await client.queuedInputs(sessionId, request.signal);
          if (request.signal.aborted) return;
          supported = result !== null;
          if (result !== null) {
            const ids = reconciliation.current.pending.filter(item => confirmed.has(item.id) || result.some(queued => queued.id === item.id)).map(item => item.id);
            if (ids.length) reconciliation.current.onReconciled?.(ids);
          }
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
  function images(item: QueuedInput, indices: number[], removable = false) {
    return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{indices.map(index => (
      <View key={index}>
        {item.images?.[index]?.url ? <MessageImage url={item.images[index].url!} sessionId={sessionId} thumbnail /> : <Text style={styles.muted}>Image {index + 1} · Preview unavailable</Text>}
        {removable && <IconButton icon={X} label={`Remove image ${index + 1}`} disabled={busy} onPress={() => setEditing(value => value && ({ ...value, imageIndices: value.imageIndices.filter(i => i !== index) }))} />}
      </View>
    ))}</View>;
  }
  const previews = pending.filter(item => !items.some(queued => queued.id === item.id));
  if (!previews.length && !items.length && !error && !pollError && !editing) return null;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={[styles.muted, { flex: 1 }]}>
          Next turn · {items.length + previews.length}
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
        ListFooterComponent={<View>{previews.map(item => <View key={item.id}>
        <Text numberOfLines={2} style={styles.text}>{item.content?.map(part => part.text ?? "").join("") || "Image attachment"}</Text>
        <Text style={styles.muted}>{item.queueConfirmed ? "Queued" : item.delivery?.state === "sending" ? "Adding to queue…" : "Could not confirm queue submission. Retry uses the same request ID."}</Text>
      </View>)}</View>}
        data={items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={[styles.muted, { flex: 1 }]}>
              {item.text || "Image attachment"}
              {item.state !== "queued" ? ` · ${item.state}` : ""}
            </Text>
            {images(item, (item.images ?? []).map((_, index) => index))}
            </View>
            <IconButton icon={ArrowUp} label="Send now" disabled={busy || !item.editable} onPress={() => void change(() => client.sendQueuedInput(sessionId, item.id, item.revision))} />
            <IconButton
              icon={Pencil}
              label="Edit queued message"
              disabled={busy || !item.editable}
              onPress={() => setEditing({ item, text: item.text ?? "", imageIndices: (item.images ?? []).map((_, index) => index) })}
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
        {editing && images(editing.item, editing.imageIndices, editing.item.image_editing_supported === true)}
        {!!editing?.item.images?.length && !editing.item.image_editing_supported && <Text style={styles.muted}>Images will be kept. Update the connected daemon to remove them.</Text>}
        <Notice text={error || pollError} error />
        <Action
          label="Save"
          disabled={
            busy ||
            !editing ||
            (!editing.text.trim() && !editing.imageIndices.length) ||
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
                editing.item.image_editing_supported ? editing.imageIndices : undefined,
              ),
            )
          }
        />
      </BottomSheet>
    </View>
  );
}
