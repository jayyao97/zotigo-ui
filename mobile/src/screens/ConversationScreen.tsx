import { interactionState } from "@zotigo/shared/interactionState";
import { t } from "@zotigo/shared/i18n/index";
import { maxMessageImageCount } from "@zotigo/shared/messageImages";
import {
  anchorPromptTimeline,
  buildToolRenderProjection,
  orderDisplayInputs,
  orderLateTurnItems,
  pendingHumanRequestIDs,
} from "@zotigo/shared/sessionDisplay";
import { sessionTurnActions } from "@zotigo/shared/sessionFork";
import { canAcknowledgeSession } from "@zotigo/shared/sessionReadState";
import { randomUUID } from "expo-crypto";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Search from "lucide-react-native/icons/search";
import Square from "lucide-react-native/icons/square";
import Terminal from "lucide-react-native/icons/terminal";
import X from "lucide-react-native/icons/x";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Alert, AppState, FlatList, Keyboard, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  usePreventRemove,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AttachmentFiles } from "../components/AttachmentFiles";
import { BottomSheet, ChoiceRow } from "../components/BottomSheet";
import { ComposerFrame } from "../components/ComposerFrame";
import { ComposerSkills } from "../components/ComposerSkills";
import { ContextUsage } from "../components/ContextUsage";
import { ConversationHistory } from "../components/ConversationHistory";
import { DiagramProvider } from "../components/DiagramProvider";
import { DraftImages } from "../components/DraftImages";
import { HumanRequest } from "../components/HumanRequests";
import { ImagePreviewProvider } from "../components/ImagePreviewProvider";
import { InputQueue } from "../components/InputQueue";
import { KeyboardFrameView } from "../components/KeyboardFrameView";
import { MessageCard } from "../components/MessageCard";
import { ReferenceEditor } from "../components/ReferenceEditor";
import { SelectionSheet } from "../components/SelectionSheet";
import { SkillInput } from "../components/SkillInput";
import { TurnStatus } from "../components/TurnStatus";
import {
  Action,
  IconButton,
  colors,
  errorText,
  Notice,
  Loading,
  styles,
} from "../components/ui";
import { useLayoutTransition } from "../components/useLayoutTransition";
import { emptyDraft } from "../core/composer";
import { ForkRequests } from "../core/forkRequests";
import { Timeline, activeTurn } from "../core/timeline";
import { timelineRows, type TimelineRow } from "../core/timelineRows";
import { retainExpandedTimelineGroups } from "../core/timelineScroll";
import { ConversationOptions, type OptionPane } from "../features/conversation/ConversationOptions";
import { useComposerDraft } from "../features/conversation/useComposerDraft";
import { useTimelineScroll } from "../features/conversation/useTimelineScroll";
import type { Routes } from "../navigation";
import { useDaemon } from "../platform/context";
import { useLocale } from "../platform/i18n";
import { useSendMode, useThinkingDisplay } from "../platform/preferences";
import { useConversationTitle } from "../platform/useConversationTitle";

export function ConversationScreen() {
  useLocale();
  return (
    <DiagramProvider>
      <ImagePreviewProvider>
        <ConversationContent />
      </ImagePreviewProvider>
    </DiagramProvider>
  );
}

