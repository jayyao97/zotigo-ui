import type {
  DisplayToolCall,
  DisplayToolResult,
} from "@zotigo/shared/zotigod";
export function toolDetail(
  call?: DisplayToolCall,
  result?: DisplayToolResult,
  progress?: string,
  live = false,
) {
  const shell = /command|shell|^(bash|exec)$/i.test(call?.name ?? "");
  let command = call?.arguments?.trim() ?? "";
  if (shell && command) {
    try {
      const args = JSON.parse(command);
      command =
        [args.command, args.cmd, args.script, args.input].find(
          (v) => typeof v === "string" && v,
        ) || command;
    } catch {
      /* Plain commands are valid tool arguments. */
    }
  }
  const record =
    result?.json &&
    typeof result.json === "object" &&
    !Array.isArray(result.json)
      ? (result.json as Record<string, unknown>)
      : undefined;
  const exitCode = result?.exit_code ?? record?.exit_code ?? record?.exitCode;
  const failed =
    typeof exitCode === "number"
      ? exitCode !== 0
      : !!result?.is_error ||
        ["execution-denied", "error-text", "error-json"].includes(
          result?.result_type ?? "",
        );
  const running = !result && (live || !!progress);
  const text =
    result?.result_type === "execution-denied"
      ? `Denied: ${result.reason || "permission denied"}`
      : result
        ? result.text ||
          (result.json ? JSON.stringify(result.json, null, 2) : "") ||
          result.content
            ?.map((p) => p.text || "")
            .filter(Boolean)
            .join("\n") ||
          "(No output)"
        : progress || (running ? "Waiting for output…" : command);
  const label = call
    ? shell
      ? `${running ? "Running" : "Ran"} ${command || call.name}`
      : `${call.name || "Tool"}${failed ? " · failed" : ""}`
    : failed
      ? "Tool failed"
      : "Tool returned output";
  return {
    label,
    text,
    language: shell ? "Shell" : "plaintext",
    command: shell && command ? command : undefined,
    title: shell && command ? `$ ${command}` : label,
    status: failed
      ? ("Failed" as const)
      : running
        ? ("Running" as const)
        : result && shell
          ? ("Success" as const)
          : undefined,
  };
}
