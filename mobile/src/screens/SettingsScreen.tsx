import { useSendMode } from "../platform/preferences";
import { RuntimePicker } from "../components/RuntimePicker";
import {
  useThinkingDisplay,
  useModelFavorites,
  useTranslationSettings,
} from "../platform/preferences";
import { BottomSheet, ChoiceRow } from "../components/BottomSheet";
import { favoriteKey } from "@zotigo/shared/modelFavorites";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Routes } from "../navigation";
import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import type { ReactNode } from "react";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Star from "lucide-react-native/icons/star";
import Monitor from "lucide-react-native/icons/monitor";
import Gauge from "lucide-react-native/icons/gauge";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Languages from "lucide-react-native/icons/languages";
import Terminal from "lucide-react-native/icons/terminal";
import { colors, styles, IconButton } from "../components/ui";
import type {
  AgentCatalogResponse,
  HealthResponse,
  ProfilesResponse,
} from "@zotigo/shared/zotigod";
import { useDaemon } from "../platform/context";
import {
  Action,
  Loading,
  Notice,
  Row,
  Section,
  errorText,
} from "../components/ui";

function SettingsPage({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <View
        style={{ width: "100%", maxWidth: 640, alignSelf: "center", gap: 20 }}
      >
        {children}
      </View>
    </ScrollView>
  );
}
function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        paddingHorizontal: 12,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}
const arrow = <ChevronRight size={18} color={colors.muted} />;
export function SettingsScreen({ connected = true }: { connected?: boolean }) {
  return (
    <SettingsPage>
      <Section title="Devices">
        <SettingsGroup>
          <DeviceSettingsRow connected={connected} />
        </SettingsGroup>
      </Section>
      <Section title="Preferences">
        <SettingsGroup>
          {connected && <ConnectedPreferenceRows />}
          {!connected && <ConversationSettingsRow />}
        </SettingsGroup>
      </Section>
      {connected && <DeviceActions />}
    </SettingsPage>
  );
}
function DeviceSettingsRow({ connected }: { connected: boolean }) {
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  return connected ? (
    <ConnectedDeviceRow />
  ) : (
    <Row
      title="Devices"
      subtitle="Add, edit and test connections"
      leading={<Monitor size={20} color={colors.muted} />}
      right={arrow}
      onPress={() => nav.navigate("Devices")}
    />
  );
}
function ConnectedDeviceRow() {
  const client = useDaemon();
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  return (
    <Row
      title={client.connection.name}
      subtitle="Current device · Manage connections"
      leading={<Monitor size={20} color={colors.muted} />}
      right={arrow}
      onPress={() => nav.navigate("Devices")}
    />
  );
}
function ConversationSettingsRow() {
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  return (
    <Row
      title="Conversation"
      leading={<MessageCircle size={20} color={colors.muted} />}
      right={arrow}
      onPress={() => nav.navigate("ConversationPreferences")}
    />
  );
}
function ConnectedPreferenceRows() {
  const client = useDaemon();
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  const favorites = useModelFavorites(client.connection.id);
  const translation = useTranslationSettings(client.connection.id);
  const send = useSendMode(client.connection.id);
  return (
    <>
      <Row
        title="Models and favorites"
        leading={<Gauge size={20} color={colors.muted} />}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.muted}>{favorites.items.length} favorites</Text>
            {arrow}
          </View>
        }
        onPress={() => nav.navigate("Models")}
      />
      <Row
        title="Conversation"
        leading={<MessageCircle size={20} color={colors.muted} />}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.muted}>
              {send.mode === "queue" ? "Queue" : "Steer"}
            </Text>
            {arrow}
          </View>
        }
        onPress={() => nav.navigate("ConversationPreferences")}
      />
      <Row
        title="Translation"
        leading={<Languages size={20} color={colors.muted} />}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.muted}>
              {translation.language === "zh-CN" ? "Chinese" : "English"}
            </Text>
            {arrow}
          </View>
        }
        onPress={() => nav.navigate("TranslationPreferences")}
      />
    </>
  );
}
function DeviceActions() {
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  return (
    <Section title="Current device">
      <SettingsGroup>
        <SessionSync />
        <Row
          title="Runtimes and connection"
          leading={<Terminal size={20} color={colors.muted} />}
          right={arrow}
          onPress={() => nav.navigate("RuntimeSettings")}
        />
      </SettingsGroup>
      <Notice text="Model favorites, translation and sending preferences are saved per device." />
    </Section>
  );
}
export function ConversationPreferencesScreen({
  connected = true,
}: {
  connected?: boolean;
}) {
  const thinking = useThinkingDisplay();
  const [showThinking, setShowThinking] = useState(false);
  return (
    <SettingsPage>
      <SettingsGroup>
        <Section title="Conversation">
          <Row
            title="Thinking display"
            subtitle={
              {
                expanded: "Always expanded",
                collapsed: "Always collapsed",
                latest: "Collapse on next Thinking",
              }[thinking.mode]
            }
            onPress={() => setShowThinking(true)}
          />
          <Notice text="Controls Gemini and custom API sessions. Codex reasoning follows Codex events." />
          <Notice text={thinking.error} error />
        </Section>
      </SettingsGroup>
      {connected && (
        <SettingsGroup>
          <SendModeSettings />
        </SettingsGroup>
      )}
      <BottomSheet
        visible={showThinking}
        title="Thinking display"
        onClose={() => setShowThinking(false)}
      >
        {(["expanded", "collapsed", "latest"] as const).map((mode) => (
          <ChoiceRow
            key={mode}
            title={
              {
                expanded: "Always expanded",
                collapsed: "Always collapsed",
                latest: "Collapse on next Thinking",
              }[mode]
            }
            selected={thinking.mode === mode}
            disabled={!thinking.ready}
            onPress={() => {
              void thinking.setMode(mode);
              setShowThinking(false);
            }}
          />
        ))}
      </BottomSheet>
    </SettingsPage>
  );
}
export function TranslationPreferencesScreen() {
  return (
    <SettingsPage>
      <SettingsGroup>
        <TranslationSettings />
      </SettingsGroup>
    </SettingsPage>
  );
}

