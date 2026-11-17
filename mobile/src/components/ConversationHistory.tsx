import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
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
import { Action, ListRow, Notice, TextField, errorText, styles } from "./ui";

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
  useLocale();
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
      setError(t("conversationFind.useUpTo256Characters"));
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
        if (position < 0) throw new Error(t("mobile.messageIsNoLongerAvailable"));
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
      title={selected ? t("mobile.messageContext") : t("conversationFind.searchConversation")}
      onClose={onClose}
      scroll={!!selected}
    >
      {!selected && (
        <TextField
          label={t("mobile.searchMessages")}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
      )}
      {busy && <Notice text={t("markdownImage.loading")} />}
      <Notice text={error} error />
      {!!error && (
        <Action label={t("app.retry2")} onPress={() => setRetry((value) => value + 1)} />
      )}
      {truncated && <Notice text={t("mobile.moreMatchesExistRefineYourSearch")} />}
      {!selected && (
        <FlatList
          style={{ maxHeight: 400 }}
          keyboardShouldPersistTaps="handled"
          data={hits}
          keyExtractor={(hit) => hit.id}
          ListEmptyComponent={
            !busy && query.trim() && !error ? (
              <Notice text={t("mobile.noMatches")} />
            ) : null
          }
          renderItem={({ item: hit }) => (
            <ListRow
              title={t("mobile.messageValue", {p0: hit.sequence})}
              subtitle={
                messageText(items.find((item) => item.id === hit.id)).slice(
                  0,
                  150,
                ) || t("mobile.openMatchingHistoricalMessage")
              }
              onPress={() => setSelected(hit.id)}
            />
          )}
        />
      )}
      {selected && (
        <Action
          secondary
          label={t("mobile.backToSearch")}
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
              label={t("mobile.previousMessage")}
              disabled={index === 0}
              onPress={() => setIndex((value) => value - 1)}
            />
            <Action
              secondary
              label={t("mobile.nextMessage")}
              disabled={index === window.length - 1}
              onPress={() => setIndex((value) => value + 1)}
            />
          </View>
          <Text style={styles.muted}>
            {t("mobile.historyPosition", { sequence: item.sequence, index: index + 1, total: window.length })}
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
