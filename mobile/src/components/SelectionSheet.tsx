import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { validExcerpt } from "../core/textSelection";
import { useDaemon } from "../platform/context";
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
  const [language, setLanguage] = useState<"zh-CN" | "en">("zh-CN");
  const [result, setResult] = useState<{
    text: string;
    profile?: string;
    model?: string;
  }>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  async function translate() {
    if (!validExcerpt(text) || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    setResult(undefined);
    try {
      const translated = await client.translateSelection(
        sessionId,
        text,
        language,
        controller.signal,
      );
      if (request.current === controller) setResult(translated);
    } catch (e) {
      if (request.current === controller) setError(errorText(e));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }
  return (
    <BottomSheet visible title="Translate selection" onClose={onClose}>
      <Text selectable style={styles.text}>
        {text}
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Action
          label={language === "zh-CN" ? "To Chinese" : "To English"}
          disabled={pending}
          secondary
          onPress={() => {
            setLanguage(language === "zh-CN" ? "en" : "zh-CN");
            setResult(undefined);
            setError("");
          }}
        />
        <Action
          label={pending ? "Translating…" : "Translate"}
          disabled={pending || !validExcerpt(text)}
          onPress={() => void translate()}
        />
      </View>
      <Notice text={error} error />
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
