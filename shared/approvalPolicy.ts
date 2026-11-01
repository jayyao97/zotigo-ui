import { t } from "./i18n/index";
import type { ApprovalPolicy } from "./zotigod";

export function approvalPolicyLabel(policy: ApprovalPolicy | null): string {
  if (policy === null) return t("directoryBrowser.unavailable");
  if (policy === "bypass_permissions") return t("channelsPage.fullAccess");
  return policy === "manual" ? t("approvalPolicy.manual") : t("channelsPage.auto");
}
