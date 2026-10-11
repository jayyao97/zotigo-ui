/** Preserve a supported effort; otherwise use the same default on every client. */
export function compatibleReasoningEffort(efforts: string[], current: string): string {
  return efforts.includes(current) ? current : efforts.includes("medium") ? "medium" : efforts[0] ?? "";
}
