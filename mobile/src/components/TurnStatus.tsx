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
    ? `Worked for ${formatElapsed(item.created_at, Date.parse(endedAt))}`
    : paused && active
      ? "Waiting for approval"
      : !active
        ? "Stopped"
        : `Working for ${formatElapsed(item.created_at, now)}`;
  return (
    <Text
      style={[styles.muted, { paddingHorizontal: 18, paddingVertical: 16 }]}
    >
      {label}
    </Text>
  );
}
