export function formatApprovalArguments(raw: string): string {
  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return raw;
    parsed = value as Record<string, unknown>;
  } catch {
    return raw;
  }
  const command = stringValue(parsed.command) || stringValue(parsed.cmd) || stringValue(parsed.script);
  const onlyCommand = Object.keys(parsed).every((key) => key === "command" || key === "cmd" || key === "script");
  return command && onlyCommand ? command : JSON.stringify(parsed, null, 2);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
