import { useEffect, useRef, useState } from "react";
import { Modal, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  selectedExcerpt,
  validExcerpt,
  type TextRange,
} from "../core/textSelection";
import type { ConversationReference } from "../core/conversationReferences";
import { useDaemon } from "../platform/context";
import { Action, Notice, colors, errorText, styles } from "./ui";

type Translation = { text: string; profile?: string; model?: string };
export function SelectionSheet({
  text,
  messageId,
  sessionId,
  onClose,
  onReference,
}: {
  text: string;
  messageId: string;
  sessionId: string;
  onClose: () => void;
  onReference?: (reference: Omit<ConversationReference, "id">) => void;
}) {
  const client = useDaemon();
  // Bound the native input cost. The sheet snapshots the message when opened.
  const source = text.slice(0, 128000);
  const [range, setRange] = useState<TextRange>({
    start: 0,
    end: source.length,
  });
  const [language, setLanguage] = useState<"zh-CN" | "en">("zh-CN");
  const [result, setResult] = useState<Translation>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const added = useRef(false);
  const excerpt = selectedExcerpt(source, range);
  const valid = validExcerpt(excerpt.text);
  function cancel() {
    request.current?.abort();
    request.current = null;
  }
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  function select(next: TextRange) {
    if (next.start === range.start && next.end === range.end) return;
    cancel();
    setPending(false);
    setResult(undefined);
    setError("");
    setRange(next);
  }
  async function translate() {
    if (!valid || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    setResult(undefined);
    try {
      const translated = await client.translateSelection(
        sessionId,
        excerpt.text,
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
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        cancel();
        onClose();
      }}
    >
      <SafeAreaView style={[styles.screen, { padding: 16, gap: 12 }]}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={styles.title}>Select text</Text>
          <Action
            label="Done"
            secondary
            onPress={() => {
              cancel();
              onClose();
            }}
          />
        </View>
        <Text style={styles.muted}>
          Touch and hold to select a passage. Markdown source is shown.
        </Text>
        {text.length > source.length && (
          <Notice text="Showing the first 128,000 characters of this message." />
        )}
        <TextInput
          accessibilityLabel="Message text selection"
          multiline
          editable={false}
          scrollEnabled
          value={source}
          selection={range}
          onSelectionChange={(e) => select(e.nativeEvent.selection)}
          style={[
            styles.input,
            {
              flex: 1,
              minHeight: 140,
              textAlignVertical: "top",
              lineHeight: 24,
            },
          ]}
          selectionColor={colors.accent}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Action
            label="Select all"
            secondary
            onPress={() => select({ start: 0, end: source.length })}
          />
          <Action
            label="Add to conversation"
            disabled={!valid || !onReference}
            onPress={() => {
              if (!valid || !onReference || added.current) return;
              added.current = true;
              cancel();
              onReference({ messageId, ...excerpt, comment: "" });
              onClose();
            }}
          />
        </View>
        {!valid && (
          <Notice
            text={
              excerpt.text
                ? "Select up to 8,000 characters."
                : "Select text to add or translate."
            }
          />
        )}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Action
            label={language === "zh-CN" ? "To Chinese" : "To English"}
            secondary
            disabled={pending}
            onPress={() => {
              setLanguage(language === "zh-CN" ? "en" : "zh-CN");
              setResult(undefined);
              setError("");
            }}
          />
          <Action
            label={pending ? "Translating…" : "Translate"}
            disabled={!valid || pending}
            onPress={() => void translate()}
          />
        </View>
        <Notice text={error} error />
        {result && (
          <ScrollView style={{ maxHeight: 220 }}>
            <Text selectable style={styles.text}>
              {result.text}
            </Text>
            {(result.profile || result.model) && (
              <Text style={styles.muted}>
                {[
                  result.profile && `Profile: ${result.profile}`,
                  result.model && `Model: ${result.model}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
