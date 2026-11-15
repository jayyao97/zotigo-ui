import { t } from "../../shared/i18n/index";
import { stateLabel } from "../../shared/i18n/display";
import { approvalPolicyLabel } from "../../shared/approvalPolicy";
import type { AgentKind, AgentModel, ApprovalPolicy, ZotigoSession } from "../../shared/zotigod";
import type { DaemonSessionBinding, DesktopConversation, DesktopProject } from "../../shared/clientTypes";
import { StateBadge } from "../app/StateBadge";
import { formatDateTime, projectForConversation } from "../app/appHelpers";
import { codexModelLabel } from "../conversation/ConversationComposer";

export function SessionDetailList({
  conversation,
  projects,
  binding,
  session,
  sessionItemsLoading,
  hasActiveTurn,
  agent,
  codexModels,
  codexModel,
  codexReasoningEffort,
  profile,
  approvalPolicy,
}: {
  conversation: DesktopConversation;
  projects: DesktopProject[];
  binding: DaemonSessionBinding | null;
  session: ZotigoSession | null;
  sessionItemsLoading: boolean;
  hasActiveTurn: boolean;
  agent: AgentKind;
  codexModels: AgentModel[];
  codexModel: string;
  codexReasoningEffort: string;
  profile: string;
  approvalPolicy: ApprovalPolicy | null;
}) {
  return (
              <dl className="detail-list">
              <div>
                <dt>{t("app.conversation")}</dt>
                <dd>{conversation.title}</dd>
              </div>
              <div>
                <dt>{t("app.project")}</dt>
                <dd>{projectForConversation(conversation, projects)?.name ?? t("app.noProject")}</dd>
              </div>
              <div>
                <dt>{t("app.daemonId")}</dt>
                <dd className="mono">{binding?.daemon_session_id ?? t("app.notBound")}</dd>
              </div>
              <div>
                <dt>{t("app.state")}</dt>
                <dd>
                  {session ? (
                    <StateBadge
                      state={
                        session.state === "running" && !sessionItemsLoading && !hasActiveTurn
                          ? "idle"
                          : session.state
                      }
                    />
                  ) : (
                    t("app.notBound")
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("app.agent")}</dt>
                <dd>{agent === "codex" ? t("app.codex") : t("app.zotigo")}</dd>
              </div>
              {agent === "codex" ? (
                <>
                  <div>
                    <dt>{t("app.model")}</dt>
                    <dd>{codexModelLabel(codexModels, codexModel)}</dd>
                  </div>
                  <div>
                    <dt>{t("app.thinking")}</dt>
                    <dd>{stateLabel(codexReasoningEffort) || t("app.notAvailable")}</dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>{t("app.profile")}</dt>
                    <dd>{profile || t("app.notAvailable")}</dd>
                  </div>
                  <div>
                    <dt>{t("app.access")}</dt>
                    <dd>{approvalPolicyLabel(approvalPolicy)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>{t("app.created")}</dt>
                <dd>{session ? formatDateTime(session.created_at) : formatDateTime(conversation.created_at)}</dd>
              </div>
              <div>
                <dt>{t("app.started")}</dt>
                <dd>{session?.started_at ? formatDateTime(session.started_at) : t("app.notStarted")}</dd>
              </div>
              <div>
                <dt>{t("app.ended")}</dt>
                <dd>{session?.ended_at ? formatDateTime(session.ended_at) : t("app.notEnded")}</dd>
              </div>
              <div>
                <dt>{t("app.error")}</dt>
                <dd>{session?.error || t("app.none")}</dd>
              </div>
              </dl>
  );
}
