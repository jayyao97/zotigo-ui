import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useDaemon } from "../platform/context";
import { useTranslationSettings } from "../platform/preferences";
import { BottomSheet } from "./BottomSheet";
import { Action, Notice, errorText, styles } from "./ui";

/** Opens only after Translate is chosen from the native selection menu. */
export function SelectionSheet({
  text,
  sessionId,
  onClose,
}: {
  text: string;
  sessionId: string;
  onClose: () => void;
}) {
  const client = useDaemon();
  const {
    language,
    profile,
    ready,
    error: preferenceError,
  } = useTranslationSettings(client.connection.id);
  const [result, setResult] = useState<{
    text: string;
    profile?: string;
    model?: string;
  }>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setPending(true);
    setError("");
    setResult(undefined);
    void client
      .translateSelection(
        sessionId,
        text,
        language,
        controller.signal,
        profile || undefined,
      )
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorText(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [client, sessionId, text, language, profile, ready, retry]);
  return (
    <BottomSheet
      visible
      title={
        language === "zh-CN" ? "Chinese translation" : "English translation"
      }
      onClose={onClose}
    >
      <Text selectable style={styles.muted}>
        {text}
      </Text>
      <Notice text={preferenceError || error} error />
      {pending && !preferenceError && <Notice text="Translating…" />}
      {!!error && (
        <Action
          secondary
          label="Retry translation"
          onPress={() => setRetry((value) => value + 1)}
        />
      )}
      {result && (
        <View>
          <Text selectable style={styles.text}>
            {result.text}
          </Text>
          <Text style={styles.muted}>
            {[result.profile, result.model].filter(Boolean).join(" · ")}
          </Text>
        </View>
      )}
    </BottomSheet>
  );
}