export function ModelsScreen() {
  const client = useDaemon();
  const route = useRoute();
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  const section = route.name;
  const favorites = useModelFavorites(client.connection.id);
  const [adding, setAdding] = useState(false);
  const [health, setHealth] = useState<HealthResponse>();
  const [agents, setAgents] = useState<AgentCatalogResponse>();
  const [profiles, setProfiles] = useState<ProfilesResponse>();
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function load() {
    const results = await Promise.allSettled([
      client.health(),
      client.modelCatalog(),
      client.profiles(),
    ] as const);
    if (!alive.current) return;
    const [h, a, p] = results;
    setHealth(h.status === "fulfilled" ? h.value : undefined);
    setAgents(a.status === "fulfilled" ? a.value : undefined);
    setProfiles(p.status === "fulfilled" ? p.value : undefined);
    setErrors(
      results.flatMap((result, i) =>
        result.status === "rejected"
          ? [
              `${["Health", "Agents", "Profiles", "Skills"][i]}: ${errorText(result.reason)}`,
            ]
          : [],
      ),
    );
  }
  async function run(prepare = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (prepare) await client.modelCatalog(true);
      await load();
    } catch (e) {
      if (alive.current) setErrors([errorText(e)]);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    void run();
  }, [client]);
  function prepare() {
    void run(true);
  }
  return (
    <SettingsPage>
      <View style={{ gap: 16 }}>
        {section === "RuntimeSettings" && (
          <Section title="Connected device">
            <Row
              title={client.connection.name}
              subtitle={client.connection.baseUrl}
            />
            {health && (
              <Notice
                text={`${health.status} · Protocol ${health.protocol_version}`}
              />
            )}
            <Action
              label="Refresh"
              disabled={busy}
              onPress={() => void run()}
            />
          </Section>
        )}
        {busy && <Loading />}
        {errors.map((error) => (
          <Notice key={error} text={error} error />
        ))}
        {section === "Models" && (
          <>
            <Notice text={client.connection.name} />
            <Section title="Favorites">
              <SettingsGroup>
                <Notice
                  text={`Shown first in the model picker. Saved locally for ${client.connection.name}.`}
                />
                <Notice text={favorites.error} error />
                {!favorites.items.length && (
                  <Notice text="No favorite models yet." />
                )}
                {favorites.items.map((f) => (
                  <Row
                    key={favoriteKey(f)}
                    title={f.agent === "codex" ? f.model : f.profile}
                    subtitle={
                      f.agent === "codex"
                        ? `Codex · ${f.reasoningEffort}`
                        : `Zotigo · ${profiles?.profiles.find((p) => p.name === f.profile)?.model ?? "Unavailable"}`
                    }
                    right={
                      <IconButton
                        icon={Star}
                        label={`Remove favorite ${f.agent === "codex" ? f.model : f.profile}`}
                        disabled={!favorites.ready}
                        onPress={() => void favorites.toggle(f)}
                      />
                    }
                  />
                ))}
                <Action
                  label="Add favorite"
                  disabled={busy || !agents || !favorites.ready}
                  onPress={() => setAdding(true)}
                />
              </SettingsGroup>
            </Section>
            <Section title="Model catalog">
              <SettingsGroup>
                <Row
                  title="Codex models"
                  subtitle="Loads automatically"
                  right={arrow}
                  onPress={() => nav.navigate("ModelCatalog")}
                />
                <Row
                  title="Zotigo profiles"
                  right={arrow}
                  onPress={() => nav.navigate("Profiles")}
                />
              </SettingsGroup>
            </Section>
          </>
        )}
        {section === "ModelCatalog" && (
          <Section title="Codex models">
            <Action label="Refresh" disabled={busy} onPress={prepare} />
            <SettingsGroup>
              {agents?.agents
                .find((a) => a.id === "codex")
                ?.models?.map((m) => (
                  <Row
                    key={m.id}
                    title={m.display_name}
                    subtitle={m.supported_reasoning_efforts.join(" · ")}
                  />
                ))}
            </SettingsGroup>
          </Section>
        )}
        <BottomSheet
          visible={adding}
          title="Add favorite"
          scroll={false}
          onClose={() => setAdding(false)}
        >
          {adding && (
            <RuntimePicker
              agents={agents?.agents ?? []}
              profiles={profiles}
              value={{ agent: "codex", model: "", reasoningEffort: "medium" }}
              disabled={!favorites.ready || busy}
              confirmLabel="Add favorite"
              onConfirm={(favorite) => {
                if (
                  !favorites.items.some(
                    (f) => favoriteKey(f) === favoriteKey(favorite),
                  )
                )
                  void favorites.toggle(favorite);
                setAdding(false);
              }}
            />
          )}
        </BottomSheet>
        {section === "RuntimeSettings" && (
          <>
            <Section title="Agents">
              {agents?.agents.map((agent) => (
                <Row
                  key={agent.id}
                  title={agent.label}
                  subtitle={`${agent.availability}${agent.version ? ` · ${agent.version}` : ""}${agent.id === agents.default_agent ? " · Default" : ""}`}
                />
              ))}
              {agents && agents.agents.length === 0 && (
                <Notice text="No agents available." />
              )}
            </Section>
          </>
        )}
        {section === "Profiles" && (
          <Section title="Runtime profiles">
            {profiles?.profiles.map((profile) => (
              <Row
                key={profile.name}
                title={
                  profile.name +
                  (profile.name === profiles.default_profile
                    ? " · Default"
                    : "")
                }
                subtitle={`${profile.provider} · ${profile.model}${profile.thinking_level ? " · " + profile.thinking_level : ""}`}
              />
            ))}
            {profiles && profiles.profiles.length === 0 && (
              <Notice text="No runtime profiles configured." />
            )}
            <Notice text="Edit daemon profile definitions on its host." />
          </Section>
        )}
      </View>
    </SettingsPage>
  );
}

