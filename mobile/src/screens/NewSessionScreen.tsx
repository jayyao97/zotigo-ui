import { DraftImages } from "../components/DraftImages";
import { SkillInput } from "../components/SkillInput";
import Plus from "lucide-react-native/icons/plus";
import { AttachmentFiles } from "../components/AttachmentFiles";
import { pickAttachments } from "../platform/pickAttachments";
import type { DraftFile } from "../core/attachments";
import type { MessageImageInput } from "@zotigo/shared/zotigod";
import Gauge from "lucide-react-native/icons/gauge";
import { ComposerSkills } from "../components/ComposerSkills";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Shield from "lucide-react-native/icons/shield";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { randomUUID } from "expo-crypto";
import {
  ComposerStore,
  emptyDraft,
  submissionAttempt,
  prepareAttachments,
} from "../core/composer";
import { storage } from "../platform/storage";
import { ProfilePicker } from "../components/ProfilePicker";
import {
  approvalPolicyLabel,
  approvalPolicyDescription,
} from "@zotigo/shared/approvalPolicy";
import { compatibleReasoningEffort } from "@zotigo/shared/modelSelection";
import { useEffect, useRef, useState } from "react";
import Folder from "lucide-react-native/icons/folder";
import { Alert, FlatList, Text, View } from "react-native";
import { BottomSheet, ChoiceRow } from "../components/BottomSheet";
import { ModelPicker } from "../components/ModelPicker";
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
  colors,
  IconButton,
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
  const [panel, setPanel] = useState<
    "workspace" | "agent" | "model" | "policy" | null
  >(null);
  const choosing = panel === "workspace";
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<CatalogProject[]>([]);
  const [projectId, setProjectId] = useState<string>();
  const [workspaces, setWorkspaces] = useState<CatalogWorkspace[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const [profilesDirectory, setProfilesDirectory] = useState<string>();
  const [profileError, setProfileError] = useState("");
  const [caret, setCaret] = useState(0);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [images, setImages] = useState<MessageImageInput[]>([]);
  const [skillNames, setSkillNames] = useState<string[]>([]);
  const insets = useSafeAreaInsets();
  const header = useHeaderHeight();
  const [catalog, setCatalog] = useState<AgentCatalogResponse>();
  const [profiles, setProfiles] = useState<ProfilesResponse>();
  const [agent, setAgent] = useState<AgentKind>("zotigo");
  const [profile, setProfile] = useState("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [policy, setPolicy] = useState<ApprovalPolicy>("auto");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const createdSession = useRef<string | undefined>(undefined);
  const completed = useRef(false);
  const lock = useRef(false),
    mounted = useRef(true);
  usePreventRemove(
    busy || !!message.trim() || !!files.length || !!images.length,
    ({ data }) => {
      if (completed.current) nav.dispatch(data.action);
      else if (!lock.current)
        Alert.alert(
          "Discard message?",
          "Your unsent message will be discarded.",
          [
            { text: "Keep editing", style: "cancel" },
            {
              text: "Discard",
              style: "destructive",
              onPress: () => nav.dispatch(data.action),
            },
          ],
        );
      else
        Alert.alert("Please wait", "The session is being prepared or created.");
    },
  );
  useEffect(() => {
    mounted.current = true;
    let active = true;
    client
      .modelCatalog()
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
      selected?.models?.find((m) => m.id === model) ??
      selected?.models?.find((m) => m.is_default) ??
      selected?.models?.[0];
    setModel(m?.id ?? "");
    setEffort((current) =>
      compatibleReasoningEffort(m?.supported_reasoning_efforts ?? [], current),
    );
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
      const session = createdSession.current
        ? { id: createdSession.current }
        : await client.createSession({
            workspaceId: workspace.id,
            agent,
            profile: agent === "zotigo" ? profile || undefined : undefined,
            model: agent === "codex" ? model : undefined,
            reasoningEffort: agent === "codex" ? effort : undefined,
            approvalPolicy: policy,
          });
      createdSession.current = session.id;
      if (!mounted.current || client.signal.aborted) return;
      const composer = new ComposerStore(
        storage,
        client.connection.id,
        session.id,
      );
      let draft = {
        ...emptyDraft(),
        text: message,
        skills: skillNames,
        files,
        images,
      };
      const pending = { current: { draft } };
      await prepareAttachments(
        client,
        session.id,
        pending,
        composer,
        (state) => {
          if (mounted.current) setFiles(state.draft.files ?? []);
        },
      );
      draft = {
        ...pending.current.draft,
        files: pending.current.draft.files ?? [],
      };
      const attempt = submissionAttempt({ draft }, randomUUID(), false);
      await composer.write({ draft, attempt });
      try {
        await client.send(
          session.id,
          {
            text: attempt.text,
            skills: attempt.skills,
            images: attempt.images,
            client_message_id: attempt.client_message_id,
          },
          false,
        );
        await composer.write({ draft: emptyDraft() });
      } catch (e) {
        Alert.alert(
          "Session created",
          "Your message needs attention. Open the conversation to retry with the same request ID. " +
            errorText(e),
        );
      }
      completed.current = true;
      lock.current = false;
      setBusy(false);
      if (mounted.current && !client.signal.aborted)
        nav.replace("Conversation", {
          id: session.id,
          title: "New session",
        });
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={header}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 8,
        }}
      >
        <Text style={styles.title}>What are we working on?</Text>
        <Text style={styles.muted}>{client.connection.name}</Text>
      </View>
      <View
        style={{
          padding: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          gap: 8,
        }}
      >
        <Notice text={error || profileError} error />
        <AttachmentFiles
          files={files}
          disabled={busy}
          onRemove={(index) => setFiles(files.filter((_, i) => i !== index))}
        />
        {!!images.length && (
          <DraftImages
            images={images}
            disabled={busy}
            onRemove={(index) =>
              setImages(images.filter((_, i) => i !== index))
            }
          />
        )}
        <ComposerSkills
          text={message}
          caret={caret}
          selected={skillNames}
          disabled={busy}
          onChange={(text, skills) => {
            setCaret(caret + text.length - message.length);
            setMessage(text);
            setSkillNames(skills);
          }}
        />
        <ChoiceRow
          icon={Folder}
          title={workspace?.title ?? "Choose workspace"}
          subtitle={workspace?.root_path ?? "Project → workspace"}
          disabled={busy || workspaceLoading}
          onPress={() => {
            setProjectId(undefined);
            setSearch("");
            setPanel("workspace");
          }}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => setPanel("agent")}
          disabled={busy || !catalog}
          style={{
            minHeight: 44,
            justifyContent: "center",
            paddingHorizontal: 12,
          }}
        >
          <Text style={styles.muted}>
            {selected?.label ?? "Loading models…"} · Runtime
          </Text>
        </Pressable>
        {!catalog && error && (
          <Action
            label="Retry loading models"
            onPress={() => {
              setError("");
              void client
                .modelCatalog()
                .then((a) => {
                  setCatalog(a);
                  setAgent(a.default_agent);
                })
                .catch((e) => setError(errorText(e)));
            }}
          />
        )}
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 24,
            padding: 8,
          }}
        >
          <SkillInput
            value={message}
            skills={skillNames}
            editable={!busy}
            caret={caret}
            onCaret={setCaret}
            onChange={setMessage}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <IconButton
              icon={Plus}
              label="Add attachment"
              disabled={busy || files.length + images.length >= 5}
              onPress={() => {
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                void pickAttachments(images, files)
                  .then((result) => {
                    if (result && mounted.current) {
                      setFiles(result.files);
                      setImages(result.images);
                    }
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
            <IconButton
              icon={Shield}
              label={approvalPolicyLabel(policy)}
              disabled={busy}
              onPress={() => setPanel("policy")}
            />
            <View style={{ flex: 1 }} />
            <IconButton
              icon={Gauge}
              label="Model and reasoning"
              disabled={busy || (agent === "zotigo" && !workspace)}
              onPress={() => setPanel("model")}
            />
            <IconButton
              icon={ArrowUp}
              label={busy ? "Creating…" : "Create session and send"}
              disabled={
                busy ||
                (!message.trim() && !files.length && !images.length) ||
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
          </View>
        </View>
      </View>
      <BottomSheet
        visible={panel !== null}
        scroll={panel !== "workspace"}
        disabled={busy}
        title={
          panel === "workspace"
            ? projectId
              ? (projects.find((p) => p.id === projectId)?.name ?? "Workspaces")
              : "Projects"
            : panel === "agent"
              ? "Runtime"
              : panel === "policy"
                ? "Permissions"
                : agent === "codex"
                  ? "Model and reasoning"
                  : "Profile"
        }
        onClose={() => setPanel(null)}
      >
        <Notice text={error} error />
        {panel === "workspace" && (
          <>
            {projectId && (
              <Action
                label="All projects"
                secondary
                onPress={() => {
                  setProjectId(undefined);
                  setSearch("");
                }}
              />
            )}
            <TextField
              label={projectId ? "Search workspaces" : "Search projects"}
              value={search}
              onChangeText={setSearch}
            />
            <Notice text={pickerError} error />
            {pickerLoading ? (
              <Loading />
            ) : (
              <FlatList
                style={{ flexGrow: 0 }}
                keyboardShouldPersistTaps="handled"
                data={(projectId
                  ? workspaces.map((w) => ({
                      id: w.id,
                      title: w.title,
                      subtitle: w.root_path,
                    }))
                  : projects.map((p) => ({
                      id: p.id,
                      title: p.name,
                      subtitle: "",
                    }))
                ).filter((row) =>
                  row.title.toLowerCase().includes(search.toLowerCase()),
                )}
                keyExtractor={(row) => row.id}
                ListEmptyComponent={
                  <Notice
                    text={
                      search
                        ? "No matches."
                        : projectId
                          ? "No ready workspaces in this project."
                          : "No projects. Create a project and workspace from Home first."
                    }
                  />
                }
                renderItem={({ item }) => (
                  <ChoiceRow
                    icon={Folder}
                    title={item.title}
                    subtitle={item.subtitle}
                    selected={projectId ? workspace?.id === item.id : undefined}
                    onPress={() => {
                      if (projectId) {
                        setWorkspace(workspaces.find((w) => w.id === item.id));
                        setPanel(null);
                      } else {
                        setProjectId(item.id);
                        setSearch("");
                      }
                    }}
                  />
                )}
              />
            )}
          </>
        )}
        {panel === "agent" &&
          catalog?.agents.map((a) => (
            <ChoiceRow
              key={a.id}
              title={a.label}
              subtitle={a.availability}
              selected={a.id === agent}
              onPress={() => {
                setAgent(a.id);
                setPanel(null);
              }}
            />
          ))}
        {panel === "model" && (
          <>
            <Notice
              text={`Current: ${agent === "codex" ? [model || "Loading…", effort].filter(Boolean).join(" · ") : profile || "Choose profile"}`}
            />
            {agent === "codex" ? (
              <ModelPicker
                models={selected?.models ?? []}
                model={model}
                effort={effort}
                disabled={busy}
                onConfirm={(m, e) => {
                  setModel(m);
                  setEffort(e);
                  setPanel(null);
                }}
              />
            ) : (
              <>
                <Notice text={profileError} error />
                {profileError && (
                  <Action
                    label="Reload workspace profiles"
                    disabled={busy}
                    onPress={() => setWorkspace((w) => (w ? { ...w } : w))}
                  />
                )}
                {workspace && !profiles && !profileError && <Loading />}
                {profiles && (
                  <ProfilePicker
                    profiles={profiles.profiles}
                    selected={profile}
                    disabled={busy}
                    onSelect={(name) => {
                      setProfile(name);
                      setPanel(null);
                    }}
                  />
                )}
              </>
            )}
          </>
        )}
        {panel === "policy" && (
          <>
            <Section title="Permissions">
              {selected?.capabilities.approvals === false && (
                <Notice text="This runtime does not support approval requests. Explicitly enable bypass approvals to create a session." />
              )}
              <ChoiceRow
                title={approvalPolicyLabel("auto")}
                subtitle={approvalPolicyDescription("auto")}
                selected={policy === "auto"}
                disabled={busy || selected?.capabilities.approvals === false}
                onPress={() => {
                  setPolicy("auto");
                  setPanel(null);
                }}
              />
              <ChoiceRow
                title={approvalPolicyLabel("bypass_permissions")}
                subtitle={approvalPolicyDescription("bypass_permissions")}
                selected={policy === "bypass_permissions"}
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    "Bypass approvals?",
                    "Tools can run without asking you for approval.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Enable",
                        style: "destructive",
                        onPress: () => {
                          setPolicy("bypass_permissions");
                          setPanel(null);
                        },
                      },
                    ],
                  )
                }
              />
            </Section>
          </>
        )}
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}
