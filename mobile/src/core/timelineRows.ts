import { t } from "@zotigo/shared/i18n/index";
import {
  groupTimelineItems,
  historicalToolSummary,
  visibleDisplayItems,
} from "@zotigo/shared/sessionDisplay";
import {
  defaultThinkingDisclosureOpen,
  latestReasoningItemId,
  type ThinkingDisplayMode,
} from "@zotigo/shared/thinkingDisplay";
import type { DisplayItem } from "@zotigo/shared/zotigod";

export type TimelineRow =
  | {
      kind: "item";
      key: string;
      item: DisplayItem;
      revealReasoning?: boolean;
    }
  | { kind: "activity"; key: string; label: string; open: boolean };

/**
 * Flatten ordered display items into list rows. Tool and reasoning runs fold
 * into one "activity" row; an explicit disclosure choice always wins over the
 * default (running tools open, reasoning per the thinking preference).
 */
export function timelineRows(
  ordered: DisplayItem[],
  options: {
    /** Sequence of the running turn's `turn_started`, if a turn is running. */
    activeTurnSequence?: number;
    pendingInteractions?: Set<string>;
    agent?: string;
    thinkingMode: ThinkingDisplayMode;
    disclosures: Record<string, boolean>;
  },
): TimelineRow[] {
  const latestReasoning = latestReasoningItemId(ordered);
  return groupTimelineItems(
    visibleDisplayItems(ordered, options.pendingInteractions),
    options.activeTurnSequence,
  ).flatMap<TimelineRow>((group) => {
    if (group.kind === "item")
      return [{ kind: "item", key: group.item.id, item: group.item }];
    const key = group.kind + ":" + group.items[0].id;
    const open =
      options.disclosures[key] ??
      ((group.kind === "tools" && group.active) ||
        (options.agent !== "codex" &&
          group.items.some(
            (item) =>
              item.content?.some((p) => p.type === "reasoning") &&
              defaultThinkingDisclosureOpen(options.thinkingMode, item.id === latestReasoning),
          )));
    return [
      {
        kind: "activity",
        key,
        label: group.kind === "tools" ? historicalToolSummary(group.items) : t("app.thinking"),
        open,
      },
      ...(open
        ? group.items.map((item) => ({
            kind: "item" as const,
            key: item.id,
            item,
            revealReasoning: true,
          }))
        : []),
    ];
  });
}