function SessionSync() {
  const client = useDaemon();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  return (
    <View>
      <Action
        label={busy ? "Syncing…" : "Sync Codex sessions"}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          setError("");
          setStatus("");
          void client
            .catalog(true)
            .then(() => setStatus("Sessions synced."))
            .catch((e) => setError(errorText(e)))
            .finally(() => setBusy(false));
        }}
      />
      <Notice text={status} />
      <Notice text={error} error />
    </View>
  );
}

function TranslationSettings() {
  const client = useDaemon();
  const settings = useTranslationSettings(client.connection.id);
  const [pane, setPane] = useState<"language" | "profile">();
  const [profiles, setProfiles] = useState<ProfilesResponse>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setProfiles(undefined);
    setError("");
    void client
      .profiles(undefined, "global")
      .then((value) => {
        if (active) setProfiles(value);
      })
      .catch((cause) => {
        if (active) setError(errorText(cause));
      });
    return () => {
      active = false;
    };
  }, [client, retry]);
  return (
    <Section title="Translation">
      <Row
        title="Translation language"
        subtitle={settings.language === "zh-CN" ? "Chinese" : "English"}
        onPress={() => setPane("language")}
      />
      <Row
        title="Translation profile"
        subtitle={settings.profile || "Use session profile"}
        onPress={() => setPane("profile")}
      />
      <Notice text="Use a custom API profile for translation. A fast model with thinking disabled is usually best." />
      <Notice text={settings.error} error />
      <BottomSheet
        visible={!!pane}
        title={
          pane === "language" ? "Translation language" : "Translation profile"
        }
        onClose={() => setPane(undefined)}
      >
        {pane === "language" ? (
          (["zh-CN", "en"] as const).map((language) => (
            <ChoiceRow
              key={language}
              title={language === "zh-CN" ? "Chinese" : "English"}
              selected={settings.language === language}
              disabled={!settings.ready}
              onPress={() => {
                void settings.setLanguage(language);
                setPane(undefined);
              }}
            />
          ))
        ) : (
          <>
            <ChoiceRow
              title="Use session profile"
              selected={!settings.profile}
              disabled={!settings.ready}
              onPress={() => {
                void settings.setProfile("");
                setPane(undefined);
              }}
            />
            {!profiles && !error && <Loading />}
            <Notice text={error} error />
            {!!error && (
              <Action
                label="Retry"
                onPress={() => setRetry((value) => value + 1)}
              />
            )}
            {!!settings.profile &&
              profiles &&
              !profiles.profiles.some(
                (profile) => profile.name === settings.profile,
              ) && <Notice text={`${settings.profile} (unavailable)`} />}
            {profiles?.profiles.map((profile) => (
              <ChoiceRow
                key={profile.name}
                title={profile.name}
                subtitle={profile.model}
                selected={settings.profile === profile.name}
                disabled={!settings.ready}
                onPress={() => {
                  void settings.setProfile(profile.name);
                  setPane(undefined);
                }}
              />
            ))}
          </>
        )}
      </BottomSheet>
    </Section>
  );
}

function SendModeSettings() {
  const client = useDaemon();
  const pref = useSendMode(client.connection.id);
  const [open, setOpen] = useState(false);
  return (
    <Section title="Sending">
      <Row
        title="Default send mode"
        subtitle={
          pref.mode === "queue"
            ? "Queue for next turn"
            : "Steer the current turn"
        }
        onPress={() => setOpen(true)}
      />
      <Notice text={pref.error} error />
      <BottomSheet
        visible={open}
        title="Default send mode"
        onClose={() => setOpen(false)}
      >
        {(["steering", "queue"] as const).map((mode) => (
          <ChoiceRow
            key={mode}
            title={mode === "queue" ? "Queue" : "Steering"}
            subtitle={
              mode === "queue"
                ? "Wait until the current turn finishes"
                : "Send guidance during the current turn"
            }
            selected={pref.mode === mode}
            disabled={!pref.ready}
            onPress={() => {
              void pref.setMode(mode);
              setOpen(false);
            }}
          />
        ))}
      </BottomSheet>
    </Section>
  );
}
