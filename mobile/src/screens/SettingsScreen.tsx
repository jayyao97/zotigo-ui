import { SettingsPage } from "../components/SettingsLayout";
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
import Plus from "lucide-react-native/icons/plus";
import Star from "lucide-react-native/icons/star";
import MessageCircle from "lucide-react-native/icons/message-circle";
import Terminal from "lucide-react-native/icons/terminal";
import Monitor from "lucide-react-native/icons/monitor";
import Cpu from "lucide-react-native/icons/cpu";
import Send from "lucide-react-native/icons/send";
import Languages from "lucide-react-native/icons/languages";
import Globe from "lucide-react-native/icons/globe";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import FolderOpen from "lucide-react-native/icons/folder-open";
import Radio from "lucide-react-native/icons/radio";
import type {
  AgentCatalogResponse,
  HealthResponse,
  ProfilesResponse,
} from "@zotigo/shared/zotigod";
import { useDaemon } from "../platform/context";
import {
  Action,
  IconButton,
  ListGroup,
  ListRow,
  Loading,
  Notice,
  Section,
  errorText,
} from "../components/ui";

/**
 * Settings root: one grouped list, ordered by how often each item is used.
 * Device → Models → Conversation → General. Every row leads to one place.
 */
export function SettingsScreen({ connected = true }: { connected?: boolean }) {
  useLocale();
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  return <SettingsPage>
    <Section title={t("mobileUi.deviceGroup")}>
      <ListGroup>
        {connected ? <ConnectedDeviceRow /> : <ListRow icon={Monitor} title={t("mobile.devices")} onPress={() => nav.navigate("Devices")} />}
        {connected && <ListRow icon={FolderOpen} title={t("mobile.files")} onPress={() => nav.navigate("Files", {})} />}
        {connected && <ListRow icon={Radio} title={t("app.channels")} onPress={() => nav.navigate("Channels")} />}
        {connected && <SessionSync />}
      </ListGroup>
    </Section>
    {connected && <ModelRows />}
    <Section title={t("app.conversation")} footer={connected ? t("mobileUi.perDeviceFooter") : undefined}>
      <ListGroup>
        {connected ? <ConnectedPreferenceRows /> : <ListRow icon={MessageCircle} title={t("app.conversation")} onPress={() => nav.navigate("ConversationPreferences")} />}
      </ListGroup>
    </Section>
    <LanguageSettings />
  </SettingsPage>;
}
function ConnectedDeviceRow() {
  useLocale();
  const client = useDaemon();
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  return <ListRow icon={Monitor} title={client.connection.name} subtitle={client.connection.baseUrl} onPress={() => nav.navigate("Devices")} />;
}
function ModelRows() {
  useLocale();
  const client = useDaemon();
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  const favorites = useModelFavorites(client.connection.id);
  return <Section title={t("mobileUi.modelsGroup")}>
    <ListGroup>
      <ListRow icon={Cpu} title={t("mobileUi.modelProfiles")} onPress={() => nav.navigate("Profiles")} />
      <ListRow icon={Star} title={t("favoriteModelSettings.favoriteModels")} value={String(favorites.items.length)} onPress={() => nav.navigate("Models")} />
      <ListRow icon={Terminal} title={t("mobileUi.runtimeStatus")} onPress={() => nav.navigate("RuntimeSettings")} />
    </ListGroup>
  </Section>;
}
function ConnectedPreferenceRows() {
  useLocale();
  const client = useDaemon();
  const nav = useNavigation<NativeStackNavigationProp<Routes>>();
  const translation = useTranslationSettings(client.connection.id);
  const send = useSendMode(client.connection.id);
  return <>
    <ListRow icon={Send} title={t("settingsPage.defaultSendMode")} value={send.mode === "queue" ? t("mobile.queue") : t("mobile.steer")} onPress={() => nav.navigate("ConversationPreferences")} />
    <ListRow icon={Languages} title={t("mobile.translation")} value={translation.language === "zh-CN" ? t("settingsPage.chinese") : t("settingsPage.english")} onPress={() => nav.navigate("TranslationPreferences")} />
  </>;
}
const thinkingLabel = (mode: "expanded" | "collapsed" | "latest") =>
  ({
    expanded: t("settingsPage.alwaysExpanded"),
    collapsed: t("settingsPage.alwaysCollapsed"),
    latest: t("settingsPage.collapseOnNextThinking"),
  })[mode];

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
      <Section footer={t("settingsPage.controlsGeminiAndCustomApiSessionsCodexReasoning")}>
        <ListGroup>
          <ListRow
            title={t("settingsPage.thinkingDisplay")}
            value={thinkingLabel(thinking.mode)}
            onPress={() => setShowThinking(true)}
          />
        </ListGroup>
        <Notice text={thinking.error} error />
      </Section>
      {connected && <SendModeSettings />}
      <BottomSheet
        visible={showThinking}
        title={t("settingsPage.thinkingDisplay")}
        onClose={() => setShowThinking(false)}
      >
        {(["expanded", "collapsed", "latest"] as const).map((mode) => (
          <ChoiceRow
            key={mode}
            title={thinkingLabel(mode)}
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
      <TranslationSettings />
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
  const codexModels = agents?.agents.find((a) => a.id === "codex")?.models ?? [];
  return (
    <SettingsPage>
      {errors.map((error) => (
        <Notice key={error} text={error} error />
      ))}
      {busy && !agents && <Loading />}
      {section === "Models" && (
        <>
          <Section
            title={t("conversationComposer.favorites")}
            footer={t("mobile.shownFirstInTheModelPickerSavedLocallyForValue", {
              p0: client.connection.name,
            })}
          >
            <ListGroup>
              {favorites.items.map((f) => (
                <ListRow
                  key={favoriteKey(f)}
                  title={f.agent === "codex" ? f.model : f.profile}
                  subtitle={
                    f.agent === "codex"
                      ? `Codex · ${f.reasoningEffort}`
                      : `Zotigo · ${profiles?.profiles.find((p) => p.name === f.profile)?.model ?? t("directoryBrowser.unavailable")}`
                  }
                  accessory={
                    <IconButton
                      icon={Star}
                      label={t("favoriteModelSettings.removeFavorite", {
                        p0: f.agent === "codex" ? f.model : f.profile,
                      })}
                      disabled={!favorites.ready}
                      onPress={() => void favorites.toggle(f)}
                    />
                  }
                />
              ))}
              <ListRow
                icon={Plus}
                title={t("favoriteModelSettings.addFavorite")}
                chevron={false}
                disabled={busy || !agents || !favorites.ready}
                onPress={() => setAdding(true)}
              />
            </ListGroup>
            <Notice text={favorites.error} error />
          </Section>
          <Section title={t("mobile.modelCatalog")}>
            <ListGroup>
              <ListRow
                title={t("favoriteModelSettings.codexModels")}
                subtitle={t("mobile.loadsAutomatically")}
                onPress={() => nav.navigate("ModelCatalog")}
              />
              <ListRow
                title={t("mobileUi.modelProfiles")}
                onPress={() => nav.navigate("Profiles")}
              />
            </ListGroup>
          </Section>
        </>
      )}
      {section === "ModelCatalog" && (
        <>
          {agents?.unavailable_agents?.map((agent) => (
            <Notice
              key={agent.id}
              text={`${agent.label}: ${agent.reason ?? t("favoriteModelSettings.codexUnavailable")}`}
              error
            />
          ))}
          {!!codexModels.length && (
            <ListGroup>
              {codexModels.map((m) => (
                <ListRow
                  key={m.id}
                  title={m.display_name}
                  subtitle={m.supported_reasoning_efforts.join(" · ")}
                />
              ))}
            </ListGroup>
          )}
          <Action label={t("mobile.refresh")} disabled={busy} onPress={prepare} />
        </>
      )}
      {section === "RuntimeSettings" && (
        <>
          <Section
            title={t("mobile.connectedDevice")}
            footer={
              health
                ? t("mobile.valueProtocolValue", {
                    p0: stateLabel(health.status),
                    p1: health.protocol_version,
                  })
                : undefined
            }
          >
            <ListGroup>
              <ListRow title={client.connection.name} subtitle={client.connection.baseUrl} />
            </ListGroup>
          </Section>
          <Section title={t("mobile.agents")}>
            {!!agents?.agents.length && (
              <ListGroup>
                {agents.agents.map((agent) => (
                  <ListRow
                    key={agent.id}
                    title={agent.label}
                    subtitle={`${stateLabel(agent.availability)}${agent.version ? ` · ${agent.version}` : ""}`}
                    value={agent.id === agents.default_agent ? t("mobile.default") : undefined}
                  />
                ))}
              </ListGroup>
            )}
            {agents && agents.agents.length === 0 && (
              <Notice text={t("mobile.noAgentsAvailable")} />
            )}
          </Section>
          <Action label={t("mobile.refresh")} disabled={busy} onPress={() => void run()} />
        </>
      )}
      <BottomSheet
        visible={adding}
        title={t("favoriteModelSettings.addFavorite")}
        scroll={false}
        onClose={() => setAdding(false)}
      >
        {adding && (
          <RuntimePicker
            unavailableAgents={agents?.unavailable_agents}
            agents={agents?.agents ?? []}
            profiles={profiles}
            value={{ agent: "codex", model: "", reasoningEffort: "medium" }}
            disabled={!favorites.ready || busy}
            confirmLabel={t("favoriteModelSettings.addFavorite")}
            onConfirm={(favorite) => {
              if (!favorites.items.some((f) => favoriteKey(f) === favoriteKey(favorite)))
                void favorites.toggle(favorite);
              setAdding(false);
            }}
          />
        )}
      </BottomSheet>
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
    <ListRow
      icon={RefreshCw}
      title={busy ? t("settingsPage.syncing") : t("mobile.syncCodexSessions")}
      subtitle={error || status || t("mobileUi.syncCodexHelp")}
      disabled={busy}
      chevron={false}
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
    <Section footer={t("translationProfileSettings.useACustomApiProfileForTranslationA")}>
      <ListGroup>
        <ListRow
          title={t("settingsPage.translationLanguage")}
          value={settings.language === "zh-CN" ? t("settingsPage.chinese") : t("settingsPage.english")}
          onPress={() => setPane("language")}
        />
        <ListRow
          title={t("translationProfileSettings.translationProfile")}
          value={settings.profile || t("translationProfileSettings.useSessionProfile")}
          onPress={() => setPane("profile")}
        />
      </ListGroup>
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
    <Section>
      <ListGroup>
        <ListRow
          title={t("settingsPage.defaultSendMode")}
          subtitle={
            pref.mode === "queue"
              ? t("mobile.waitUntilTheCurrentTurnFinishes")
              : t("mobile.sendGuidanceDuringTheCurrentTurn")
          }
          value={pref.mode === "queue" ? t("mobile.queue") : t("settingsPage.steering")}
          onPress={() => setOpen(true)}
        />
      </ListGroup>
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
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return <Section title={t("settingsPage.general")}>
    <ListGroup><ListRow icon={Globe} title={t("mobileUi.appLanguage")} value={locale === "en" ? t("language.english") : t("language.chinese")} onPress={() => setOpen(true)} /></ListGroup>
    <Notice text={error} error />
    <BottomSheet visible={open} title={t("settings.language")} onClose={() => setOpen(false)}>
      {(["en", "zh-CN"] as const).map(value => <ChoiceRow key={value} title={value === "en" ? t("language.english") : t("language.chinese")} selected={locale === value} disabled={saving} onPress={() => {
        setSaving(true);
        void changeLanguage(value).then(() => setOpen(false)).catch(e => setError(errorText(e))).finally(() => setSaving(false));
      }} />)}
    </BottomSheet>
  </Section>;
}
