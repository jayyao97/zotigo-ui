import { useEffect, useRef, useState } from "react";
import { Alert, FlatList, Modal, SafeAreaView, Text, View } from "react-native";
import {
  useNavigation,
  useRoute,
  usePreventRemove,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type {
  AgentCatalogResponse,
  AgentKind,
  ApprovalPolicy,
  ProfilesResponse,
  CatalogProject,
  CatalogWorkspace,
} from "@zotigo/shared/zotigod";
import { useDaemon } from "../platform/context";
import { sessionContextReady } from "../core/newSession";
import type { Routes } from "../navigation";
import {
  Action,
  errorText,
  Loading,
  Notice,
  Screen,
  Section,
  styles,
  TextField,
} from "../components/ui";

export function NewSessionScreen() {
  const client = useDaemon(),
    nav = useNavigation<NativeStackNavigationProp<Routes>>(),
    route = useRoute<RouteProp<Routes, "NewSession">>();
  const [workspace, setWorkspace] = useState<CatalogWorkspace>();
  const [workspaceLoading, setWorkspaceLoading] = useState(
    !!route.params.workspaceId,
  );
  const [choosing, setChoosing] = useState(false);
  const [projects, setProjects] = useState<CatalogProject[]>([]);
  const [projectId, setProjectId] = useState<string>();
  const [workspaces, setWorkspaces] = useState<CatalogWorkspace[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const [profilesDirectory, setProfilesDirectory] = useState<string>();
  const [profileError, setProfileError] = useState("");
  const [title, setTitle] = useState("");
  const [catalog, setCatalog] = useState<AgentCatalogResponse>();
  const [profiles, setProfiles] = useState<ProfilesResponse>();
  const [agent, setAgent] = useState<AgentKind>("zotigo");
  const [profile, setProfile] = useState("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [policy, setPolicy] = useState<ApprovalPolicy>("auto");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false),
    mounted = useRef(true);
  usePreventRemove(busy, ({ data }) => {
    if (!lock.current) nav.dispatch(data.action);
    else
      Alert.alert("Please wait", "The session is being prepared or created.");
  });
  useEffect(() => {
    mounted.current = true;
    let active = true;
    client
      .agents()
      .then((a) => {
        if (active) {
          setCatalog(a);
          setAgent(a.default_agent);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [client]);
  useEffect(() => {
    if (!route.params.workspaceId) return;
    let active = true;
    setWorkspaceLoading(true);
    client
      .workspace(route.params.workspaceId)
      .then((value) => {
        if (!active) return;
        if (value.status !== "ready")
          throw new Error(
            "This workspace is not ready. Choose another workspace.",
          );
        setWorkspace(value);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setWorkspaceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, route.params.workspaceId]);
  useEffect(() => {
    if (!choosing) return;
    let active = true;
    setPickerLoading(true);
    setPickerError("");
    if (projectId) {
      setWorkspaces([]);
      client
        .workspaces(projectId)
        .then((values) => {
          if (active)
            setWorkspaces(values.filter((value) => value.status === "ready"));
        })
        .catch((e) => {
          if (active) setPickerError(errorText(e));
        })
        .finally(() => {
          if (active) setPickerLoading(false);
        });
    } else {
      client
        .projects()
        .then((values) => {
          if (active) setProjects(values);
        })
        .catch((e) => {
          if (active) setPickerError(errorText(e));
        })
        .finally(() => {
          if (active) setPickerLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [client, choosing, projectId]);
  // There is exactly one directory-scoped profile request owner. Old responses cannot
  // replace profiles after workspace changes, and creation waits for a matching result.
  useEffect(() => {
    let active = true;
    setProfiles(undefined);
    setProfilesDirectory(undefined);
    setProfile("");
    setProfileError("");
    if (workspace)
      void client
        .profiles(workspace.root_path)
        .then((value) => {
          if (!active) return;
          setProfiles(value);
          setProfilesDirectory(workspace.root_path);
          setProfile(value.default_profile);
        })
        .catch((e) => {
          if (active) setProfileError(errorText(e));
        });
    return () => {
      active = false;
    };
  }, [client, workspace]);
  const selected = catalog?.agents.find((a) => a.id === agent);
  useEffect(() => {
    const m =
      selected?.models?.find((m) => m.is_default) ?? selected?.models?.[0];
    setModel(m?.id ?? "");
    setEffort(m?.supported_reasoning_efforts[0] ?? "");
  }, [selected]);
  async function create() {
    if (
      lock.current ||
      !workspace ||
      !sessionContextReady(
        workspace,
        agent,
        profiles,
        profilesDirectory,
        profile,
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const session = await client.createSession({
        workspaceId: workspace.id,
        agent,
        profile: agent === "zotigo" ? profile || undefined : undefined,
        model: agent === "codex" ? model : undefined,
        reasoningEffort: agent === "codex" ? effort : undefined,
        approvalPolicy: policy,
      });
      if (!mounted.current || client.signal.aborted) return;
      // Creation is not retried after a later title failure: the session already exists.
      if (title.trim()) {
        try {
          await client.renameSession(session.id, title.trim());
        } catch (e) {
          Alert.alert(
            "Session created",
            "The title could not be saved: " + errorText(e),
          );
        }
      }
      lock.current = false;
      setBusy(false);
      if (mounted.current && !client.signal.aborted)
        nav.replace("Conversation", {
          id: session.id,
          title: title.trim() || "New conversation",
        });
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Screen>
      <Notice text={`On ${client.connection.name}`} />
      <TextField
        label="Conversation title (optional)"
        value={title}
        onChangeText={setTitle}
      />
      <Section title="Workspace">
        <Notice
          text={
            workspace
              ? `${workspace.title} · ${workspace.root_path}`
              : workspaceLoading
                ? "Loading workspace…"
                : "Select a ready workspace to create a conversation."
          }
        />
        <Action
          label={workspace ? "Change workspace" : "Choose workspace"}
          disabled={busy || workspaceLoading}
          onPress={() => {
            setProjectId(undefined);
            setChoosing(true);
          }}
        />
      </Section>
      <Modal
        visible={choosing}
        animationType="slide"
        onRequestClose={() => setChoosing(false)}
      >
        <SafeAreaView style={styles.screen}>
          {projectId ? (
            <FlatList
              data={workspaces}
              keyExtractor={(value) => value.id}
              contentContainerStyle={styles.content}
              ListHeaderComponent={
                <>
                  <Action
                    label="All projects"
                    secondary
                    onPress={() => setProjectId(undefined)}
                  />
                  <Notice text={pickerError} error />
                  {pickerLoading && <Loading />}
                </>
              }
              ListEmptyComponent={
                !pickerLoading ? (
                  <Notice text="No ready workspaces. Create one from the project page first." />
                ) : null
              }
              renderItem={({ item }) => (
                <Action
                  label={item.title}
                  onPress={() => {
                    setWorkspace(item);
                    setChoosing(false);
                  }}
                />
              )}
            />
          ) : (
            <FlatList
              data={projects}
              keyExtractor={(value) => value.id}
              contentContainerStyle={styles.content}
              ListHeaderComponent={
                <>
                  <Notice text="Choose a project" />
                  <Notice text={pickerError} error />
                  {pickerLoading && <Loading />}
                </>
              }
              ListEmptyComponent={
                !pickerLoading ? (
                  <Notice text="No projects. Create a project and workspace from Home first." />
                ) : null
              }
              renderItem={({ item }) => (
                <Action
                  label={item.name}
                  onPress={() => setProjectId(item.id)}
                />
              )}
            />
          )}
          <Action label="Cancel" secondary onPress={() => setChoosing(false)} />
        </SafeAreaView>
      </Modal>
      {!catalog && !error && <Loading />}
      <Section title="Agent">
        {catalog?.agents.map((a) => (
          <Action
            key={a.id}
            label={`${a.id === agent ? "Selected: " : ""}${a.label}`}
            disabled={busy}
            onPress={() => setAgent(a.id)}
          />
        ))}
      </Section>
      {agent === "codex" && (
        <Action
          label="Load available Codex models"
          disabled={busy}
          onPress={() => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            void client
              .prepareCodex()
              .then((ready) => {
                if (mounted.current)
                  setCatalog((c) => ({
                    default_agent: c?.default_agent ?? "codex",
                    agents: [
                      ...(c?.agents.filter((a) => a.id !== "codex") ?? []),
                      ready,
                    ],
                  }));
              })
              .catch((e) => {
                if (mounted.current) setError(errorText(e));
              })
              .finally(() => {
                lock.current = false;
                if (mounted.current) setBusy(false);
              });
          }}
        />
      )}
      {agent === "zotigo" ? (
        <Section title="Profile">
          <Notice text={profileError} error />
          {profileError && (
            <Action
              label="Reload workspace profiles"
              secondary
              disabled={busy}
              onPress={() =>
                setWorkspace((value) => (value ? { ...value } : value))
              }
            />
          )}
          {workspace && !profiles && !profileError && <Loading />}
          {profiles?.profiles.map((p) => (
            <Action
              key={p.name}
              label={`${p.name === profile ? "Selected: " : ""}${p.name} · ${p.model}`}
              onPress={() => setProfile(p.name)}
              disabled={busy}
            />
          ))}
        </Section>
      ) : (
        <Section title="Model">
          {selected?.models?.map((m) => (
            <View key={m.id}>
              <Action
                label={`${m.id === model ? "Selected: " : ""}${m.display_name}`}
                disabled={busy}
                onPress={() => {
                  setModel(m.id);
                  setEffort(m.supported_reasoning_efforts[0] ?? "");
                }}
              />
              {m.id === model &&
                m.supported_reasoning_efforts.map((e) => (
                  <Action
                    key={e}
                    label={`${e === effort ? "Selected: " : ""}${e}`}
                    secondary
                    disabled={busy}
                    onPress={() => setEffort(e)}
                  />
                ))}
            </View>
          ))}
        </Section>
      )}
      <Section title="Permissions">
        {selected?.capabilities.approvals === false && (
          <Notice text="This runtime does not support approval requests. Explicitly enable bypass approvals to create a session." />
        )}
        <Action
          label={
            policy === "auto"
              ? "Selected: request approvals"
              : "Request approvals"
          }
          disabled={busy || selected?.capabilities.approvals === false}
          onPress={() => setPolicy("auto")}
        />
        <Action
          label={
            policy === "bypass_permissions"
              ? "Selected: bypass approvals"
              : "Bypass approvals"
          }
          disabled={busy}
          danger
          onPress={() =>
            Alert.alert(
              "Bypass approvals?",
              "Tools can run without asking you for approval.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Enable",
                  style: "destructive",
                  onPress: () => setPolicy("bypass_permissions"),
                },
              ],
            )
          }
        />
      </Section>
      <Notice text={error} error />
      <Action
        label={busy ? "Creating…" : "Create conversation"}
        disabled={
          busy ||
          !catalog ||
          !sessionContextReady(
            workspace,
            agent,
            profiles,
            profilesDirectory,
            profile,
          ) ||
          selected?.availability !== "available" ||
          (agent === "codex" && !model) ||
          (selected?.capabilities.approvals === false &&
            policy !== "bypass_permissions")
        }
        onPress={() => void create()}
      />
      <Text style={styles.muted}>
        Your first message starts the session on this device.
      </Text>
    </Screen>
  );
}
