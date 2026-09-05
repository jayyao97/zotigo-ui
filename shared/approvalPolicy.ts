import type { ApprovalPolicy } from "./zotigod";

export function approvalPolicyLabel(policy: ApprovalPolicy | null): string {
  if (policy === null) return "Unavailable";
  return policy === "bypass_permissions" ? "Full access" : "Auto";
}
