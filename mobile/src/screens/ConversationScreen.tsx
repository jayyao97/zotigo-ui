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
import Gauge from "lucide-react-native/icons/gauge";
import { ComposerSkills } from "../components/ComposerSkills";
import { SelectionSheet } from "../components/SelectionSheet";
import { DiagramProvider } from "../components/DiagramProvider";
import { ImagePreviewProvider } from "../components/ImagePreviewProvider";
import { ContextUsage } from "../components/ContextUsage";
import { ProfilePicker } from "../components/ProfilePicker";
import { TurnStatus } from "../components/TurnStatus";
import { useThinkingDisplay } from "../platform/preferences";
import {
  defaultThinkingDisclosureOpen,
  latestReasoningItemId,
} from "@zotigo/shared/thinkingDisplay";
import {
  approvalPolicyLabel,
  approvalPolicyDescription,
} from "@zotigo/shared/approvalPolicy";
import { ModelPicker } from "../components/ModelPicker";
import { BottomSheet, ChoiceRow } from "../components/BottomSheet";
import { useLayoutTransition } from "../components/useLayoutTransition";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Terminal from "lucide-react-native/icons/terminal";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
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
import Plus from "lucide-react-native/icons/plus";
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
  KeyboardAvoidingView,
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
import { pendingHumanRequestIDs } from "@zotigo/shared/sessionDisplay";
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
  Section,
  styles,
  TextField,
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
  return (
    <DiagramProvider>
      <ImagePreviewProvider>
        <ConversationContent />
      </ImagePreviewProvider>
    </DiagramProvider>
  );
}

