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
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
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
  SkillsResponse,
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
import {
  ComposerStore,
  emptyDraft,
  type ComposerState,
  type Draft,
} from "../core/composer";
import { ApiError } from "../core/client";
import {
  Action,
  colors,
  errorText,
  Notice,
  Screen,
  Section,
  styles,
  TextField,
} from "../components/ui";
import { MessageCard } from "../components/MessageCard";
import { HumanRequest } from "../components/HumanRequests";

export function ConversationScreen() {
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
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [skills, setSkills] = useState<SkillsResponse>();
  const [agents, setAgents] = useState<AgentCatalogResponse>();
  const [profiles, setProfiles] = useState<ProfilesResponse>();
  const [title, setTitle] = useState(route.params.title);
  const [steer, setSteer] = useState(false);
  const list = useRef<FlatList<DisplayItem>>(null);
  const atBottom = useRef(true);
  const [following, setFollowing] = useState(true);
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
  function update(patch: Partial<Draft>) {
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
  }
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
  async function send() {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = undefined;
    const current = draftRef.current;
    const attempt = current.attempt ?? {
      ...current.draft,
      client_message_id: randomUUID(),
      steer: steer && !!activeTurn(timeline.snapshot().items),
    };
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
        attempt.steer,
      );
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
      throw e;
    }
  }
  async function attach() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, maxMessageImageCount - draft.images.length),
    });
    if (result.canceled || !alive.current) return;
    const images = [...draftRef.current.draft.images];
    for (const asset of result.assets) {
      if (!asset.base64) throw new Error("Image data was unavailable.");
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(
          asset.mimeType ?? "",
        )
      )
        throw new Error("Choose a PNG, JPEG or WebP image.");
      images.push({ mime_type: asset.mimeType!, data_base64: asset.base64 });
    }
    const sizeError = messageImageSizeError(
      images.map((image) => decodedBase64Size(image.data_base64)),
    );
    if (sizeError) throw new Error(sizeError);
    update({ images });
  }
  useEffect(() => {
    if (!activeTurn(state.items)) setSteer(false);
  }, [state.items]);
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
  const data = useMemo(
    () => [...state.items, ...state.previews],
    [state.items, state.previews],
  );
  const previewIds = useMemo(
    () => new Set(state.previews.map((i) => i.id)),
    [state.previews],
  );
  const turn = activeTurn(state.items);
  const openFile = useCallback(
    (path: string) =>
      nav.navigate("Files", { path, sessionId: id, open: true }),
    [nav, id],
  );
  const renderItem = useCallback(
    ({ item }: { item: DisplayItem }) => (
      <MessageCard
        item={item}
        openFile={openFile}
        live={previewIds.has(item.id)}
      />
    ),
    [openFile, previewIds],
  );
  useEffect(() => {
    if (!options && !skillsOpen) return;
    let active = true;
    Promise.all([
      client.agents(),
      client.profiles(state.session?.working_directory),
      client.skills(id),
    ])
      .then(([a, p, s]) => {
        if (active) {
          setAgents(a);
          setProfiles(p);
          setSkills(s);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [client, id, options, skillsOpen, state.session?.working_directory]);
  const canSend = loaded && !busy && !client.signal.aborted;
  function scrollToBottom() {
    atBottom.current = true;
    setFollowing(true);
    list.current?.scrollToEnd({ animated: true });
  }
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
        <Action label="Details" secondary onPress={() => setOptions(true)} />
      </View>
      {!!(state.error || error) && (
        <View style={{ paddingHorizontal: 16 }}>
          <Notice text={error || state.error} error />
          <Action
            label="Reconnect"
            secondary
            disabled={busy}
            onPress={() => {
              setError("");
              void timeline.start();
            }}
          />
        </View>
      )}
      <FlatList
        ref={list}
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            event.nativeEvent;
          atBottom.current =
            contentSize.height - contentOffset.y - layoutMeasurement.height <
            100;
          setFollowing(atBottom.current);
        }}
        scrollEventThrottle={32}
        onContentSizeChange={() => {
          if (atBottom.current && !state.loadingOlder && !scrollTimer.current)
            scrollTimer.current = setTimeout(() => {
              scrollTimer.current = undefined;
              if (focused.current && atBottom.current)
                list.current?.scrollToEnd({ animated: false });
            }, 80);
        }}
        ListHeaderComponent={
          state.more ? (
            <Action
              label={state.loadingOlder ? "Loading…" : "Load earlier messages"}
              disabled={state.loadingOlder}
              onPress={() => {
                atBottom.current = false;
                setFollowing(false);
                void timeline.older();
              }}
            />
          ) : null
        }
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
        ListFooterComponent={
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
        }
      />
      {!following && (
        <Action label="Jump to latest" secondary onPress={scrollToBottom} />
      )}
      <View
        style={{
          padding: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          gap: 8,
          borderTopWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        {!!saved.attempt && (
          <Notice text="Delivery is unconfirmed. Retry sends the exact same message safely; discard only after checking the conversation." />
        )}
        {draft.images.length > 0 && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {draft.images.map((image, index) => (
              <View key={index}>
                <Image
                  source={{
                    uri: `data:${image.mime_type};base64,${image.data_base64}`,
                  }}
                  style={{ width: 48, height: 48, borderRadius: 8 }}
                />
                <Action
                  label="Remove"
                  secondary
                  disabled={busy || !!saved.attempt}
                  onPress={() =>
                    update({
                      images: draft.images.filter((_, i) => i !== index),
                    })
                  }
                />
              </View>
            ))}
          </View>
        )}
        {!!draft.skills.length && (
          <Text style={styles.muted}>Skills: {draft.skills.join(", ")}</Text>
        )}
        <TextInput
          accessibilityLabel="Message"
          editable={canSend && !saved.attempt}
          multiline
          value={draft.text}
          onChangeText={(text) => update({ text })}
          placeholder="Ask Zotigo…"
          placeholderTextColor={colors.muted}
          style={[styles.input, { maxHeight: 160, borderRadius: 18 }]}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 4,
          }}
        >
          <Action
            label="Photo"
            secondary
            disabled={
              !canSend ||
              !!saved.attempt ||
              draft.images.length >= maxMessageImageCount
            }
            onPress={() => void run(attach)}
          />
          <Action
            label="Skills"
            secondary
            disabled={!canSend || !!saved.attempt}
            onPress={() => setSkillsOpen(true)}
          />
          {turn && (
            <Action
              label={steer ? "Steer" : "Auto"}
              secondary
              disabled={!canSend || !!saved.attempt}
              onPress={() => setSteer(!steer)}
            />
          )}
          <View style={{ flex: 1 }} />
          {turn && (
            <Action
              label="Stop"
              danger
              disabled={busy || !state.session?.live}
              onPress={() => void run(() => client.pause(id, turn))}
            />
          )}
          <Action
            label={busy ? "Working…" : saved.attempt ? "Retry" : "Send"}
            disabled={!canSend || (!draft.text.trim() && !draft.images.length)}
            onPress={() => void run(send)}
          />
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
      <Modal
        visible={options || skillsOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!busy) {
            setOptions(false);
            setSkillsOpen(false);
          }
        }}
      >
        <Screen>
          <Action
            label="Done"
            disabled={busy}
            onPress={() => {
              setOptions(false);
              setSkillsOpen(false);
            }}
          />
          <Notice text={error} error />
          {skillsOpen ? (
            <Section title="Skills">
              {skills?.skills.map((skill) => (
                <Action
                  key={skill.name}
                  label={`${draft.skills.includes(skill.name) ? "Selected: " : ""}${skill.name} · ${skill.description}`}
                  disabled={busy || !skill.enabled || !!saved.attempt}
                  onPress={() =>
                    update({
                      skills: draft.skills.includes(skill.name)
                        ? draft.skills.filter((s) => s !== skill.name)
                        : [...draft.skills, skill.name],
                    })
                  }
                />
              ))}
            </Section>
          ) : (
            <>
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
                <TextField
                  label="Title"
                  value={title}
                  onChangeText={setTitle}
                />
                <Action
                  label="Rename"
                  disabled={busy || !title.trim()}
                  onPress={() =>
                    void run(async () => {
                      await client.renameSession(id, title.trim());
                      if (alive.current)
                        nav.setOptions({ title: title.trim() });
                    })
                  }
                />
                <Action
                  label="Pin session"
                  disabled={busy}
                  onPress={() => void run(() => client.pinSession(id, true))}
                />
                <Action
                  label="Unpin session"
                  secondary
                  disabled={busy}
                  onPress={() => void run(() => client.pinSession(id, false))}
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
                  label="Fork conversation"
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
              {state.session?.agent === "codex" ? (
                <Section title="Model and reasoning">
                  <Action
                    label="Load available models"
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        const ready = await client.prepareCodex();
                        if (alive.current)
                          setAgents((a) => ({
                            default_agent: a?.default_agent ?? "codex",
                            agents: [
                              ...(a?.agents.filter((x) => x.id !== "codex") ??
                                []),
                              ready,
                            ],
                          }));
                      })
                    }
                  />
                  {agents?.agents
                    .find((a) => a.id === "codex")
                    ?.models?.map((m) => (
                      <View key={m.id}>
                        <Text style={styles.text}>{m.display_name}</Text>
                        {m.supported_reasoning_efforts.map((e) => (
                          <Action
                            key={e}
                            label={`${state.session?.model === m.id && state.session?.reasoning_effort === e ? "Selected: " : ""}${e}`}
                            disabled={busy || !!turn}
                            onPress={() =>
                              void run(() => client.changeModel(id, m.id, e))
                            }
                          />
                        ))}
                      </View>
                    ))}
                </Section>
              ) : (
                <Section title="Profile">
                  {profiles?.profiles.map((p) => (
                    <Action
                      key={p.name}
                      label={`${p.name === state.session?.profile ? "Selected: " : ""}${p.name} · ${p.model}`}
                      disabled={busy || !!turn}
                      onPress={() =>
                        void run(() => client.changeProfile(id, p.name))
                      }
                    />
                  ))}
                </Section>
              )}
              <Section title="Permissions">
                <Action
                  label="Request approvals"
                  disabled={busy}
                  onPress={() =>
                    void run(() => client.changePolicy(id, "auto"))
                  }
                />
                <Action
                  label="Bypass approvals"
                  danger
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
                            void run(() =>
                              client.changePolicy(id, "bypass_permissions"),
                            ),
                        },
                      ],
                    )
                  }
                />
              </Section>
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
            </>
          )}
        </Screen>
      </Modal>
    </KeyboardAvoidingView>
  );
}
