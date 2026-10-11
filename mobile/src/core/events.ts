import type { DisplayItem, SessionDisplayEvent } from "@zotigo/shared/zotigod";
import { record } from "./client";

// Incremental UTF-8 is decoded by the caller. SSE permits CRLF and multiline data.
export class EventDecoder {
  private pending = "";
  push(text: string): SessionDisplayEvent[] {
    this.pending += text;
    if (this.pending.length > 8 * 1024 * 1024)
      throw new Error("Daemon event exceeded the size limit.");
    const events: SessionDisplayEvent[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.pending))) {
      const frame = this.pending.slice(0, match.index);
      this.pending = this.pending.slice(match.index + match[0].length);
      let type = "";
      const data: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) type = line.slice(6).trim();
        if (line.startsWith("data:"))
          data.push(line.slice(5).replace(/^ /, ""));
      }
      if (!data.length || !["item", "delta"].includes(type)) continue;
      const value = record(JSON.parse(data.join("\n")));
      if (type === "item") {
        if (
          typeof value.id !== "string" ||
          !Number.isSafeInteger(value.sequence) ||
          typeof value.type !== "string"
        )
          throw new Error("Invalid durable event.");
        events.push({ type, item: value as unknown as DisplayItem });
      } else {
        if (
          typeof value.item_id !== "string" ||
          typeof value.delta !== "string" ||
          !["text", "reasoning", "tool_progress"].includes(
            String(value.part_type),
          )
        )
          throw new Error("Invalid preview event.");
        events.push({
          type: "delta",
          delta: value as unknown as Extract<
            SessionDisplayEvent,
            { type: "delta" }
          >["delta"],
        });
      }
    }
    return events;
  }
}
