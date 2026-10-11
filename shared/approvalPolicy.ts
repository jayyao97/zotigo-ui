import type { ApprovalPolicy } from "./zotigod";

export function approvalPolicyLabel(policy: ApprovalPolicy | null): string {
  if (policy === null) return "Unavailable";
  return policy === "bypass_permissions" ? "Full access" : "Auto";
}

export function approvalPolicyDescription(policy: ApprovalPolicy): string {
  return policy === "auto" ? "Use safety checks and request approval when needed" : "Run tools without safety classification or approval";
}