function ConversationContent() {
  const animateLayout = useLayoutTransition();
  const client = useDaemon(),
    route = useRoute<RouteProp<Routes, "Conversation">>(),
    nav = useNavigation<NativeStackNavigationProp<Routes>>();
  const { id } = route.params;
  const timeline = useMemo(() => new Timeline(client, id), [client, id]);
  const state = useSyncExternalStore(timeline.subscribe, timeline.snapshot);
  const insets = useSafeAreaInsets();
  const header = useHeaderHeight();
  const composer = useMemo(
    () => new ComposerStore(storage, client.connection.id, id),
    [client, id],
  );
  const [caret, setCaret] = useState(0);
  const [saved, setSaved] = useState<ComposerState>({ draft: emptyDraft() });
  const draftRef = useRef(saved);
  const [loaded, setLoaded] = useState(false);
  const revision = useRef(0);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const focused = useRef(false);
  usePreventRemove(busy, ({ data }) => {
    if (!lock.current) nav.dispatch(data.action);
    else
      Alert.alert(
        "Please wait",
        "Your request and draft are still being saved.",
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
    "session" | "model" | "policy" | "context"
  >("session");
  const [pinned, setPinned] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<AgentCatalogResponse>();
  const [profiles, setProfiles] = useState<ProfilesResponse>();
  const [title, setTitle] = useState(route.params.title);
  useConversationTitle(id, state.items, (value) => {
    setTitle(value);
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
  const [history, setHistory] = useState<{
    target?: string;
    excerpt?: string;
  }>();
  const [editingReference, setEditingReference] = useState<string>();
  const [selection, setSelection] = useState<{
    text: string;
    messageId: string;
  }>();
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
  const draft = saved.draft;
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
            setError("Draft could not be saved: " + errorText(e));
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
      if (alive.current) setBusy(false);
      if (focused.current)
        void timeline.refreshSession().catch((e) => {
          if (alive.current) setError(errorText(e));
        });
    }
    if (succeeded && focused.current && !client.signal.aborted) onSuccess?.();
  }
  async function send(mode = defaultSendMode.mode) {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = undefined;
    await prepareAttachments(client, id, draftRef, composer, (value) => {
      if (alive.current) setSaved(value);
    });
    const current = draftRef.current;
    const attempt = submissionAttempt(
      current,
      randomUUID(),
      mode === "steering" && !!activeTurn(timeline.snapshot().items),
      mode === "queue" ? "queue" : undefined,
    );
    const pending = { draft: current.draft, attempt };
    draftRef.current = pending;
    setSaved(pending);
    revision.current++;
    await composer.write(pending); // Persist exact payload/id before dispatch so a timeout is retryable.
    try {
      await client.send(
        id,
        {
          text: attempt.text,
          skills: attempt.skills,
          images: attempt.images,
          client_message_id: attempt.client_message_id,
        },
        attempt.mode ?? attempt.steer,
      );
      if (alive.current) setQueueRevision((value) => value + 1);
      const empty = { draft: emptyDraft() };
      const persisted = composer.transition(draftRef, empty);
      if (alive.current) setSaved(empty);
      await persisted;
    } catch (e) {
      // Validation is definitely rejected; network/5xx remains uncertain and retains the same id.
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.code !== "command_id_conflict"
      ) {
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
          "This daemon does not support queued messages yet. Update the daemon or switch to Steer.",
        );
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
  const thinking = useThinkingDisplay();
  const ordered = useMemo(
    () => orderLateTurnItems([...state.items, ...state.previews]),
    [state.items, state.previews],
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
              : "Thinking",
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
    options,
    optionPane,
    state.session?.agent,
    state.session?.working_directory,
  ]);
  const AccessIcon =
    state.session?.approval_policy === "bypass_permissions"
      ? ShieldAlert
      : ShieldCheck;
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
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={header}
    >
      <View
        style={{
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text numberOfLines={1} style={[styles.muted, { flex: 1 }]}>
          {client.connection.name} · {state.status}
          {state.session?.model ? " · " + state.session.model : ""}
        </Text>
        <IconButton
          icon={Search}
          label="Search conversation"
          onPress={() => setHistory({})}
        />
        <IconButton
          icon={Ellipsis}
          label="Conversation details"
          onPress={() => {
            setOptionPane("session");
            setOptions(true);
          }}
        />
      </View>
      {!!(state.error || error) && (
        <View style={{ paddingHorizontal: 16 }}>
          <Notice text={error} error />
          <Notice text={state.error} error />
          {!!state.error && (
            <Action
              label="Reconnect"
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
      <FlatList
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
          setFollowing(false);
        }}
        onScrollEndDrag={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            event.nativeEvent;
          setFollowing(
            follow.current.observeDistance(
              inverted
                ? contentOffset.y
                : contentSize.height -
                    contentOffset.y -
                    layoutMeasurement.height,
            ),
          );
          follow.current.endDrag();
        }}
        onMomentumScrollBegin={() => follow.current.beginMomentum()}
        onMomentumScrollEnd={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            event.nativeEvent;
          setFollowing(
            follow.current.observeDistance(
              inverted
                ? contentOffset.y
                : contentSize.height -
                    contentOffset.y -
                    layoutMeasurement.height,
            ),
          );
          follow.current.endMomentum();
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
                  ? "Loading conversation…"
                  : "Start a conversation in this workspace."
              }
            />
          </View>
        }
        ListHeaderComponent={inverted ? requestsView : historyLoader}
        ListFooterComponent={inverted ? historyLoader : requestsView}
      />
      {!following && (
        <View style={{ alignItems: "center", height: 44 }}>
          <IconButton
            icon={ArrowDown}
            label="Jump to latest"
            onPress={scrollToBottom}
          />
        </View>
      )}
      <View
        style={{
          padding: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          gap: 8,
          backgroundColor: colors.background,
        }}
      >
        <InputQueue sessionId={id} refresh={queueRevision} />
        <Notice text={defaultSendMode.error} error />
        {!!saved.attempt && (
          <Notice text="Delivery is unconfirmed. Retry sends the exact same message safely; discard only after checking the conversation." />
        )}
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
                    accessibilityLabel={`Edit reference ${index + 1}`}
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
                    label={`Remove reference ${index + 1}`}
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
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 4,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <SkillInput
              value={draft.text}
              skills={draft.skills}
              editable={canSend && !saved.attempt}
              caret={caret}
              onCaret={setCaret}
              onChange={(text) => update({ text })}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            <IconButton
              icon={Plus}
              label="More composer actions"
              disabled={!canSend || !!saved.attempt}
              onPress={() => setAttachmentMenu(true)}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Permissions"
              accessibilityHint={
                state.session?.approval_policy === "bypass_permissions"
                  ? "Full access"
                  : "Auto"
              }
              style={{
                minHeight: 44,
                minWidth: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                backgroundColor: colors.elevated,
              }}
              onPress={() => {
                setOptionPane("policy");
                setOptions(true);
              }}
            >
              <AccessIcon
                size={18}
                color={
                  state.session?.approval_policy === "bypass_permissions"
                    ? "#ff8549"
                    : colors.muted
                }
              />
            </Pressable>
            <View style={{ flex: 1 }} />
            <IconButton
              icon={Gauge}
              label="Model and reasoning"
              onPress={() => {
                setOptionPane("model");
                setOptions(true);
              }}
            />
            {state.session?.context_usage && (
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
                label="Stop response"
                disabled={busy || !state.session?.live}
                onPress={() => void run(() => client.pause(id, turn))}
              />
            ) : (
              <IconButton
                icon={ArrowUp}
                filled
                label={busy ? "Working…" : saved.attempt ? "Retry" : "Send"}
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
          </View>
        </View>
        {saved.attempt && (
          <Action
            label="Discard pending submission"
            danger
            secondary
            disabled={busy}
            onPress={() =>
              Alert.alert(
                "Discard pending submission?",
                "The daemon may already have received it. Check history before sending again.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Discard",
                    style: "destructive",
                    onPress: () =>
                      void run(async () => {
                        const next = { draft: emptyDraft() };
                        const persisted = composer.transition(draftRef, next);
                        setSaved(next);
                        await persisted;
                      }),
                  },
                ],
              )
            }
          />
        )}
      </View>
      <BottomSheet
        visible={options}
        disabled={busy}
        title={
          optionPane === "model"
            ? "Model and reasoning"
            : optionPane === "policy"
              ? "Permissions"
              : optionPane === "context"
                ? "Context usage"
                : "Conversation"
        }
        onClose={() => {
          setOptions(false);
        }}
      >
        <Notice text={error} error />
        {optionPane === "model" && (
          <Notice
            text={`Current: ${[state.session?.model || state.session?.profile || "Unavailable", state.session?.reasoning_effort].filter(Boolean).join(" · ")}`}
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
                % used
              </Text>
              <Text style={styles.muted}>
                {state.session.context_usage.tokens.toLocaleString()} /{" "}
                {state.session.context_usage.window.toLocaleString()} tokens
              </Text>
            </View>
          )}
          {optionPane === "session" && (
            <Section title="Session">
              <Text selectable style={styles.muted}>
                {id}
                {"\n"}
                {state.session?.working_directory}
                {"\n"}
                {state.session?.state} ·{" "}
                {state.session?.context_usage
                  ? `${state.session.context_usage.tokens} / ${state.session.context_usage.window} tokens`
                  : ""}
              </Text>
              <TextField label="Title" value={title} onChangeText={setTitle} />
              <Action
                label="Rename"
                disabled={busy || !title.trim()}
                onPress={() =>
                  void run(async () => {
                    await client.renameSession(id, title.trim());
                    if (alive.current) nav.setOptions({ title: title.trim() });
                  })
                }
              />
              <Action
                label={pinned ? "Unpin session" : "Pin session"}
                disabled={busy || pinned === null}
                onPress={() =>
                  void run(async () => {
                    await client.pinSession(id, !pinned);
                    if (alive.current) setPinned(!pinned);
                  })
                }
              />
              <Action
                label="Files"
                disabled={busy}
                onPress={() => {
                  setOptions(false);
                  nav.navigate("Files", {
                    path: state.session?.working_directory,
                    sessionId: id,
                  });
                }}
              />
              <Action
                label="Resume runtime"
                disabled={busy || state.session?.live}
                onPress={() => void run(() => client.start(id))}
              />
              <Action
                label="Fork session"
                disabled={busy || !!turn}
                onPress={() =>
                  void run(async () => {
                    const session = await client.fork(id, randomUUID());
                    if (focused.current && !client.signal.aborted) {
                      setOptions(false);
                      nav.push("Conversation", {
                        id: session.id,
                        title: "Fork · " + title,
                      });
                    }
                  })
                }
              />
            </Section>
          )}
          {optionPane === "model" &&
            (state.session?.agent === "codex" ? (
              <View style={{ gap: 8 }}>
                {!agents && !error && <Loading />}
                {error && (
                  <Action
                    label="Retry loading models"
                    onPress={() =>
                      void run(async () =>
                        setAgents(await client.modelCatalog()),
                      )
                    }
                  />
                )}
                <Notice
                  text={
                    turn
                      ? "Stop the current response before changing models."
                      : ""
                  }
                />
                <ModelPicker
                  models={
                    agents?.agents.find((a) => a.id === "codex")?.models ?? []
                  }
                  model={state.session?.model ?? ""}
                  effort={state.session?.reasoning_effort ?? ""}
                  disabled={busy || !!turn}
                  onConfirm={(model, effort) =>
                    void run(
                      () => client.changeModel(id, model, effort),
                      () => setOptions(false),
                    )
                  }
                />
              </View>
            ) : (
              <Section title="Profile">
                {profiles && (
                  <ProfilePicker
                    profiles={profiles.profiles}
                    selected={state.session?.profile}
                    disabled={busy || !!turn}
                    onSelect={(name) =>
                      void run(
                        () => client.changeProfile(id, name),
                        () => setOptions(false),
                      )
                    }
                  />
                )}
              </Section>
            ))}
          {optionPane === "policy" && (
            <View style={{ gap: 8 }}>
              <ChoiceRow
                title={approvalPolicyLabel("auto")}
                subtitle={approvalPolicyDescription("auto")}
                selected={state.session?.approval_policy === "auto"}
                disabled={busy}
                onPress={() =>
                  void run(
                    () => client.changePolicy(id, "auto"),
                    () => setOptions(false),
                  )
                }
              />
              <ChoiceRow
                title={approvalPolicyLabel("bypass_permissions")}
                subtitle={approvalPolicyDescription("bypass_permissions")}
                selected={
                  state.session?.approval_policy === "bypass_permissions"
                }
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    "Bypass approvals?",
                    "Tools may run without asking you.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Enable",
                        style: "destructive",
                        onPress: () =>
                          void run(
                            () => client.changePolicy(id, "bypass_permissions"),
                            () => setOptions(false),
                          ),
                      },
                    ],
                  )
                }
              />
            </View>
          )}
          {optionPane === "session" && (
            <Action
              label="Archive session"
              danger
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  "Archive session?",
                  "This hides the session from active lists. History is retained.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Archive",
                      style: "destructive",
                      onPress: () =>
                        void run(
                          () => client.archiveSession(id),
                          () => {
                            setOptions(false);
                            nav.goBack();
                          },
                        ),
                    },
                  ],
                )
              }
            />
          )}
        </>
      </BottomSheet>
      <BottomSheet
        visible={attachmentMenu}
        title="Composer actions"
        onClose={() => setAttachmentMenu(false)}
        onDismiss={() => {
          const open = pendingAttachmentPicker.current;
          pendingAttachmentPicker.current = undefined;
          open?.();
        }}
      >
        <ChoiceRow
          title="Photo library"
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
          title="Choose file"
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
              ? "Queue for next turn"
              : "Send as steering"
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
    </KeyboardAvoidingView>
  );
}
