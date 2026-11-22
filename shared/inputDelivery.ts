/**
 * Whether a failed message send was definitely refused, or may have been
 * admitted. Only a refusal lets a client put the draft back and send it again
 * under a new ID; anything else must be retried with the same client message
 * ID, or the message can arrive twice. A timeout or server error may follow
 * durable admission, and these codes mean the daemon may still deliver it.
 */
export function inputDeliveryOutcome(status: number | undefined, code: string | undefined): "rejected" | "unknown" {
  if (status === undefined) return "unknown";
  if (status >= 400 && status < 500 && status !== 408 &&
      code !== "command_pending" && code !== "command_id_conflict" &&
      code !== "input_failed") return "rejected";
  return "unknown";
}
