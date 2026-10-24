import { t } from "./i18n/index";
import type { ApprovalPolicy } from "./zotigod";

export function approvalPolicyLabel(policy: ApprovalPolicy | null): string {
  if (policy === null) return t("directoryBrowser.unavailable");
  return policy === "bypass_permissions" ? t("channelsPage.fullAccess") : t("channelsPage.auto");
}
