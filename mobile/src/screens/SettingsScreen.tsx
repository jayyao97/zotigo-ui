import { ModelPicker } from "../components/ModelPicker";
import { ProfilePicker } from "../components/ProfilePicker";
import {
  useThinkingDisplay,
  useModelFavorites,
  useTranslationSettings,
} from "../platform/preferences";
import { BottomSheet, ChoiceRow } from "../components/BottomSheet";
import { favoriteKey } from "@zotigo/shared/modelFavorites";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Routes } from "../navigation";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
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
  Screen,
} from "../components/ui";

export function SettingsScreen({ connected = true }: { connected?: boolean }) {
  const navigation = useNavigation<NativeStackNavigationProp<Routes>>();
  const thinking = useThinkingDisplay();
  const [showThinking, setShowThinking] = useState(false);
  const devices = (
    <Row
      title="Devices"
      subtitle="Add, edit and test connections"
      onPress={() => navigation.navigate("Devices")}
    />
  );
  return (
    <Screen>
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
      {connected && <TranslationSettings />}
      {devices}
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
      {connected && <SessionSync />}
      {connected && (
        <Row
          title="Models and runtimes"
          subtitle="Runtime status, profiles and Codex models"
          onPress={() => navigation.navigate("Models")}
        />
      )}
    </Screen>
  );
}

export function ModelsScreen() {
  const client = useDaemon();
  const favorites = useModelFavorites(client.connection.id);
  const [adding, setAdding] = useState(false);
  const [runtime, setRuntime] = useState<"codex" | "zotigo">("codex");
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
    <Screen>
      <View style={{ gap: 16 }}>
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
          <Action label="Refresh" disabled={busy} onPress={() => void run()} />
        </Section>
        {busy && <Loading />}
        {errors.map((error) => (
          <Notice key={error} text={error} error />
        ))}
        <Section title="Favorite models">
          <Notice
            text={`Shown first in the model picker. Saved locally for ${client.connection.name}.`}
          />
          <Notice text={favorites.error} error />
          {!favorites.items.length && <Notice text="No favorite models yet." />}
          {favorites.items.map((f) => (
            <Action
              key={favoriteKey(f)}
              secondary
              label={`Remove ${f.agent === "codex" ? f.model + " · " + f.reasoningEffort : f.profile}`}
              onPress={() => void favorites.toggle(f)}
            />
          ))}
          <Action
            label="Add favorite"
            disabled={busy || !agents || !favorites.ready}
            onPress={() => setAdding(true)}
          />
          <Action label="Refresh models" disabled={busy} onPress={prepare} />
          <Notice text="Reload models from Codex on this device. Does not install or update Codex." />
        </Section>
        <BottomSheet
          visible={adding}
          title="Add favorite"
          onClose={() => setAdding(false)}
        >
          <ChoiceRow
            title="Codex"
            selected={runtime === "codex"}
            onPress={() => setRuntime("codex")}
          />
          <ChoiceRow
            title="Zotigo"
            selected={runtime === "zotigo"}
            onPress={() => setRuntime("zotigo")}
          />
          {runtime === "codex" ? (
            <ModelPicker
              models={
                agents?.agents.find((a) => a.id === "codex")?.models ?? []
              }
              model=""
              effort="medium"
              disabled={!favorites.ready || busy}
              confirmLabel="Add favorite"
              onConfirm={(model, reasoningEffort) => {
                const favorite = {
                  agent: "codex" as const,
                  model,
                  reasoningEffort,
                };
                if (
                  !favorites.items.some(
                    (f) => favoriteKey(f) === favoriteKey(favorite),
                  )
                )
                  void favorites.toggle(favorite);
                setAdding(false);
              }}
            />
          ) : (
            <ProfilePicker
              profiles={profiles?.profiles ?? []}
              disabled={!favorites.ready || busy}
              onSelect={(profile) => {
                const favorite = { agent: "zotigo" as const, profile };
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
        <Section title="Runtime profiles">
          {profiles?.profiles.map((profile) => (
            <Row
              key={profile.name}
              title={
                profile.name +
                (profile.name === profiles.default_profile ? " · Default" : "")
              }
              subtitle={`${profile.provider} · ${profile.model}${profile.thinking_level ? " · " + profile.thinking_level : ""}`}
            />
          ))}
          {profiles && profiles.profiles.length === 0 && (
            <Notice text="No runtime profiles configured." />
          )}
          <Notice text="Choose a profile or model when creating or configuring a session. Edit daemon profile definitions on its host." />
        </Section>
      </View>
    </Screen>
  );
}

function SessionSync() {
  const client = useDaemon();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  return (
    <Section title="Sessions">
      <Notice
        text={`Import the latest Codex sessions from ${client.connection.name}.`}
      />
      <Action
        label={busy ? "Syncing…" : "Sync sessions"}
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
    </Section>
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
