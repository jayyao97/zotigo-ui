import { stateLabel } from "@zotigo/shared/i18n/display";
import { t } from "@zotigo/shared/i18n/index";
import { useLocale, changeLanguage } from "../platform/i18n";
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
  useLocale();
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
  useLocale();
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
  useLocale();
  return (
    <SettingsPage>
      <LanguageSettings />
      <Section title={t("mobile.devices")}>
        <SettingsGroup>
          <DeviceSettingsRow connected={connected} />
        </SettingsGroup>
      </Section>
      <Section title={t("mobile.preferences")}>
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
  useLocale();
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  return connected ? (
    <ConnectedDeviceRow />
  ) : (
    <Row
      title={t("mobile.devices")}
      subtitle={t("mobile.addEditAndTestConnections")}
      leading={<Monitor size={20} color={colors.muted} />}
      right={arrow}
      onPress={() => nav.navigate("Devices")}
    />
  );
}
function ConnectedDeviceRow() {
  useLocale();
  const client = useDaemon();
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  return (
    <Row
      title={client.connection.name}
      subtitle={t("mobile.currentDeviceManageConnections")}
      leading={<Monitor size={20} color={colors.muted} />}
      right={arrow}
      onPress={() => nav.navigate("Devices")}
    />
  );
}
function ConversationSettingsRow() {
  useLocale();
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  return (
    <Row
      title={t("app.conversation")}
      leading={<MessageCircle size={20} color={colors.muted} />}
      right={arrow}
      onPress={() => nav.navigate("ConversationPreferences")}
    />
  );
}
function ConnectedPreferenceRows() {
  useLocale();
  const client = useDaemon();
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  const favorites = useModelFavorites(client.connection.id);
  const translation = useTranslationSettings(client.connection.id);
  const send = useSendMode(client.connection.id);
  return (
    <>
      <Row
        title={t("mobile.modelsAndFavorites")}
        leading={<Gauge size={20} color={colors.muted} />}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.muted}>{t("mobile.favoriteCount", { count: favorites.items.length })}</Text>
            {arrow}
          </View>
        }
        onPress={() => nav.navigate("Models")}
      />
      <Row
        title={t("app.conversation")}
        leading={<MessageCircle size={20} color={colors.muted} />}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.muted}>
              {send.mode === "queue" ? t("mobile.queue") : t("mobile.steer")}
            </Text>
            {arrow}
          </View>
        }
        onPress={() => nav.navigate("ConversationPreferences")}
      />
      <Row
        title={t("mobile.translation")}
        leading={<Languages size={20} color={colors.muted} />}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.muted}>
              {translation.language === "zh-CN" ? t("settingsPage.chinese") : t("settingsPage.english")}
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
  useLocale();
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  return (
    <Section title={t("mobile.currentDevice")}>
      <SettingsGroup>
        <SessionSync />
        <Row
          title={t("mobile.runtimesAndConnection")}
          leading={<Terminal size={20} color={colors.muted} />}
          right={arrow}
          onPress={() => nav.navigate("RuntimeSettings")}
        />
      </SettingsGroup>
      <Notice text={t("mobile.modelFavoritesTranslationAndSendingPreferencesAreSavedPerDevice")} />
    </Section>
  );
}
export function ConversationPreferencesScreen({
  connected = true,
}: {
  connected?: boolean;
}) {
  useLocale();
  const thinking = useThinkingDisplay();
  const [showThinking, setShowThinking] = useState(false);
  return (
    <SettingsPage>
      <SettingsGroup>
        <Section title={t("app.conversation")}>
          <Row
            title={t("settingsPage.thinkingDisplay")}
            subtitle={
              {
                expanded: t("settingsPage.alwaysExpanded"),
                collapsed: t("settingsPage.alwaysCollapsed"),
                latest: t("settingsPage.collapseOnNextThinking"),
              }[thinking.mode]
            }
            onPress={() => setShowThinking(true)}
          />
          <Notice text={t("settingsPage.controlsGeminiAndCustomApiSessionsCodexReasoning")} />
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
        title={t("settingsPage.thinkingDisplay")}
        onClose={() => setShowThinking(false)}
      >
        {(["expanded", "collapsed", "latest"] as const).map((mode) => (
          <ChoiceRow
            key={mode}
            title={
              {
                expanded: t("settingsPage.alwaysExpanded"),
                collapsed: t("settingsPage.alwaysCollapsed"),
                latest: t("settingsPage.collapseOnNextThinking"),
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
  useLocale();
  return (
    <SettingsPage>
      <SettingsGroup>
        <TranslationSettings />
      </SettingsGroup>
    </SettingsPage>
  );
}

export function ModelsScreen() {
  useLocale();
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
          <Section title={t("mobile.connectedDevice")}>
            <Row
              title={client.connection.name}
              subtitle={client.connection.baseUrl}
            />
            {health && (
              <Notice
                text={t("mobile.valueProtocolValue", {p0: stateLabel(health.status), p1: health.protocol_version})}
              />
            )}
            <Action
              label={t("mobile.refresh")}
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
            <Section title={t("conversationComposer.favorites")}>
              <SettingsGroup>
                <Notice
                  text={t("mobile.shownFirstInTheModelPickerSavedLocallyForValue", {p0: client.connection.name})}
                />
                <Notice text={favorites.error} error />
                {!favorites.items.length && (
                  <Notice text={t("favoriteModelSettings.noFavoriteModelsYet")} />
                )}
                {favorites.items.map((f) => (
                  <Row
                    key={favoriteKey(f)}
                    title={f.agent === "codex" ? f.model : f.profile}
                    subtitle={
                      f.agent === "codex"
                        ? `Codex · ${f.reasoningEffort}`
                        : `Zotigo · ${profiles?.profiles.find((p) => p.name === f.profile)?.model ?? t("directoryBrowser.unavailable")}`
                    }
                    right={
                      <IconButton
                        icon={Star}
                        label={t("favoriteModelSettings.removeFavorite", {p0: f.agent === "codex" ? f.model : f.profile})}
                        disabled={!favorites.ready}
                        onPress={() => void favorites.toggle(f)}
                      />
                    }
                  />
                ))}
                <Action
                  label={t("favoriteModelSettings.addFavorite")}
                  disabled={busy || !agents || !favorites.ready}
                  onPress={() => setAdding(true)}
                />
              </SettingsGroup>
            </Section>
            <Section title={t("mobile.modelCatalog")}>
              <SettingsGroup>
                <Row
                  title={t("favoriteModelSettings.codexModels")}
                  subtitle={t("mobile.loadsAutomatically")}
                  right={arrow}
                  onPress={() => nav.navigate("ModelCatalog")}
                />
                <Row
                  title={t("mobile.zotigoProfiles")}
                  right={arrow}
                  onPress={() => nav.navigate("Profiles")}
                />
              </SettingsGroup>
            </Section>
          </>
        )}
        {section === "ModelCatalog" && (
          <Section title={t("favoriteModelSettings.codexModels")}>
            <Action label={t("mobile.refresh")} disabled={busy} onPress={prepare} />
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
          title={t("favoriteModelSettings.addFavorite")}
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
            <Section title={t("mobile.agents")}>
              {agents?.agents.map((agent) => (
                <Row
                  key={agent.id}
                  title={agent.label}
                  subtitle={`${stateLabel(agent.availability)}${agent.version ? ` · ${agent.version}` : ""}${agent.id === agents.default_agent ? " · " + t("mobile.default") : ""}`}
                />
              ))}
              {agents && agents.agents.length === 0 && (
                <Notice text={t("mobile.noAgentsAvailable")} />
              )}
            </Section>
          </>
        )}
        {section === "Profiles" && (
          <Section title={t("mobile.runtimeProfiles")}>
            {profiles?.profiles.map((profile) => (
              <Row
                key={profile.name}
                title={
                  profile.name +
                  (profile.name === profiles.default_profile
                    ? " · " + t("mobile.default")
                    : "")
                }
                subtitle={`${profile.provider} · ${profile.model}${profile.thinking_level ? " · " + stateLabel(profile.thinking_level) : ""}`}
              />
            ))}
            {profiles && profiles.profiles.length === 0 && (
              <Notice text={t("mobile.noRuntimeProfilesConfigured")} />
            )}
            <Notice text={t("mobile.editDaemonProfileDefinitionsOnItsHost")} />
          </Section>
        )}
      </View>
    </SettingsPage>
  );
}

function SessionSync() {
  useLocale();
  const client = useDaemon();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  return (
    <View>
      <Action
        label={busy ? t("settingsPage.syncing") : t("mobile.syncCodexSessions")}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          setError("");
          setStatus("");
          void client
            .catalog(true)
            .then(() => setStatus(t("hostShell.sessionsSynced")))
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
  useLocale();
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
    <Section title={t("mobile.translation")}>
      <Row
        title={t("settingsPage.translationLanguage")}
        subtitle={settings.language === "zh-CN" ? t("settingsPage.chinese") : t("settingsPage.english")}
        onPress={() => setPane("language")}
      />
      <Row
        title={t("translationProfileSettings.translationProfile")}
        subtitle={settings.profile || t("translationProfileSettings.useSessionProfile")}
        onPress={() => setPane("profile")}
      />
      <Notice text={t("translationProfileSettings.useACustomApiProfileForTranslationA")} />
      <Notice text={settings.error} error />
      <BottomSheet
        visible={!!pane}
        title={
          pane === "language" ? t("settingsPage.translationLanguage") : t("translationProfileSettings.translationProfile")
        }
        onClose={() => setPane(undefined)}
      >
        {pane === "language" ? (
          (["zh-CN", "en"] as const).map((language) => (
            <ChoiceRow
              key={language}
              title={language === "zh-CN" ? t("settingsPage.chinese") : t("settingsPage.english")}
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
              title={t("translationProfileSettings.useSessionProfile")}
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
                label={t("app.retry2")}
                onPress={() => setRetry((value) => value + 1)}
              />
            )}
            {!!settings.profile &&
              profiles &&
              !profiles.profiles.some(
                (profile) => profile.name === settings.profile,
              ) && <Notice text={t("mobile.valueUnavailable", {p0: settings.profile})} />}
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
  useLocale();
  const client = useDaemon();
  const pref = useSendMode(client.connection.id);
  const [open, setOpen] = useState(false);
  return (
    <Section title={t("mobile.sending")}>
      <Row
        title={t("settingsPage.defaultSendMode")}
        subtitle={
          pref.mode === "queue"
            ? t("app.queueForNextTurn")
            : t("mobile.steerTheCurrentTurn")
        }
        onPress={() => setOpen(true)}
      />
      <Notice text={pref.error} error />
      <BottomSheet
        visible={open}
        title={t("settingsPage.defaultSendMode")}
        onClose={() => setOpen(false)}
      >
        {(["steering", "queue"] as const).map((mode) => (
          <ChoiceRow
            key={mode}
            title={mode === "queue" ? t("mobile.queue") : t("settingsPage.steering")}
            subtitle={
              mode === "queue"
                ? t("mobile.waitUntilTheCurrentTurnFinishes")
                : t("mobile.sendGuidanceDuringTheCurrentTurn")
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

function LanguageSettings() {
  useLocale();
  const locale = useLocale();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return <Section title={t("settings.language")}>
    <SettingsGroup>
      {(["en", "zh-CN"] as const).map(value => <ChoiceRow
        key={value} title={value === "en" ? t("settingsPage.english") : "简体中文"}
        selected={locale === value} disabled={saving}
        onPress={() => {
          setSaving(true);
          void changeLanguage(value).catch(e => setError(errorText(e))).finally(() => setSaving(false));
        }}
      />)}
    </SettingsGroup>
    <Notice text={error} error />
  </Section>;
}
