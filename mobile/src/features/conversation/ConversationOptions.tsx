import { t } from "@zotigo/shared/i18n/index";
import type {
  AgentCatalogResponse,
  ProfilesResponse,
  ZotigoSession,
} from "@zotigo/shared/zotigod";
import { randomUUID } from "expo-crypto";
import { useEffect, useState, type RefObject } from "react";
import { Text, View } from "react-native";
import { BottomSheet } from "../../components/BottomSheet";
import { CompletionNotifications } from "../../components/CompletionNotifications";
import { PolicyChoices } from "../../components/ComposerFrame";
import { ConversationActions } from "../../components/ConversationActions";
import { RuntimePicker } from "../../components/RuntimePicker";
import { Action, Loading, Notice, errorText, space, styles } from "../../components/ui";
import type { DaemonClient } from "../../core/client";

export type OptionPane = "session" | "model" | "policy" | "context" | "notifications";

/**
 * The conversation's one sheet for rare actions: conversation actions, model,
 * access, context usage and notifications. It loads what a pane needs when
 * that pane opens; every mutation goes through the screen's single-flight `run`.
 */
export function ConversationOptions({
  client,
  id,
  session,
  pane,
  onPane,
  onClose,
  anchorRef,
  busy,
  running,
  error,
  onError,
  run,
  alive,
  title,
  savedTitle,
  onTitle,
  onRenamed,
  onReadState,
  onOpenFiles,
  onOpenProfiles,
  onForked,
  onArchived,
}: {
  client: DaemonClient;
  id: string;
  session: ZotigoSession | null;
  /** Undefined while the sheet is closed. */
  pane: OptionPane | undefined;
  onPane: (pane: OptionPane) => void;
  onClose: () => void;
  anchorRef: RefObject<View | null>;
  busy: boolean;
  /** A turn is running: model changes and forks wait for it. */
  running: boolean;
  error: string;
  onError: (message: string) => void;
  run: (action: () => Promise<unknown>, onSuccess?: () => void) => Promise<void>;
  alive: RefObject<boolean>;
  title: string;
  savedTitle: string;
  onTitle: (title: string) => void;
  onRenamed: (title: string) => void;
  onReadState: (version: number | null) => Promise<unknown>;
  onOpenFiles: () => void;
  onOpenProfiles: () => void;
  onForked: (session: { id: string }) => void;
  onArchived: () => void;
}) {
  const visible = pane !== undefined;
  // Keep the last pane rendered while the sheet animates out.
  const [shown, setShown] = useState<OptionPane>("session");
  useEffect(() => {
    if (pane) setShown(pane);
  }, [pane]);
  const current = pane ?? shown;
  const [pinned, setPinned] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<AgentCatalogResponse>();
  const [profiles, setProfiles] = useState<ProfilesResponse>();
  const [modelRevision, setModelRevision] = useState(0);
  useEffect(() => {
    if (!pane) return;
    let active = true;
    if (pane === "session") setPinned(null);
    const request =
      pane === "model"
        ? session?.agent === "codex"
          ? client.modelCatalog().then((value) => {
              if (active) setAgents(value);
            })
          : client.profiles(session?.working_directory).then((value) => {
              if (active) setProfiles(value);
            })
        : pane === "session"
          ? client.catalog().then((items) => {
              if (active)
                setPinned(
                  !!items.find(
                    (item) => item.organization?.session_id === id || item.runtime?.id === id,
                  )?.organization?.pinned_at,
                );
            })
          : undefined;
    void request?.catch((e) => {
      if (active) onError(errorText(e));
    });
    return () => {
      active = false;
    };
  }, [client, id, modelRevision, pane, session?.agent, session?.working_directory]);
  const usage = session?.context_usage;
  const modelValue = [
    session?.model || session?.profile || t("directoryBrowser.unavailable"),
    session?.reasoning_effort,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <BottomSheet
      anchorRef={anchorRef}
      visible={visible}
      scroll={current !== "model"}
      disabled={busy}
      title={
        current === "notifications"
          ? t("completionTriggers.title")
          : current === "model"
            ? t("mobile.modelAndReasoning")
            : current === "policy"
              ? t("channelsPage.permissions")
              : current === "context"
                ? t("mobile.contextUsage")
                : t("mobileUi.conversationActions")
      }
      onClose={onClose}
    >
      <Notice text={error} error />
      {visible && current === "notifications" && <CompletionNotifications sessionId={id} />}
      {current === "model" && <Notice text={t("mobile.currentValue", { p0: modelValue })} />}
      {current === "context" && usage && (
        <View style={{ gap: space.sm }}>
          <Text style={styles.title}>
            {Math.round((usage.tokens / usage.window) * 100)}
            {t("contextUsageBadge.used")}
          </Text>
          <Text style={styles.muted}>
            {[
              `${["estimate", "provider_estimate"].includes(usage.source ?? "") ? "≈ " : ""}${usage.tokens.toLocaleString()} / ${usage.window.toLocaleString()} ${t("mobile.tokens")}${usage.tokens > usage.window ? t("contextUsageBadge.overLimit") : ""}`,
              usage.cached ? t("mobileUi.lastKnownUsage") : "",
              usage.source === "provider_estimate"
                ? t("contextUsageBadge.apiInputEstimatedAdditions")
                : usage.source === "estimate"
                  ? t("contextUsageBadge.localEstimate")
                  : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      )}
      {current === "session" && (
        <ConversationActions
          id={id}
          session={session ?? undefined}
          title={title}
          savedTitle={savedTitle}
          onTitle={onTitle}
          pinned={pinned}
          busy={busy}
          forkDisabled={running}
          contextPercent={usage?.window ? Math.round((usage.tokens / usage.window) * 100) : 0}
          onRename={() => {
            const next = title.trim();
            if (!next || busy) return;
            void run(async () => {
              await client.renameSession(id, next);
              if (alive.current) onRenamed(next);
            });
          }}
          onTogglePin={() =>
            void run(async () => {
              await client.pinSession(id, !pinned);
              if (alive.current) setPinned(!pinned);
            })
          }
          onFiles={onOpenFiles}
          onNotifications={() => onPane("notifications")}
          onContext={() => onPane("context")}
          onFork={() => void run(async () => onForked(await client.fork(id, randomUUID())))}
          onReadState={() => {
            const read = session?.read_state;
            if (read) void run(() => onReadState(read.unread ? read.version : null));
          }}
          onResume={() => void run(() => client.start(id))}
          onArchive={() => void run(() => client.archiveSession(id), onArchived)}
        />
      )}
      {current === "model" && session && (
        <>
          {!!error && (
            <Action
              label={t("mobile.retryLoadingModels")}
              disabled={busy}
              onPress={() => {
                onError("");
                setModelRevision((v) => v + 1);
              }}
            />
          )}
          {session.agent === "codex" && !agents && !error && <Loading />}
          <Notice
            text={running ? t("mobile.stopTheCurrentResponseBeforeChangingModels") : ""}
          />
          <RuntimePicker
            unavailableAgents={agents?.unavailable_agents}
            onConfigureModels={onOpenProfiles}
            key={`${session.agent}:${session.model}:${session.profile}:${session.reasoning_effort}`}
            agents={agents?.agents ?? [{ id: "zotigo", label: t("app.zotigo"), models: [] }]}
            profiles={profiles}
            profilesLoading={!profiles && !error}
            fixedAgent={session.agent}
            value={
              session.agent === "codex"
                ? {
                    agent: "codex",
                    model: session.model ?? "",
                    reasoningEffort: session.reasoning_effort ?? "",
                  }
                : { agent: "zotigo", profile: session.profile ?? "" }
            }
            disabled={busy || running}
            onConfirm={(choice) =>
              void run(
                () =>
                  choice.agent === "codex"
                    ? client.changeModel(id, choice.model, choice.reasoningEffort)
                    : client.changeProfile(id, choice.profile),
                onClose,
              )
            }
          />
        </>
      )}
      {current === "policy" && (
        <PolicyChoices
          value={session?.approval_policy}
          disabled={busy}
          onChange={(policy) =>
            policy === session?.approval_policy
              ? onClose()
              : void run(() => client.changePolicy(id, policy), onClose)
          }
        />
      )}
    </BottomSheet>
  );
}
