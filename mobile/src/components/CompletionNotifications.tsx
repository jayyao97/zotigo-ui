import { useCallback, useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { getLocale, t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import { useDaemon } from "../platform/context";
import { Action, Notice, Section, errorText, styles } from "./ui";
import type { ClientApi } from "@zotigo/shared/clientTypes";

type Trigger = NonNullable<Awaited<ReturnType<ClientApi["listCompletionTriggers"]>>>[number];

export function CompletionNotifications({ sessionId }: { sessionId: string }) {
  useLocale();
  const client = useDaemon();
  const focused = useIsFocused();
  const [items, setItems] = useState<Trigger[] | null>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!focused) return;
    let disposed = false;
    let inFlight = false;
    async function refresh(initial = false) {
      if (disposed || inFlight || (!initial && AppState.currentState !== "active")) return;
      inFlight = true;
      try {
        const result = await client.listCompletionTriggers(sessionId);
        if (!disposed) { setItems(result); setError(""); }
      } catch (e) { if (!disposed) setError(errorText(e)); }
      finally { inFlight = false; }
    }
    void refresh(true);
    const timer = setInterval(() => void refresh(), 5000);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { disposed = true; clearInterval(timer); subscription.remove(); };
  }, [client, sessionId, focused, revision]);
  const cancel = useCallback(async (id: string) => {
    setBusy(true);
    try { await client.cancelCompletionTrigger(sessionId, id); setError(""); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); setRevision(value => value + 1); }
  }, [client, sessionId]);
  return <View style={{ gap: 12 }}>
    <Notice text={error} error />
    {items === undefined ? <Notice text={t("completionTriggers.loading")} /> : items === null ? <Notice text={t("completionTriggers.unsupported")} /> : !items.length ? <Notice text={t("completionTriggers.empty")} /> : items.map(item => {
      const state = (item.state ?? "pending") === "pending" && Date.parse(item.expires_at) <= Date.now() ? "expired" : item.state ?? "pending";
      return <Section key={item.id} title={item.title}>
        <Text style={styles.muted}>{t(`completionTriggers.${state}`)}</Text>
        {item.watch_session_id && <Text selectable style={styles.muted}>{t("completionTriggers.watching", { p0: item.watch_session_id })}</Text>}
        <Text selectable style={styles.text}>{item.on_fire}</Text>
        <Notice text={t("completionTriggers.expires", { p0: new Date(item.expires_at).toLocaleString(getLocale()) })} />
        {state === "pending" && <><Action label={t("completionTriggers.cancelAction")} secondary disabled={busy} onPress={() => void cancel(item.id)} /><Notice text={t("completionTriggers.cancelHelp")} /></>}
      </Section>;
    })}
  </View>;
}