function ConversationContent() {
  const locale = useLocale();
  const animateLayout = useLayoutTransition();
  const client = useDaemon(),
    route = useRoute<RouteProp<Routes, "Conversation">>(),
    nav = useNavigation<NativeStackNavigationProp<Routes>>();
  const { id } = route.params;
  const timeline = useMemo(() => new Timeline(client, id), [client, id]);
  const state = useSyncExternalStore(timeline.subscribe, timeline.snapshot);
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const header = useHeaderHeight();
  const [caret, setCaret] = useState(0);
  const composerAnchor = useRef<View>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendCanLeave, setSendCanLeave] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const focused = useRef(false);
  usePreventRemove(busy && !sendCanLeave, ({ data }) => {
    if (!lock.current) nav.dispatch(data.action);
    else
      Alert.alert(
        t("mobile.pleaseWait"),
        t("mobile.yourRequestAndDraftAreStillBeingSaved"),
      );
  });
  // Which pane of the options sheet is open; undefined while it is closed.
  const [optionPane, setOptionPane] = useState<OptionPane>();
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const pendingAttachmentPicker = useRef<(() => void) | undefined>(undefined);
  function openAttachmentPicker(action: () => Promise<void>) {
    const open = () => {
      if (focused.current && alive.current) void run(action);
    };
    setAttachmentMenu(false);
    // UIKit must finish dismissing our sheet before presenting the system picker.
    if (Platform.OS === "ios") pendingAttachmentPicker.current = open;
    else open();
  }
  const [title, setTitle] = useState(route.params.title);
  // What the daemon has, so Save is offered only for an unsaved edit.
  const [savedTitle, setSavedTitle] = useState(route.params.title);
  useConversationTitle(id, state.items, (value) => {
    setTitle(value);
    setSavedTitle(value);
    nav.setOptions({ title: value });
  });
  const defaultSendMode = useSendMode(client.connection.id);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const composer = useComposerDraft({
    client,
    id,
    timeline,
    items: state.items,
    alive,
    lock,
    onError: setError,
  });
  const { saved, update, addReference, promptPreviews } = composer;
  // Rows as last rendered, for scroll callbacks that outlive a render.
  const rows = useRef<TimelineRow[]>([]);
  const [disclosures, setDisclosures] = useState<Record<string, boolean>>({});
  const scroll = useTimelineScroll({
    focused,
    loadingOlder: state.loadingOlder,
    loading: state.status === "loading",
    more: state.more,
    onLoadOlder: () => void timeline.older(),
    // Once someone starts reading, a finishing tool group must not collapse under them.
    onUserScroll: () =>
      setDisclosures((previous) => retainExpandedTimelineGroups(rows.current, previous)),
  });
  const { following, leaveLatest } = scroll;
  const [history, setHistory] = useState<{
    target?: string;
    excerpt?: string;
  }>();
  const [editingReference, setEditingReference] = useState<string>();
  const [selection, setSelection] = useState<{
    text: string;
    messageId: string;
  }>();
  const readTracking = useMemo(
    () => ({
      manual: undefined as number | undefined,
      auto: undefined as number | undefined,
      request: Promise.resolve() as Promise<unknown>,
    }),
    [timeline],
  );
  function setReadState(version: number | null) {
    const pending = readTracking.request
      .catch(() => {})
      .then(async () => {
        const result = await timeline.setReadState(version);
        readTracking.manual = version === null ? result.version : undefined;
      });
    readTracking.request = pending;
    return pending;
  }
  useEffect(() => {
    const read = state.session?.read_state;
    if (
      !read ||
      read.version === readTracking.manual ||
      read.version === readTracking.auto
    )
      return;
    const visible = Math.max(0, ...state.items.map((item) => item.sequence));
    if (
      canAcknowledgeSession(
        read,
        visible,
        focused.current &&
          AppState.currentState === "active" &&
          following &&
          !history &&
          !optionPane &&
          !selection &&
          !attachmentMenu &&
          state.status === "connected" &&
          !state.error,
      )
    ) {
      readTracking.auto = read.version;
      void setReadState(read.version).catch((e) => {
        if (readTracking.auto === read.version) readTracking.auto = undefined;
        if (alive.current) setError(errorText(e));
      });
    }
  }, [
    state.session,
    state.items,
    state.status,
    state.error,
    following,
    history,
    optionPane,
    selection,
    attachmentMenu,
    readTracking,
  ]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      // "inactive" (Control Center, the app switcher, a permission prompt) is
      // a brief overlay: the stream keeps running. Only the background stops
      // it, and coming back from there starts it again.
      let stopped = AppState.currentState === "background";
      if (!stopped) void timeline.start();
      const sub = AppState.addEventListener("change", (value) => {
        if (value === "background" && !stopped) {
          stopped = true;
          timeline.stop();
        } else if (value === "active" && stopped) {
          stopped = false;
          void timeline.start();
        }
      });
      return () => {
        focused.current = false;
        sub.remove();
        timeline.stop();
      };
    }, [timeline]),
  );
  const draft = busy && sendCanLeave ? emptyDraft() : saved.draft;
  const selectText = useCallback(
    (value: {
      action: "reference" | "translate";
      text: string;
      messageId: string;
    }) => {
      leaveLatest();
      if (value.action === "reference")
        addReference({
          messageId: value.messageId,
          text: value.text,
          comment: "",
        });
      else setSelection(value);
    },
    [addReference, leaveLatest],
  );
  async function run(action: () => Promise<unknown>, onSuccess?: () => void) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    let succeeded = false;
    try {
      await action();
      succeeded = true;
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        setSendCanLeave(false);
      }
      if (focused.current)
        void timeline.refreshSession().catch((e) => {
          if (alive.current) setError(errorText(e));
        });
    }
    if (succeeded && focused.current && !client.signal.aborted) onSuccess?.();
  }
  function send(mode = defaultSendMode.mode) {
    setError("");
    setSendCanLeave(true);
    return composer.submit(mode);
  }
  const pending = useMemo(
    () => pendingHumanRequestIDs(state.items, state.session?.state),
    [state.items, state.session?.state],
  );
  const requests = useMemo(
    () =>
      state.items.filter(
        (i) =>
          (i.approval?.id &&
            pending.approvals.has(i.approval.id) &&
            i.type === "approval_request") ||
          (i.interaction?.id &&
            pending.interactions.has(i.interaction.id) &&
            i.type === "interaction_request"),
      ),
    [state.items, pending],
  );
  const thinking = useThinkingDisplay();
  const ordered = useMemo(
    () => orderDisplayInputs(anchorPromptTimeline(orderLateTurnItems([
      ...state.items, ...state.previews,
      ...promptPreviews.filter(item => !item.queuedPreview && !state.items.some(durable => durable.id === item.id)),
    ]), composer.promptAnchors.current)),
    [state.items, state.previews, promptPreviews],
  );
  const previewIds = useMemo(
    () => new Set(state.previews.map((i) => i.id)),
    [state.previews],
  );
  const turn = activeTurn(state.items);
  const projection = useMemo(
    () => buildToolRenderProjection(ordered),
    [ordered],
  );
  const data = useMemo<TimelineRow[]>(
    () =>
      timelineRows(ordered, {
        pendingInteractions: pending.interactions,
        activeTurnSequence: turn
          ? state.items.find((i) => i.type === "turn_started" && i.turn?.id === turn)?.sequence
          : undefined,
        agent: state.session?.agent,
        thinkingMode: thinking.mode,
        disclosures,
      }),
    [locale, ordered, pending, state.items, state.session?.agent, turn, disclosures, thinking.mode],
  );
  rows.current = data;
  const listData = useMemo(
    () => (scroll.inverted ? [...data].reverse() : data),
    [data, scroll.inverted],
  );
  const turnActions = useMemo(
    () => sessionTurnActions(state.items),
    [state.items],
  );
  // Keyed by the device, not the connection: new credentials for the same
  // device must not lose the ID a retry needs.
  const forks = useMemo(() => new ForkRequests(randomUUID), [client.connection.id, id]);
  const forkFrom = useCallback(
    (turnId: string) => {
      void run(async () => {
        const session = await forks.fork(turnId, (request) => client.fork(id, request, turnId));
        if (focused.current && !client.signal.aborted)
          nav.push("Conversation", {
            id: session.id,
            title: "Fork · " + title,
          });
      });
    },
    [client, forks, id, title],
  );

  const openFile = useCallback(
    (path: string) =>
      nav.navigate("Files", { path, sessionId: id, open: true }),
    [nav, id],
  );
  const renderItem = useCallback(
    ({ item: row }: { item: TimelineRow }) => {
      if (row.kind === "activity")
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={row.label}
            accessibilityState={{ expanded: row.open }}
            onPress={() => {
              leaveLatest();
              animateLayout();
              setDisclosures((previous) => ({
                ...previous,
                [row.key]: !row.open,
              }));
            }}
            style={{
              minHeight: 44,
              paddingHorizontal: 18,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Terminal size={16} color={colors.muted} />
            <Text numberOfLines={1} style={[styles.muted, { flexShrink: 1 }]}>
              {row.label}
            </Text>
            {row.open ? (
              <ChevronDown size={16} color={colors.muted} />
            ) : (
              <ChevronRight size={16} color={colors.muted} />
            )}
          </Pressable>
        );
      const item = row.item;
      if (item.type === "turn_started")
        return (
          <TurnStatus
            item={item}
            items={ordered}
            active={item.turn?.id === turn}
            paused={state.session?.state === "paused"}
            terminalAt={!turn ? state.session?.ended_at : undefined}
          />
        );
      return (
        <MessageCard
          sessionId={id}
          interactionPending={item.interaction ? interactionState(item, state.items, state.status === "connected", pending.interactions) : undefined}
          item={item}
          openFile={openFile}
          live={previewIds.has(item.id)}
          turnAction={turnActions.get(item.id)}
          onFork={forkFrom}
          forkDisabled={busy || !!turn}
          projection={projection}
          revealReasoning={row.revealReasoning}
          onSelectText={selectText}
          onLocateMessage={(target) => setHistory({ target })}
          onSelecting={leaveLatest}
        />
      );
    },
    [
      id,
      openFile,
      previewIds,
      turnActions,
      forkFrom,
      busy,
      turn,
      projection,
      ordered,
      state.items,
      pending,
      state.status,
      state.session?.state,
      state.session?.ended_at,
      selectText,
      leaveLatest,
    ],
  );

  useEffect(() => {
    nav.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: "row" }}>
          <IconButton
            icon={Search}
            label={t("conversationFind.searchConversation")}
            onPress={() => setHistory({})}
          />
          <IconButton
            icon={Ellipsis}
            label={t("mobile.conversationDetails")}
            onPress={() => {
              Keyboard.dismiss();
              setOptionPane("session");
            }}
          />
        </View>
      ),
    });
  }, [nav, locale]);
  const modelLabel =
    [state.session?.model || state.session?.profile, state.session?.reasoning_effort]
      .filter(Boolean)
      .join(" · ") || t("mobile.modelAndReasoning");
  // Context only competes for composer space once it is worth acting on.
  const contextRatio = state.session?.context_usage?.window
    ? state.session.context_usage.tokens / state.session.context_usage.window
    : 0;
  const canSend =
    composer.loaded && defaultSendMode.ready && !busy && !client.signal.aborted;
  const historyLoader = (
    <View style={{ height: 32, justifyContent: "center" }}>
      {state.loadingOlder && <Loading />}
    </View>
  );
  const requestsView = (
    <View style={{ gap: 12, padding: 16 }}>
      {requests.map((item) => (
        <HumanRequest
          key={item.id}
          item={item}
          client={client}
          id={id}
          run={(action) =>
            void run(async () => {
              try {
                return await action();
              } finally {
                if (focused.current) void timeline.start();
              }
            })
          }
          disabled={
            busy || state.status !== "connected" || !state.session?.live
          }
        />
      ))}
    </View>
  );
  return (
    <KeyboardFrameView
      onKeyboardVisibleChange={setKeyboardVisible}
      style={[
        styles.screen,
        { width: "100%", maxWidth: 860, alignSelf: "center" },
      ]}
      keyboardVerticalOffset={header}
    >
      {(state.status !== "connected" || !!state.error || !!error) && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 8 }}>
          {/* The dot marks transport state only; action errors are plain text. */}
          {(state.status !== "connected" || !!state.error) && (
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: state.error ? colors.danger : colors.warning }} />
          )}
          <View style={{ flex: 1 }}>
            {state.status !== "connected" && !state.error && (
              <Text style={styles.muted}>{t("webApp.connecting")}</Text>
            )}
            <Notice text={state.error} error />
            <Notice text={error} error />
          </View>
          {!!state.error && (
            <Action
              label={t("mobile.reconnect")}
              secondary
              disabled={busy}
              onPress={() => {
                setError("");
                void timeline.start();
              }}
            />
          )}
        </View>
      )}
      <View style={{ flex: 1 }}>
      <FlatList
        style={{ flex: 1 }}
        data={listData}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        {...scroll.listProps}
        ListEmptyComponent={
          <View style={{ padding: 24 }}>
            <Notice
              text={
                state.status === "loading"
                  ? t("mobile.loadingConversation")
                  : t("mobile.startAConversationInThisWorkspace")
              }
            />
          </View>
        }
        ListHeaderComponent={scroll.inverted ? requestsView : historyLoader}
        ListFooterComponent={scroll.inverted ? historyLoader : requestsView}
      />
      {scroll.showJump && (
        <View pointerEvents="box-none" style={{ position: "absolute", bottom: 8, left: 0, right: 0, alignItems: "center" }}>
          <View style={{ borderRadius: 22, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
          <IconButton
            icon={ArrowDown}
            label={t("mobile.jumpToLatest")}
            onPress={scroll.scrollToLatest}
          />
          </View>
        </View>
      )}
      </View>
      <View
        style={{
          padding: 12,
          paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 12),
          gap: 8,
          backgroundColor: colors.background,
        }}
      >
        {pending.interactions.size > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={scroll.scrollToLatest}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              minHeight: 40,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: pressed ? colors.selected : colors.surface,
            })}
          >
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }} />
            <Text style={[styles.text, { flex: 1, fontSize: 14 }]} numberOfLines={1}>
              {requests.some(item => item.interaction?.is_blocking) ? t("interaction.waitingForAnswer") : t("interaction.pendingCount", { count: pending.interactions.size })}
            </Text>
            <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "600" }}>{t("interaction.viewQuestions")}</Text>
          </Pressable>
        )}
        <InputQueue
          sessionId={id}
          refresh={composer.queueRevision}
          pending={promptPreviews.filter((item) => item.queuedPreview)}
          onReconciled={composer.dropPromptPreviews}
        />
        <Notice text={defaultSendMode.error} error />
        {!!draft.references?.length && (
          <View style={{ maxHeight: 136 }}>
            <FlatList
              data={draft.references}
              keyExtractor={(reference) => reference.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: reference, index }) => (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingLeft: 12,
                    backgroundColor: colors.surface,
                    borderRadius: 10,
                    marginBottom: 4,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("mobile.editReferenceValue", {p0: index + 1})}
                    disabled={busy || !!saved.attempt}
                    style={{ flex: 1, minHeight: 44, justifyContent: "center" }}
                    onPress={() => setEditingReference(reference.id)}
                  >
                    <Text numberOfLines={2} style={styles.muted}>
                      {reference.text}
                    </Text>
                    {!!reference.comment && (
                      <Text numberOfLines={1} style={styles.text}>
                        {reference.comment}
                      </Text>
                    )}
                  </Pressable>
                  <IconButton
                    icon={X}
                    label={t("mobile.removeReferenceValue", {p0: index + 1})}
                    disabled={busy || !!saved.attempt}
                    onPress={() =>
                      update({
                        references: draft.references?.filter(
                          (item) => item.id !== reference.id,
                        ),
                      })
                    }
                  />
                </View>
              )}
            />
          </View>
        )}
        {!!draft.images.length && (
          <DraftImages
            images={draft.images}
            disabled={busy || !!saved.attempt}
            onRemove={(index) =>
              update({ images: draft.images.filter((_, i) => i !== index) })
            }
          />
        )}
        <AttachmentFiles
          files={draft.files ?? []}
          disabled={busy || !!saved.attempt}
          onRemove={(index) =>
            update({ files: draft.files?.filter((_, i) => i !== index) })
          }
        />
        <ComposerSkills
          text={draft.text}
          caret={caret}
          selected={draft.skills}
          sessionId={id}
          disabled={!canSend || !!saved.attempt}
          onChange={(text, skills) => {
            setCaret(caret + text.length - draft.text.length);
            update({ text, skills });
          }}
        />
        <ComposerFrame
          anchorRef={composerAnchor}
          input={
            <SkillInput
              value={draft.text}
              skills={draft.skills}
              editable={canSend && !saved.attempt}
              caret={caret}
              onCaret={setCaret}
              onChange={(text) => update({ text })}
            />
          }
          policy={state.session?.approval_policy}
          modelLabel={modelLabel}
          disabled={{ attach: !canSend || !!saved.attempt }}
          onAttach={() => setAttachmentMenu(true)}
          onPolicy={() => {
            Keyboard.dismiss();
            setOptionPane("policy");
          }}
          onModel={() => {
            Keyboard.dismiss();
            setOptionPane("model");
          }}
          trailing={
            <>
              {contextRatio >= 0.75 && state.session?.context_usage && (
                <ContextUsage
                  tokens={state.session.context_usage.tokens}
                  window={state.session.context_usage.window}
                  onPress={() => setOptionPane("context")}
                />
              )}
              {turn &&
              !draft.text.trim() &&
              !draft.images.length &&
              !draft.files?.length &&
              !draft.references?.length &&
              !saved.attempt ? (
                <IconButton
                  filled
                  icon={Square}
                  label={t("mobile.stopResponse")}
                  disabled={busy || !state.session?.live}
                  onPress={() => void run(() => client.pause(id, turn))}
                />
              ) : (
                <IconButton
                  icon={ArrowUp}
                  filled
                  label={busy ? t("confirmActionDialog.working") : saved.attempt ? t("app.retry2") : t("mobile.send")}
                  disabled={
                    !canSend ||
                    (!draft.text.trim() &&
                      !draft.images.length &&
                      !draft.files?.length &&
                      !draft.references?.length)
                  }
                  onPress={() => void run(send)}
                />
              )}
            </>
          }
        />
      </View>
      <ConversationOptions
        client={client}
        id={id}
        session={state.session}
        pane={optionPane}
        onPane={setOptionPane}
        onClose={() => setOptionPane(undefined)}
        anchorRef={composerAnchor}
        busy={busy}
        running={!!turn}
        error={error}
        onError={setError}
        run={run}
        alive={alive}
        title={title}
        savedTitle={savedTitle}
        onTitle={setTitle}
        onRenamed={(next) => {
          setSavedTitle(next);
          nav.setOptions({ title: next });
        }}
        onReadState={setReadState}
        onOpenFiles={() => {
          setOptionPane(undefined);
          nav.navigate("Files", { path: state.session?.working_directory, sessionId: id });
        }}
        onOpenProfiles={() => {
          setOptionPane(undefined);
          nav.navigate("Profiles");
        }}
        onFork={() => forks.fork(undefined, (request) => client.fork(id, request))}
        onForked={(session) => {
          if (!focused.current || client.signal.aborted) return;
          setOptionPane(undefined);
          nav.push("Conversation", { id: session.id, title: "Fork · " + title });
        }}
        onArchived={() => {
          setOptionPane(undefined);
          nav.goBack();
        }}
      />
      <BottomSheet
        anchorRef={composerAnchor}
        visible={attachmentMenu}
        title={t("attachmentMenu.composerActions")}
        onClose={() => setAttachmentMenu(false)}
        onDismiss={() => {
          const open = pendingAttachmentPicker.current;
          pendingAttachmentPicker.current = undefined;
          open?.();
        }}
      >
        <ChoiceRow
          title={t("mobile.photoLibrary")}
          disabled={
            !canSend ||
            draft.images.length + (draft.files?.length ?? 0) >=
              maxMessageImageCount
          }
          onPress={() => {
            openAttachmentPicker(() => composer.attachImages("library"));
          }}
        />
        <ChoiceRow
          title={t("mobile.takePhoto")}
          disabled={
            !canSend ||
            draft.images.length + (draft.files?.length ?? 0) >=
              maxMessageImageCount
          }
          onPress={() => {
            openAttachmentPicker(() => composer.attachImages("camera"));
          }}
        />
        <ChoiceRow
          title={t("mobile.chooseFile")}
          disabled={
            !canSend ||
            draft.images.length + (draft.files?.length ?? 0) >=
              maxMessageImageCount
          }
          onPress={() => {
            openAttachmentPicker(composer.attachFiles);
          }}
        />
        <ChoiceRow
          title={
            defaultSendMode.mode === "steering"
              ? t("app.queueForNextTurn")
              : t("app.sendAsSteering")
          }
          disabled={
            !canSend ||
            !!saved.attempt ||
            (!draft.text.trim() &&
              !draft.images.length &&
              !draft.files?.length &&
              !draft.references?.length)
          }
          onPress={() => {
            setAttachmentMenu(false);
            void run(() =>
              send(defaultSendMode.mode === "steering" ? "queue" : "steering"),
            );
          }}
        />
      </BottomSheet>
      {history && (
        <ConversationHistory
          sessionId={id}
          items={state.items}
          target={history.target}
          excerpt={history.excerpt}
          onClose={() => setHistory(undefined)}
          openFile={(path) => {
            setHistory(undefined);
            nav.navigate("Files", { sessionId: id, path });
          }}
          onSelection={(value) => {
            setHistory(undefined);
            selectText(value);
          }}
        />
      )}
      {editingReference &&
        draft.references?.find((ref) => ref.id === editingReference) && (
          <ReferenceEditor
            key={editingReference}
            reference={
              draft.references.find((ref) => ref.id === editingReference)!
            }
            onClose={() => setEditingReference(undefined)}
            onSave={(comment) => {
              update({
                references: draft.references?.map((ref) =>
                  ref.id === editingReference ? { ...ref, comment } : ref,
                ),
              });
              setEditingReference(undefined);
            }}
            onLocate={() => {
              const ref = draft.references!.find(
                (ref) => ref.id === editingReference,
              )!;
              setEditingReference(undefined);
              setHistory({ target: ref.messageId, excerpt: ref.text });
            }}
          />
        )}
      {selection && (
        <SelectionSheet
          text={selection.text}
          sessionId={id}
          onClose={() => setSelection(undefined)}
        />
      )}
    </KeyboardFrameView>
  );
}
