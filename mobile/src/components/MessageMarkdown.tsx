import { SelectableText } from "./SelectableText";
import { selectionRuns, type SelectionAction } from "../core/selectionRuns";
import { memo, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Markdown, {
  parser,
  MarkdownIt,
  type ASTNode,
  renderRules,
  type RenderRules,
} from "react-native-markdown-display";
import * as Clipboard from "expo-clipboard";
import Copy from "lucide-react-native/icons/copy";
import { MessageImage } from "./MessageImage";
import { Action, IconButton, colors, errorText, styles } from "./ui";

import {
  stableMarkdownKeys,
  containsMarkdownImage,
} from "../core/markdownKeys";
import { highlightCode } from "../core/codeHighlight";
const imageSafeRules: RenderRules = Object.fromEntries(
  ["strong", "em", "s"].map((type) => [
    type,
    (
      node: ASTNode,
      children: ReactNode[],
      parents: ASTNode[],
      mdStyles: Record<string, unknown>,
    ) =>
      containsMarkdownImage(node) ? (
        <View key={node.key}>{children}</View>
      ) : (
        renderRules[type]?.(node, children, parents, mdStyles)
      ),
  ]),
);
const markdownParser = MarkdownIt({ typographer: false });
const mono = Platform.OS === "ios" ? "Menlo" : "monospace";
import { useDiagram } from "./DiagramProvider";
const Code = memo(function Code({
  text,
  language,
}: {
  text: string;
  language?: string;
}) {
  const [wrap, setWrap] = useState(false);
  const openDiagram = useDiagram();
  const preview = text.slice(0, 20000);
  const spans = useMemo(
    () => highlightCode(preview, language),
    [preview, language],
  );
  const mermaid = language?.trim().split(/\s+/)[0].toLowerCase() === "mermaid";
  const code = (
    <Text
      selectable
      style={{
        color: colors.text,
        fontFamily: mono,
        fontSize: 13,
        lineHeight: 20,
      }}
    >
      {spans.map((span, i) => (
        <Text key={i} style={{ color: span.color }}>
          {span.text}
        </Text>
      ))}
    </Text>
  );
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
        <View style={{ flexDirection: "row" }}>
          <Action
            label={wrap ? "Unwrap" : "Wrap"}
            secondary
            onPress={() => setWrap(!wrap)}
          />
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
      </View>
      {mermaid && (
        <Action
          label="View diagram"
          disabled={text.length > 50000 || !openDiagram}
          onPress={() => openDiagram?.(text)}
        />
      )}
      {wrap ? (
        <View style={{ padding: 12, paddingTop: 0 }}>{code}</View>
      ) : (
        <ScrollView
          horizontal
          contentContainerStyle={{ padding: 12, paddingTop: 0 }}
        >
          {code}
        </ScrollView>
      )}
      {text.length > preview.length && (
        <Text style={{ ...styles.muted, padding: 12 }}>
          Preview limited to 20,000 characters. Copy includes the complete code.
        </Text>
      )}
    </View>
  );
});
export const MessageMarkdown = memo(function MessageMarkdown({
  text,
  sessionId,
  user = false,
  onLink,
  onSelection,
  onSelecting,
}: {
  text: string;
  sessionId: string;
  user?: boolean;
  onLink: (url: string) => boolean;
  onSelection?: (action: SelectionAction) => void;
  onSelecting?: () => void;
}) {
  const { width } = useWindowDimensions();
  const ast = useMemo(() => {
    let nodes: ASTNode[] = [];
    parser(
      text,
      ((tree: ASTNode[]) => {
        nodes = tree;
        return null;
      }) as never,
      markdownParser,
    );
    return stableMarkdownKeys(nodes);
  }, [text]);
  return (
    <Markdown
      onLinkPress={onLink}
      style={{
        body: {
          color: user ? "#f6fafe" : colors.text,
          fontSize: 16,
          lineHeight: 26,
          ...(user ? { gap: 8 } : {}),
        },
        paragraph: { marginTop: user ? 0 : 4, marginBottom: user ? 0 : 4 },
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
        // AstRenderer creates a random body key even when callers provide a
        // stable AST. Keep the root mounted as well as its streaming children.
        body: (_node, children, _parents, markdownStyles) => (
          <View key="markdown-body" style={markdownStyles._VIEW_SAFE_body}>
            {children}
          </View>
        ),
        ...imageSafeRules,
        textgroup: (node, children, parents) =>
          containsMarkdownImage(node) ? (
            <View key={node.key}>{children}</View>
          ) : (
            <SelectableText
              key={node.key}
              runs={selectionRuns(node, {
                bold: parents.some((p) => /^heading/.test(p.type)),
              })}
              fontSize={
                parents.some((p) => p.type === "heading1")
                  ? 24
                  : parents.some((p) => p.type === "heading2")
                    ? 21
                    : parents.some((p) => p.type === "heading3")
                      ? 18
                      : 16
              }
              lineHeight={
                parents.some((p) => /^heading/.test(p.type)) ? 30 : 26
              }
              textColor={user ? "#f6fafe" : colors.text}
              linkColor={user ? "#f6fafe" : colors.accent}
              onLink={onLink}
              onAction={onSelection}
              onSelecting={onSelecting}
            />
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
      {ast as unknown as ReactNode}
    </Markdown>
  );
});
