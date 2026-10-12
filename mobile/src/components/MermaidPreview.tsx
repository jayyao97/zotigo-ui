import { useEffect, useState } from "react";
import { Modal, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadMermaidRuntime } from "../platform/mermaidRuntime";
import { mermaidDocument } from "../core/mermaidDocument";
import { MermaidSurface } from "./MermaidSurface";
import { Action, colors, errorText, styles } from "./ui";
export default function MermaidPreview({
  source,
  onClose,
}: {
  source: string;
  onClose: () => void;
}) {
  const [document, setDocument] = useState({ html: "", error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setDocument({ html: "", error: "" });
    void loadMermaidRuntime()
      .then((runtime) => mermaidDocument(runtime, source))
      .then((html) => {
        if (alive) setDocument({ html, error: "" });
      })
      .catch((error) => {
        if (alive) setDocument({ html: "", error: errorText(error) });
      });
    return () => {
      alive = false;
    };
  }, [source, attempt]);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ paddingHorizontal: 12 }}>
          <Action label="Close diagram" onPress={onClose} />
        </View>
        {document.error ? (
          <View>
            <Text style={styles.muted}>{document.error}</Text>
            <Action
              label="Retry diagram"
              onPress={() => setAttempt((n) => n + 1)}
            />
          </View>
        ) : !document.html ? (
          <Text style={styles.muted}>Loading diagram…</Text>
        ) : (
          <MermaidSurface html={document.html} />
        )}
      </SafeAreaView>
    </Modal>
  );
}
