import { ChevronRight } from "lucide-react";
import { t } from "../../shared/i18n/index";
import { SubagentAvatar, type SubagentRun } from "../conversation/SubagentPanel";

export function SubagentSummaryButton({ runs, onOpen }: { runs: SubagentRun[]; onOpen: () => void }) {
  const queued = runs.filter(run => run.status === "queued").length;
  return (
              <button type="button" className="subagent-summary-button" onClick={onOpen}>
                <span>
                  <strong>{t("app.subagents")}</strong>
                  <small>{t(queued ? "context.subagentCountsQueued" : "context.subagentCounts", { queued, active: runs.filter((run) => run.status === "running" || run.status === "waiting_approval").length, done: runs.filter((run) => run.status === "completed" || run.status === "failed" || run.status === "interrupted").length })}</small>
                </span>
                <span className="subagent-avatar-stack" aria-hidden="true">
                  {runs.slice(0, 4).map((run) => <SubagentAvatar key={run.id} run={run} compact />)}
                </span>
                <ChevronRight size={14} strokeWidth={1.8} />
              </button>
  );
}
