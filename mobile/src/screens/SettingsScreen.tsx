import { useEffect, useRef, useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import type {
  AgentCatalogResponse,
  HealthResponse,
  ProfilesResponse,
  SkillsResponse,
} from "@zotigo/shared/zotigod";
import { useDaemon } from "../platform/context";
import {
  Action,
  Loading,
  Notice,
  Row,
  Section,
  errorText,
  styles,
} from "../components/ui";

export function SettingsScreen() {
  const client = useDaemon();
  const [health, setHealth] = useState<HealthResponse>();
  const [agents, setAgents] = useState<AgentCatalogResponse>();
  const [profiles, setProfiles] = useState<ProfilesResponse>();
  const [skills, setSkills] = useState<SkillsResponse>();
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
      client.agents(),
      client.profiles(),
      client.skills(),
    ] as const);
    if (!alive.current) return;
    const [h, a, p, s] = results;
    setHealth(h.status === "fulfilled" ? h.value : undefined);
    setAgents(a.status === "fulfilled" ? a.value : undefined);
    setProfiles(p.status === "fulfilled" ? p.value : undefined);
    setSkills(s.status === "fulfilled" ? s.value : undefined);
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
      if (prepare) await client.prepareCodex();
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
    Alert.alert(
      "Prepare Codex on this daemon?",
      `This may download or update the Codex runtime on ${client.connection.name}.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Prepare", onPress: () => void run(true) },
      ],
    );
  }
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={skills?.skills ?? []}
      keyExtractor={(skill, i) => `${skill.scope}:${skill.name}:${i}`}
      initialNumToRender={15}
      windowSize={5}
      ListHeaderComponent={
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
            <Action
              label="Refresh"
              disabled={busy}
              onPress={() => void run()}
            />
          </Section>
          {busy && <Loading />}
          {errors.map((error) => (
            <Notice key={error} text={error} error />
          ))}
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
            <Action
              label="Prepare Codex"
              disabled={busy || !agents}
              onPress={prepare}
            />
          </Section>
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
            <Notice text="Choose a profile or model when creating or configuring a session. Edit daemon profile definitions on its host." />
          </Section>
          <Text style={styles.muted}>Available skills</Text>
          {skills?.diagnostics.map((diagnostic, i) => (
            <Notice
              key={i}
              text={`${diagnostic.name ?? diagnostic.scope ?? diagnostic.code}: ${diagnostic.message}`}
              error
            />
          ))}
        </View>
      }
      renderItem={({ item }) => (
        <Row
          title={item.name}
          subtitle={`${item.enabled ? item.scope : "Disabled"} · ${item.description}`}
        />
      )}
      ListEmptyComponent={
        skills ? <Notice text="No skills available." /> : null
      }
    />
  );
}
