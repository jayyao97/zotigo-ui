import { CompletionNotifications } from "../components/CompletionNotifications";
import { interactionState } from "@zotigo/shared/interactionState";
import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import { KeyboardFrameView } from "../components/KeyboardFrameView";
import { canAcknowledgeSession } from "@zotigo/shared/sessionReadState";
import { DraftImages } from "../components/DraftImages";
import { SkillInput } from "../components/SkillInput";
import { AttachmentFiles } from "../components/AttachmentFiles";
import { pickAttachments } from "../platform/pickAttachments";
import { validateAttachments } from "../core/attachments";
import Search from "lucide-react-native/icons/search";
import { ConversationHistory } from "../components/ConversationHistory";
import { ReferenceEditor } from "../components/ReferenceEditor";
import { useConversationTitle } from "../platform/useConversationTitle";
import { InputQueue } from "../components/InputQueue";
import { useSendMode } from "../platform/preferences";
import { ComposerSkills } from "../components/ComposerSkills";
import { ComposerFrame, PolicyChoices } from "../components/ComposerFrame";
import { ConversationActions } from "../components/ConversationActions";
import { SelectionSheet } from "../components/SelectionSheet";
import { DiagramProvider } from "../components/DiagramProvider";
import { ImagePreviewProvider } from "../components/ImagePreviewProvider";
import { ContextUsage } from "../components/ContextUsage";
import { TurnStatus } from "../components/TurnStatus";
import { useThinkingDisplay } from "../platform/preferences";
import {
  defaultThinkingDisclosureOpen,
  latestReasoningItemId,
} from "@zotigo/shared/thinkingDisplay";
import { RuntimePicker } from "../components/RuntimePicker";
import { Keyboard } from "react-native";
import { BottomSheet, ChoiceRow } from "../components/BottomSheet";
import { useLayoutTransition } from "../components/useLayoutTransition";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Terminal from "lucide-react-native/icons/terminal";
import {
  groupTimelineItems,
  orderLateTurnItems,
  visibleDisplayItems,
  buildToolRenderProjection,
  historicalToolSummary,
} from "@zotigo/shared/sessionDisplay";
import { sessionTurnActions } from "@zotigo/shared/sessionFork";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import Square from "lucide-react-native/icons/square";
import X from "lucide-react-native/icons/x";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Alert,
  AppState,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
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
import * as ImagePicker from "expo-image-picker";
import { randomUUID } from "expo-crypto";
import type {
  AgentCatalogResponse,
  DisplayItem,
  ProfilesResponse,
} from "@zotigo/shared/zotigod";
import { acknowledgeOptimisticPrompt, anchorPromptTimeline, capturePromptTimelineAnchor, optimisticPromptDisplayItem, type PromptTimelineAnchor, orderDisplayInputs, pendingHumanRequestIDs } from "@zotigo/shared/sessionDisplay";
import {
  maxMessageImageCount,
  messageImageSizeError,
  decodedBase64Size,
} from "@zotigo/shared/messageImages";
import type { Routes } from "../navigation";
import { useDaemon } from "../platform/context";
import { storage } from "../platform/storage";
import { Timeline, activeTurn } from "../core/timeline";
import { TimelineFollow } from "../core/timelineFollow";
import type { ConversationReference } from "../core/conversationReferences";
import {
  HistoryPaginationGesture,
  TimelineScrollMetrics,
  retainExpandedTimelineGroups,
} from "../core/timelineScroll";
import {
  ComposerStore,
  emptyDraft,
  submissionAttempt,
  prepareAttachments,
  type ComposerState,
  type Draft,
} from "../core/composer";
import { ApiError } from "../core/client";
import { pickedImageInput } from "../core/imageInput";
import {
  Action,
  IconButton,
  colors,
  errorText,
  Notice,
  Loading,
  styles,
} from "../components/ui";
import { MessageCard } from "../components/MessageCard";
import { HumanRequest } from "../components/HumanRequests";

