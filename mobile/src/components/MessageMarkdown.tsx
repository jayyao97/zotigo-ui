import { memo } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Markdown from "react-native-markdown-display";
import * as Clipboard from "expo-clipboard";
import Copy from "lucide-react-native/icons/copy";
import { MessageImage } from "./MessageImage";
import { IconButton, colors, errorText, styles } from "./ui";

const mono = Platform.OS === "ios" ? "Menlo" : "monospace";
function Code({ text, language }: { text: string; language?: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 10,
        marginVertical: 6,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 12,
        }}
      >
        <Text style={styles.muted}>{language || "Code"}</Text>
        <IconButton
          icon={Copy}
          label="Copy code"
          onPress={() =>
            void Clipboard.setStringAsync(text).catch((e) =>
              Alert.alert("Copy failed", errorText(e)),
            )
          }
        />
      </View>
      <ScrollView
        horizontal
        contentContainerStyle={{ padding: 12, paddingTop: 0 }}
      >
        <Text
          selectable
          style={{
            color: colors.text,
            fontFamily: mono,
            fontSize: 13,
            lineHeight: 20,
          }}
        >
          {text.replace(/\n$/, "")}
        </Text>
      </ScrollView>
    </View>
  );
}
export const MessageMarkdown = memo(function MessageMarkdown({
  text,
  sessionId,
  user = false,
  onLink,
}: {
  text: string;
  sessionId: string;
  user?: boolean;
  onLink: (url: string) => boolean;
}) {
  const { width } = useWindowDimensions();
  return (
    <Markdown
      onLinkPress={onLink}
      style={{
        body: {
          color: user ? "#f6fafe" : colors.text,
          fontSize: 16,
          lineHeight: 26,
        },
        paragraph: { marginTop: 4, marginBottom: 4 },
        heading1: {
          fontSize: 24,
          lineHeight: 32,
          fontWeight: "600",
          marginTop: 12,
          marginBottom: 6,
        },
        heading2: {
          fontSize: 21,
          lineHeight: 29,
          fontWeight: "600",
          marginTop: 10,
          marginBottom: 6,
        },
        heading3: {
          fontSize: 18,
          lineHeight: 26,
          fontWeight: "600",
          marginTop: 8,
          marginBottom: 4,
        },
        code_inline: {
          fontFamily: mono,
          fontSize: 14,
          color: user ? "#f6fafe" : colors.text,
          backgroundColor: user ? "#214b84" : colors.elevated,
        },
        link: {
          color: user ? "#f6fafe" : colors.accent,
          textDecorationLine: "underline",
        },
        blockquote: {
          backgroundColor: "transparent",
          borderColor: colors.muted,
          borderLeftWidth: 3,
          paddingLeft: 12,
          marginVertical: 6,
        },
        table: { borderColor: colors.border, borderRadius: 6 },
        tr: { borderColor: colors.border },
        th: { padding: 8 },
        td: { padding: 8 },
        hr: { backgroundColor: colors.border, marginVertical: 12 },
      }}
      rules={{
        textgroup: (node, children, _parents, markdownStyles) => (
          <Text key={node.key} selectable style={markdownStyles.textgroup}>
            {children}
          </Text>
        ),
        image: (node) => (
          <MessageImage
            key={node.key}
            url={String(node.attributes.src)}
            sessionId={sessionId}
          />
        ),
        fence: (node) => (
          <Code
            key={node.key}
            text={node.content}
            language={
              "sourceInfo" in node && typeof node.sourceInfo === "string"
                ? node.sourceInfo
                : undefined
            }
          />
        ),
        code_block: (node) => <Code key={node.key} text={node.content} />,
        table: (node, children) => (
          <ScrollView key={node.key} horizontal style={{ marginVertical: 8 }}>
            <View
              style={{
                minWidth: Math.max(
                  width - 36,
                  (node.children[0]?.children[0]?.children.length ?? 1) * 120,
                ),
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {children}
            </View>
          </ScrollView>
        ),
      }}
    >
      {text}
    </Markdown>
  );
});
