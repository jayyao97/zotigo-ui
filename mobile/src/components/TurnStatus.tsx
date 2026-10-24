import { useLocale } from "../platform/i18n";
import { t } from "@zotigo/shared/i18n/index";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import { formatElapsed } from "@zotigo/shared/turnDuration";
import { styles } from "./ui";

export function TurnStatus({
  item,
  items,
  active,
  paused,
  terminalAt,
}: {
  item: DisplayItem;
  items: DisplayItem[];
  active: boolean;
  paused: boolean;
  terminalAt?: string;
}) {
  useLocale();
  const end = items.find(
    (i) =>
      i.sequence > item.sequence &&
      ["turn_completed", "turn_failed", "turn_interrupted"].includes(i.type),
  );
  const endedAt = end?.created_at ?? terminalAt;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (endedAt || !active || paused) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endedAt, active, paused]);
  const label = endedAt
    ? t("conversationTimeline.workedFor", {p0: formatElapsed(item.created_at, Date.parse(endedAt))})
    : paused && active
      ? t("conversationTimeline.waitingForApproval")
      : !active
        ? t("conversationTimeline.stopped")
        : t("mobile.workingForValue", {p0: formatElapsed(item.created_at, now)});
  return (
    <Text
      style={[styles.muted, { paddingHorizontal: 18, paddingVertical: 16 }]}
    >
      {label}
    </Text>
  );
}