type TimelineRow =
  | {
      kind: "item";
      key: string;
      item: DisplayItem;
      revealReasoning?: boolean;
    }
  | { kind: "activity"; key: string; label: string; open: boolean };
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
  const composer = useMemo(
    () => new ComposerStore(storage, client.connection.id, id),
    [client, id],
  );
  const [caret, setCaret] = useState(0);
  const [saved, setSaved] = useState<ComposerState>({ draft: emptyDraft() });
  const composerAnchor = useRef<View>(null);
  const draftRef = useRef(saved);
  const [promptPreviews, setPromptPreviews] = useState<DisplayItem[]>([]);
  const promptAnchors = useRef(new Map<string, PromptTimelineAnchor>());
  const [loaded, setLoaded] = useState(false);
  const revision = useRef(0);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
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
  const [options, setOptions] = useState(false);
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
  const [optionPane, setOptionPane] = useState<
    "session" | "model" | "policy" | "context" | "notifications"
  >("session");
  const [pinned, setPinned] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<AgentCatalogResponse>();
  const [profiles, setProfiles] = useState<ProfilesResponse>();
  const [modelRevision, setModelRevision] = useState(0);
  const [title, setTitle] = useState(route.params.title);
  // What the daemon has, so Save is offered only for an unsaved edit.
  const [savedTitle, setSavedTitle] = useState(route.params.title);
  useConversationTitle(id, state.items, (value) => {
    setTitle(value);
    setSavedTitle(value);
    nav.setOptions({ title: value });
  });
  const defaultSendMode = useSendMode(client.connection.id);
  const [queueRevision, setQueueRevision] = useState(0);
  const list = useRef<FlatList<TimelineRow>>(null);
  const follow = useRef(new TimelineFollow());
  const historyGesture = useRef(new HistoryPaginationGesture());
  const inverted = Platform.OS !== "web";
  const scrollMetrics = useRef(new TimelineScrollMetrics(inverted));
  const [following, setFollowing] = useState(true);
  const [showJump, setShowJump] = useState(false);
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
          !options &&
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
    options,
    selection,
    attachmentMenu,
    readTracking,
  ]);
  const selectingText = useCallback(() => {
    follow.current.leaveLatest();
    setFollowing(false);
  }, []);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    alive.current = true;
    let active = true;
    composer
      .read()
      .then((value) => {
        if (active) {
          draftRef.current = value;
          setSaved(value);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
      alive.current = false;
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, [composer]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const resume = () => {
        if (AppState.currentState === "active") void timeline.start();
      };
      resume();
      const sub = AppState.addEventListener("change", (value) => {
        if (value === "active") resume();
        else timeline.stop();
      });
      return () => {
        focused.current = false;
        sub.remove();
        timeline.stop();
      };
    }, [timeline]),
  );
  // One persistence owner: no effect cleanup can enqueue an older snapshot after send.
  useEffect(
    () => () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      if (revision.current)
        void composer.write(draftRef.current).catch(() => {});
    },
    [composer],
  );
  const draft = busy && sendCanLeave ? emptyDraft() : saved.draft;
  const update = useCallback(
    (patch: Partial<Draft>) => {
      const next = {
        ...draftRef.current,
        draft: { ...draftRef.current.draft, ...patch },
      };
      revision.current++;
      draftRef.current = next;
      setSaved(next);
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        draftTimer.current = undefined;
        void composer.write(draftRef.current).catch((e) => {
          if (alive.current)
            setError(t("mobile.draftSaveFailed", { error: errorText(e) }));
        });
      }, 300);
    },
    [composer],
  );
  const addReference = useCallback(
    (reference: Omit<ConversationReference, "id">) => {
      if (lock.current || draftRef.current.attempt) return;
      update({
        references: [
          ...(draftRef.current.draft.references ?? []),
          { ...reference, id: randomUUID() },
        ],
      });
    },
    [update],
  );
  const selectText = useCallback(
    (value: {
      action: "reference" | "translate";
      text: string;
      messageId: string;
    }) => {
      selectingText();
      if (value.action === "reference")
        addReference({
          messageId: value.messageId,
          text: value.text,
          comment: "",
        });
      else setSelection(value);
    },
    [addReference, selectingText],
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
    return composer.submit(() => sendRequest(mode));
  }
  async function sendRequest(mode: "queue" | "steering") {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = undefined;
    const promptId = draftRef.current.attempt?.client_message_id ?? randomUUID();
    const initial = draftRef.current;
    const preview = optimisticPromptDisplayItem({
      id: promptId, text: initial.attempt?.text ?? [initial.draft.text, ...(initial.draft.files ?? []).map(file => file.name)].filter(Boolean).join("\n\n"),
      skills: initial.draft.skills,
      steering: initial.attempt?.steer ?? (mode === "steering" && !!activeTurn(timeline.snapshot().items)),
      createdAt: new Date().toISOString(),
      images: initial.draft.images.map(image => ({ url: `data:${image.mime_type};base64,${image.data_base64}` })),
    });
    preview.queuedPreview = initial.attempt ? initial.attempt.mode === "queue" : mode === "queue";
    if (!preview.queuedPreview && !promptAnchors.current.has(promptId)) {
      const snapshot = timeline.snapshot();
      promptAnchors.current.set(promptId, capturePromptTimelineAnchor(
        snapshot.items.at(-1)?.sequence ?? 0, snapshot.previews.map(item => item.id), promptAnchors.current,
      ));
    }
    if (alive.current) setPromptPreviews(items => [...items.filter(item => item.id !== promptId), preview]);
    let prepared = false;
    try {
      await prepareAttachments(client, id, draftRef, composer, (value) => {
        if (alive.current) setSaved(value);
      });
      const current = draftRef.current;
      const attempt = submissionAttempt(
        current,
        promptId,
        mode === "steering" && !!activeTurn(timeline.snapshot().items),
        mode === "queue" ? "queue" : undefined,
      );

      const pending = { draft: current.draft, attempt };
      draftRef.current = pending;
      if (alive.current) setSaved(pending);
      revision.current++;
      await composer.write(pending); // Persist exact payload/id before dispatch so a timeout is retryable.
      prepared = true;
      try {
        const command = await client.send(
          id,
          {
            text: attempt.text,
            skills: attempt.skills,
            images: attempt.images,
            client_message_id: attempt.client_message_id,
          },
          attempt.mode ?? attempt.steer,
        );
        // Finish persistence even after navigation. Reopened pages wait for this
        // submission before taking ownership of the draft.
        if (alive.current) {
          const acknowledged = acknowledgeOptimisticPrompt(preview, command, timeline.snapshot().items);
          const anchor = promptAnchors.current.get(promptId);
          promptAnchors.current.delete(promptId);
          if (anchor && acknowledged) promptAnchors.current.set(command.id, anchor);
          setPromptPreviews(items => [...items.filter(item => item.id !== promptId), ...(acknowledged ? [{ ...acknowledged, queuedPreview: preview.queuedPreview, queueConfirmed: preview.queuedPreview }] : [])]);
          setQueueRevision((value) => value + 1);
        }
        const empty = { draft: emptyDraft() };
        const persisted = composer.transition(draftRef, empty);
        if (alive.current) setSaved(empty);
        await persisted;
      } catch (e) {
        if (alive.current) setPromptPreviews(items => items.map(item => item.id === promptId ? { ...item, delivery: { state: "failed", error: t("mobile.deliveryUnknown") } } : item));
        // Validation is definitely rejected; network/5xx remains uncertain and retains the same id.
        if (
          e instanceof ApiError &&
          e.status >= 400 &&
          e.status < 500 &&
          e.code !== "command_id_conflict"
        ) {
          if (alive.current) setPromptPreviews(items => items.filter(item => item.id !== promptId));
          promptAnchors.current.delete(promptId);
          const restored = { draft: current.draft };
          const persisted = composer.transition(draftRef, restored);
          if (alive.current) setSaved(restored);
          await persisted;
        }
        if (
          attempt.mode === "queue" &&
          e instanceof ApiError &&
          [404, 405].includes(e.status)
        )
          throw new Error(
            t("mobile.thisDaemonDoesNotSupportQueuedMessagesYetUpdateTheDaemonOrSwitchToSteer"),
          );
        throw e;
      }
    } catch (e) {
      if (!prepared && alive.current) setPromptPreviews(items => items.filter(item => item.id !== promptId));
      throw e;
    }
  }
  async function attach() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: Math.max(
        1,
        maxMessageImageCount - draft.images.length - (draft.files?.length ?? 0),
      ),
    });
    if (result.canceled || !alive.current) return;
    const images = [...draftRef.current.draft.images];
    for (const asset of result.assets) {
      images.push(pickedImageInput(asset));
    }
    const sizeError = messageImageSizeError(
      images.map((image) => decodedBase64Size(image.data_base64)),
    );
    if (sizeError) throw new Error(sizeError);
    validateAttachments(images, draftRef.current.draft.files ?? []);
    update({ images });
  }
  const pending = useMemo(
    () => pendingHumanRequestIDs(state.items),
    [state.items],
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
  useEffect(() => {
    const durable = new Set(state.items.map(item => item.id));
    setPromptPreviews(items => items.some(item => durable.has(item.id)) ? items.filter(item => !durable.has(item.id)) : items);
    for (const id of durable) promptAnchors.current.delete(id);
  }, [state.items]);
  const thinking = useThinkingDisplay();
  const ordered = useMemo(
    () => orderDisplayInputs(anchorPromptTimeline(orderLateTurnItems([
      ...state.items, ...state.previews,
      ...promptPreviews.filter(item => !item.queuedPreview && !state.items.some(durable => durable.id === item.id)),
    ]), promptAnchors.current)),
    [state.items, state.previews, promptPreviews],
  );
  const previewIds = useMemo(
    () => new Set(state.previews.map((i) => i.id)),
    [state.previews],
  );
  const turn = activeTurn(state.items);
  const [disclosures, setDisclosures] = useState<Record<string, boolean>>({});
  const projection = useMemo(
    () => buildToolRenderProjection(ordered),
    [ordered],
  );
  const data = useMemo<TimelineRow[]>(() => {
    const sequence = turn
      ? state.items.find(
          (i) => i.type === "turn_started" && i.turn?.id === turn,
        )?.sequence
      : undefined;
    return groupTimelineItems(
      visibleDisplayItems(ordered),
      sequence,
    ).flatMap<TimelineRow>((group) => {
      if (group.kind === "item")
        return [{ kind: "item", key: group.item.id, item: group.item }];
      const key = group.kind + ":" + group.items[0].id;
      const open =
        disclosures[key] ??
        ((group.kind === "tools" && group.active) ||
          (state.session?.agent !== "codex" &&
            group.items.some(
              (item) =>
                item.content?.some((p) => p.type === "reasoning") &&
                defaultThinkingDisclosureOpen(
                  thinking.mode,
                  item.id === latestReasoningItemId(ordered),
                ),
            )));
      return [
        {
          kind: "activity",
          key,
          label:
            group.kind === "tools"
              ? historicalToolSummary(group.items)
              : t("app.thinking"),
          open,
        },
        ...(open
          ? group.items.map((item) => ({
              kind: "item" as const,
              key: item.id,
              item,
              revealReasoning: true,
            }))
          : []),
      ];
    });
  }, [
    locale,
    ordered,
    state.items,
    state.session?.agent,
    turn,
    disclosures,
    thinking.mode,
  ]);
  const listData = useMemo(
    () => (inverted ? [...data].reverse() : data),
    [data, inverted],
  );
  const turnActions = useMemo(
    () => sessionTurnActions(state.items),
    [state.items],
  );
  const forkRequests = useRef(new Map<string, string>());
  const forkFrom = useCallback(
    (turnId: string) => {
      void run(async () => {
        let request = forkRequests.current.get(turnId);
        if (!request) {
          request = randomUUID();
          forkRequests.current.set(turnId, request);
        }
        const session = await client.fork(id, request, turnId);
        if (focused.current && !client.signal.aborted)
          nav.push("Conversation", {
            id: session.id,
            title: "Fork · " + title,
          });
      });
    },
    [client, id, title],
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
              follow.current.leaveLatest();
              setFollowing(false);
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
          onSelecting={selectingText}
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
      selectingText,
    ],
  );

  useEffect(() => {
    if (!options) return;
    let active = true;
    if (options && optionPane === "session") setPinned(null);
    const request =
      options && optionPane === "model"
        ? state.session?.agent === "codex"
          ? client.modelCatalog().then((value) => {
              if (active) setAgents(value);
            })
          : client.profiles(state.session?.working_directory).then((value) => {
              if (active) setProfiles(value);
            })
        : options && optionPane === "session"
          ? client.catalog().then((items) => {
              if (active)
                setPinned(
                  !!items.find(
                    (item) =>
                      item.organization?.session_id === id ||
                      item.runtime?.id === id,
                  )?.organization?.pinned_at,
                );
            })
          : undefined;
    void request?.catch((e) => {
      if (active) setError(errorText(e));
    });
    return () => {
      active = false;
    };
  }, [
    client,
    id,
    modelRevision, options,
    optionPane,
    state.session?.agent,
    state.session?.working_directory,
  ]);
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
              setOptions(true);
            }}
          />
        </View>
      ),
    });
  }, [nav]);
  const renameSession = () => {
    const next = title.trim();
    if (!next || busy) return;
    void run(async () => {
      await client.renameSession(id, next);
      if (!alive.current) return;
      setSavedTitle(next);
      nav.setOptions({ title: next });
    });
  };
  const modelLabel =
    [state.session?.model || state.session?.profile, state.session?.reasoning_effort]
      .filter(Boolean)
      .join(" · ") || t("mobile.modelAndReasoning");
  // Context only competes for composer space once it is worth acting on.
  const contextRatio = state.session?.context_usage?.window
    ? state.session.context_usage.tokens / state.session.context_usage.window
    : 0;
  const canSend =
    loaded && defaultSendMode.ready && !busy && !client.signal.aborted;
  function scheduleFollowCorrection() {
    if (follow.current.following && !state.loadingOlder && !scrollTimer.current)
      scrollTimer.current = setTimeout(() => {
        scrollTimer.current = undefined;
        if (focused.current && follow.current.following) {
          const offset = scrollMetrics.current.correction();
          if (offset !== undefined)
            list.current?.scrollToOffset({ offset, animated: false });
        }
      }, 80);
  }
  function scrollToBottom() {
    historyGesture.current.cancel();
    scrollMetrics.current.resetCorrection();
    follow.current.jump();
    setShowJump(false);
    setFollowing(true);
    if (inverted) list.current?.scrollToOffset({ offset: 0, animated: true });
    else list.current?.scrollToEnd({ animated: true });
  }
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
            busy || !state.session?.live || state.status !== "connected"
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
        ref={list}
        data={listData}
        inverted={inverted}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={
          following ? undefined : { minIndexForVisible: 0 }
        }
        {...(Platform.OS === "web"
          ? {
              onWheel: (event: { deltaY: number }) => {
                if (event.deltaY < 0) {
                  if (!state.loadingOlder && state.status !== "loading")
                    historyGesture.current.arm();
                  scrollMetrics.current.resetCorrection();
                  follow.current.leaveLatest();
                  setDisclosures((previous) =>
                    retainExpandedTimelineGroups(data, previous),
                  );
                  setFollowing(false);
                }
              },
            }
          : {})}
        onScrollBeginDrag={() => {
          if (!state.loadingOlder && state.status !== "loading")
            historyGesture.current.arm();
          scrollMetrics.current.resetCorrection();
          follow.current.beginDrag();
          setDisclosures((previous) =>
            retainExpandedTimelineGroups(data, previous),
          );
          setFollowing(false);
        }}
        onScrollEndDrag={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            event.nativeEvent;
          follow.current.observeDistance(
            inverted
              ? contentOffset.y
              : contentSize.height - contentOffset.y - layoutMeasurement.height,
          );
          setFollowing(follow.current.endDrag(event.nativeEvent.velocity?.y));
          setShowJump(follow.current.showJump);
        }}
        onMomentumScrollBegin={() => {
          follow.current.beginMomentum();
          setFollowing(follow.current.following);
        }}
        onMomentumScrollEnd={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            event.nativeEvent;
          follow.current.observeDistance(
            inverted
              ? contentOffset.y
              : contentSize.height - contentOffset.y - layoutMeasurement.height,
          );
          setFollowing(follow.current.endMomentum());
          setShowJump(follow.current.showJump);
        }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            event.nativeEvent;
          scrollMetrics.current.offset = contentOffset.y;
          scrollMetrics.current.contentHeight = contentSize.height;
          scrollMetrics.current.viewportHeight = layoutMeasurement.height;
          setFollowing(
            follow.current.observeDistance(
              inverted
                ? contentOffset.y
                : contentSize.height -
                    contentOffset.y -
                    layoutMeasurement.height,
            ),
          );
          setShowJump(follow.current.showJump);
          if (
            historyGesture.current.consume(
              follow.current.following,
              inverted
                ? contentSize.height -
                    contentOffset.y -
                    layoutMeasurement.height
                : contentOffset.y,
              state.more && !state.loadingOlder && state.status !== "loading",
            )
          ) {
            void timeline.older();
          }
        }}
        scrollEventThrottle={32}
        onLayout={(event) => {
          scrollMetrics.current.viewportHeight =
            event.nativeEvent.layout.height;
          scheduleFollowCorrection();
        }}
        onContentSizeChange={(_, height) => {
          scrollMetrics.current.contentHeight = height;
          scheduleFollowCorrection();
        }}
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
        ListHeaderComponent={inverted ? requestsView : historyLoader}
        ListFooterComponent={inverted ? historyLoader : requestsView}
      />
      {showJump && (
        <View pointerEvents="box-none" style={{ position: "absolute", bottom: 8, left: 0, right: 0, alignItems: "center" }}>
          <View style={{ borderRadius: 22, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
          <IconButton
            icon={ArrowDown}
            label={t("mobile.jumpToLatest")}
            onPress={scrollToBottom}
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
            onPress={scrollToBottom}
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
        <InputQueue sessionId={id} refresh={queueRevision}
          pending={promptPreviews.filter(item => item.queuedPreview)}
          onReconciled={ids => setPromptPreviews(items => items.filter(item => !ids.includes(item.id)))} />
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
            setOptions(true);
          }}
          onModel={() => {
            Keyboard.dismiss();
            setOptionPane("model");
            setOptions(true);
          }}
          trailing={
            <>
              {contextRatio >= 0.75 && state.session?.context_usage && (
                <ContextUsage
                  tokens={state.session.context_usage.tokens}
                  window={state.session.context_usage.window}
                  onPress={() => {
                    setOptionPane("context");
                    setOptions(true);
                  }}
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
      <BottomSheet
        anchorRef={composerAnchor}
        visible={options}
        scroll={optionPane !== "model"}
        disabled={busy}
        title={
          optionPane === "notifications" ? t("completionTriggers.title") : optionPane === "model"
            ? t("mobile.modelAndReasoning")
            : optionPane === "policy"
              ? t("channelsPage.permissions")
              : optionPane === "context"
                ? t("mobile.contextUsage")
                : t("mobileUi.conversationActions")
        }
        onClose={() => {
          setOptions(false);
        }}
      >
        <Notice text={error} error />
        {options && optionPane === "notifications" && <CompletionNotifications sessionId={id} />}
        {optionPane === "model" && (
          <Notice
            text={t("mobile.currentValue", {p0: [state.session?.model || state.session?.profile || t("directoryBrowser.unavailable"), state.session?.reasoning_effort].filter(Boolean).join(" · ")})}
          />
        )}
        <>
          {optionPane === "context" && state.session?.context_usage && (
            <View style={{ gap: 8 }}>
              <Text style={styles.title}>
                {Math.round(
                  (state.session.context_usage.tokens /
                    state.session.context_usage.window) *
                    100,
                )}
                {t("contextUsageBadge.used")}</Text>
              <Text style={styles.muted}>
                {["estimate", "provider_estimate"].includes(state.session.context_usage.source ?? "") ? "≈ " : ""}{state.session.context_usage.tokens.toLocaleString()} /{" "}
                {state.session.context_usage.window.toLocaleString()} {t("mobile.tokens")}{state.session.context_usage.tokens > state.session.context_usage.window ? t("contextUsageBadge.overLimit") : ""}
                {state.session.context_usage.cached ? " · last known usage" : ""}
                {state.session.context_usage.source === "provider_estimate" ? " · API input + estimated additions" : state.session.context_usage.source === "estimate" ? " · Local estimate" : ""}
              </Text>
            </View>
          )}
          {optionPane === "session" && (
            <ConversationActions
              id={id}
              session={state.session ?? undefined}
              title={title}
              savedTitle={savedTitle}
              onTitle={setTitle}
              pinned={pinned}
              busy={busy}
              forkDisabled={!!turn}
              contextPercent={Math.round(contextRatio * 100)}
              onRename={renameSession}
              onTogglePin={() =>
                void run(async () => {
                  await client.pinSession(id, !pinned);
                  if (alive.current) setPinned(!pinned);
                })
              }
              onFiles={() => {
                setOptions(false);
                nav.navigate("Files", { path: state.session?.working_directory, sessionId: id });
              }}
              onNotifications={() => setOptionPane("notifications")}
              onContext={() => setOptionPane("context")}
              onFork={() =>
                void run(async () => {
                  const session = await client.fork(id, randomUUID());
                  if (focused.current && !client.signal.aborted) {
                    setOptions(false);
                    nav.push("Conversation", { id: session.id, title: "Fork · " + title });
                  }
                })
              }
              onReadState={() => {
                const read = state.session?.read_state;
                if (read) void run(() => setReadState(read.unread ? read.version : null));
              }}
              onResume={() => void run(() => client.start(id))}
              onArchive={() =>
                void run(
                  () => client.archiveSession(id),
                  () => {
                    setOptions(false);
                    nav.goBack();
                  },
                )
              }
            />
          )}
          {optionPane === "model" && state.session && (
            <>
              {error && (
                <Action
                  label={t("mobile.retryLoadingModels")}
                  disabled={busy}
                  onPress={() => {
                    setError("");
                    setModelRevision((v) => v + 1);
                  }}
                />
              )}
              {state.session.agent === "codex" && !agents && !error && (
                <Loading />
              )}
              <Notice
                text={
                  turn
                    ? t("mobile.stopTheCurrentResponseBeforeChangingModels")
                    : ""
                }
              />
              <RuntimePicker
                unavailableAgents={agents?.unavailable_agents}
                onConfigureModels={() => { setOptions(false); nav.navigate("Profiles"); }}
                key={`${state.session.agent}:${state.session.model}:${state.session.profile}:${state.session.reasoning_effort}`}
                agents={
                  agents?.agents ?? [
                    { id: "zotigo", label: t("app.zotigo"), models: [] },
                  ]
                }
                profiles={profiles}
                profilesLoading={!profiles && !error}
                fixedAgent={state.session.agent}
                value={
                  state.session.agent === "codex"
                    ? {
                        agent: "codex",
                        model: state.session.model ?? "",
                        reasoningEffort: state.session.reasoning_effort ?? "",
                      }
                    : { agent: "zotigo", profile: state.session.profile ?? "" }
                }
                disabled={busy || !!turn}
                onConfirm={(choice) =>
                  void run(
                    () =>
                      choice.agent === "codex"
                        ? client.changeModel(
                            id,
                            choice.model,
                            choice.reasoningEffort,
                          )
                        : client.changeProfile(id, choice.profile),
                    () => setOptions(false),
                  )
                }
              />
            </>
          )}
          {optionPane === "policy" && (
            <PolicyChoices
              value={state.session?.approval_policy}
              disabled={busy}
              onChange={(policy) =>
                policy === state.session?.approval_policy
                  ? setOptions(false)
                  : void run(() => client.changePolicy(id, policy), () => setOptions(false))
              }
            />
          )}
        </>
      </BottomSheet>
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
            openAttachmentPicker(attach);
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
            openAttachmentPicker(async () => {
              const picked = await pickAttachments(
                draftRef.current.draft.images,
                draftRef.current.draft.files ?? [],
              );
              if (picked && alive.current) update(picked);
            });
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
