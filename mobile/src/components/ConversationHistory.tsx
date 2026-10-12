import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import type { DisplayItem, SessionSearchHit } from "@zotigo/shared/zotigod";
import { buildToolRenderProjection } from "@zotigo/shared/sessionDisplay";
import { useDaemon } from "../platform/context";
import {
  localSearch,
  mergeHits,
  messageText,
} from "../core/conversationSearch";
import type { SelectionAction } from "../core/selectionRuns";
import { BottomSheet } from "./BottomSheet";
import { MessageCard } from "./MessageCard";
import { Action, Notice, Row, TextField, errorText, styles } from "./ui";

// Historical windows remain separate from the live timeline and its SSE cursor.
export function ConversationHistory({
  sessionId,
  items,
  target,
  excerpt = "",
  onClose,
  openFile,
  onSelection,
}: {
  sessionId: string;
  items: DisplayItem[];
  target?: string;
  excerpt?: string;
  onClose: () => void;
  openFile: (path: string) => void;
  onSelection: (value: SelectionAction & { messageId: string }) => void;
}) {
  const client = useDaemon();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SessionSearchHit[]>([]);
  const [selected, setSelected] = useState(target);
  const [window, setWindow] = useState<DisplayItem[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setHits([]);
    setError("");
    setTruncated(false);
    setBusy(false);
    if (selected || !query.trim()) return () => controller.abort();
    if ([...query].length > 256) {
      setError("Use up to 256 characters.");
      return;
    }
    setHits(localSearch(items, query));
    const timer = setTimeout(() => {
      setBusy(true);
      void client
        .search(sessionId, query.trim(), controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            setHits(mergeHits(localSearch(items, query), result.hits));
            setTruncated(result.truncated);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorText(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [client, sessionId, query, selected, retry]);
  useEffect(() => {
    if (!selected) {
      setWindow([]);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setWindow([]);
    void client
      .itemWindow(sessionId, selected, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        const rows = page.items.filter(
          (item) => item.content?.length || item.command?.text,
        );
        const position = rows.findIndex((item) => item.id === selected);
        if (position < 0) throw new Error("Message is no longer available.");
        setWindow(rows);
        setIndex(position);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [client, sessionId, selected, retry]);
  const item = window[index];
  return (
    <BottomSheet
      visible
      title={selected ? "Message context" : "Search conversation"}
      onClose={onClose}
      scroll={!!selected}
    >
      {!selected && (
        <TextField
          label="Search messages"
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
      )}
      {busy && <Notice text="Loading…" />}
      <Notice text={error} error />
      {!!error && (
        <Action label="Retry" onPress={() => setRetry((value) => value + 1)} />
      )}
      {truncated && <Notice text="More matches exist. Refine your search." />}
      {!selected && (
        <FlatList
          style={{ maxHeight: 400 }}
          keyboardShouldPersistTaps="handled"
          data={hits}
          keyExtractor={(hit) => hit.id}
          ListEmptyComponent={
            !busy && query.trim() && !error ? (
              <Notice text="No matches" />
            ) : null
          }
          renderItem={({ item: hit }) => (
            <Row
              title={`Message ${hit.sequence}`}
              subtitle={
                messageText(items.find((item) => item.id === hit.id)).slice(
                  0,
                  150,
                ) || "Open matching historical message"
              }
              onPress={() => setSelected(hit.id)}
            />
          )}
        />
      )}
      {selected && (
        <Action
          secondary
          label="Back to search"
          onPress={() => setSelected(undefined)}
        />
      )}
      {item && (
        <>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Action
              secondary
              label="Previous message"
              disabled={index === 0}
              onPress={() => setIndex((value) => value - 1)}
            />
            <Action
              secondary
              label="Next message"
              disabled={index === window.length - 1}
              onPress={() => setIndex((value) => value + 1)}
            />
          </View>
          <Text style={styles.muted}>
            Message {item.sequence} · {index + 1} / {window.length}
          </Text>
          <MessageCard
            key={item.id}
            item={item}
            sessionId={sessionId}
            openFile={openFile}
            revealReasoning
            projection={
              item.content?.some((part) => part.tool_result)
                ? undefined
                : buildToolRenderProjection(window)
            }
            highlight={excerpt || query}
            onSelectText={onSelection}
            onLocateMessage={setSelected}
          />
        </>
      )}
    </BottomSheet>
  );
}
