import { useEffect, useState } from "react";
import { Text } from "react-native";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import { requestRetryLabel } from "@zotigo/shared/requestRetry";
import { useLocale } from "../platform/i18n";
import { styles } from "./ui";

export function RequestRetryStatus({ item }: { item: DisplayItem }) {
  useLocale();
  const [now, setNow] = useState(Date.now);
  const waiting = !item.retry?.status || item.retry.status === "waiting";
  useEffect(() => {
    setNow(Date.now());
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting, item.created_at, item.retry?.attempt]);
  return <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={[styles.muted, { paddingHorizontal: 18, paddingVertical: 8 }]}>{requestRetryLabel(item, now)}</Text>;
}
