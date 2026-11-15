import { useState, type Dispatch, type SetStateAction } from "react";
import { approvalPolicyLabel } from "../../shared/approvalPolicy";
import type { ClientApi, DaemonSessionBinding } from "../../shared/clientTypes";
import { t } from "../../shared/i18n/index";
import type { ApprovalPolicy, DisplayItem, ZotigoSession } from "../../shared/zotigod";
import { errorMessage, upsertSession } from "../app/appHelpers";

export interface ApprovalPolicySelectionArgs {
  client: Pick<ClientApi, "changeSessionApprovalPolicy" | "getSession">;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setSessions: Dispatch<SetStateAction<ZotigoSession[]>>;
  // Hoisted function declarations in App; they read the bindings of the render they were passed from.
  refreshSessionItems: (binding: DaemonSessionBinding, options?: { quiet?: boolean }) => Promise<DisplayItem[]>;
  refreshSessions: (options?: { quiet?: boolean }) => Promise<void>;
}

export interface ApprovalPolicySelection {
  // The policy a new session will be created with.
  draftApprovalPolicy: ApprovalPolicy;
  // Optimistic per-session policies, kept until the daemon reports the change as applied.
  approvalPolicyOverrides: Record<string, ApprovalPolicy>;
  // The catalog refresh prunes overrides the daemon has caught up with.
  setApprovalPolicyOverrides: Dispatch<SetStateAction<Record<string, ApprovalPolicy>>>;
  // Takes the selected session and binding of the render it is called from.
  selectApprovalPolicy: (
    selectedSession: ZotigoSession | null,
    selectedBinding: DaemonSessionBinding | null,
    approvalPolicy: ApprovalPolicy,
  ) => Promise<void>;
}

// Owns the approval policy of the draft session and the optimistic overrides for existing sessions.
export function useApprovalPolicySelection({
  client, setMessage, setIsBusy, setSessions, refreshSessionItems, refreshSessions,
}: ApprovalPolicySelectionArgs): ApprovalPolicySelection {
  const [draftApprovalPolicy, setDraftApprovalPolicy] = useState<ApprovalPolicy>("bypass_permissions");
  const [approvalPolicyOverrides, setApprovalPolicyOverrides] = useState<Record<string, ApprovalPolicy>>({});

  async function selectApprovalPolicy(
    selectedSession: ZotigoSession | null,
    selectedBinding: DaemonSessionBinding | null,
    approvalPolicy: ApprovalPolicy,
  ) {
    if (!selectedSession) {
      setDraftApprovalPolicy(approvalPolicy);
      return;
    }

    setApprovalPolicyOverrides((current) => ({ ...current, [selectedSession.id]: approvalPolicy }));
    setIsBusy(true);
    setMessage(null);
    try {
      const result = await client.changeSessionApprovalPolicy(selectedSession.id, approvalPolicy);
      setMessage(
        result.status === "pending"
          ? t("app.switchingAccessTo", { p0: approvalPolicyLabel(approvalPolicy) })
          : t("app.accessChangedTo", { p0: approvalPolicyLabel(approvalPolicy) }),
      );
      if (result.status === "applied") {
        const session = await client.getSession(selectedSession.id);
        setSessions((current) => upsertSession(current, session));
        setApprovalPolicyOverrides((current) => {
          const next = { ...current };
          delete next[selectedSession.id];
          return next;
        });
      }
      void refreshSessionItems(selectedBinding!, { quiet: true });
      void refreshSessions({ quiet: true });
    } catch (error) {
      setApprovalPolicyOverrides((current) => {
        const next = { ...current };
        if (next[selectedSession.id] === approvalPolicy) {
          delete next[selectedSession.id];
        }
        return next;
      });
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  return { draftApprovalPolicy, approvalPolicyOverrides, setApprovalPolicyOverrides, selectApprovalPolicy };
}
