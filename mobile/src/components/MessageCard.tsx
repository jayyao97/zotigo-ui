import { messageTimestamp } from "@zotigo/shared/messageTimestamp";
import { highlightParts } from "../core/conversationSearch";
import { parseMarkdownLink } from "@zotigo/shared/markdownLinks";
import { SelectableText } from "./SelectableText";
import { eventLabel } from "../core/eventLabel";
import { toolDetail } from "../core/toolDetail";
import type { SelectionAction } from "../core/selectionRuns";
import Check from "lucide-react-native/icons/check";
import { useLayoutTransition } from "./useLayoutTransition";
import {
  contentLocation,
  hasVisibleAssistantContent,
  type ToolRenderProjection,
} from "@zotigo/shared/sessionDisplay";
import GitBranch from "lucide-react-native/icons/git-branch";
import type { TurnAction } from "@zotigo/shared/sessionFork";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import Terminal from "lucide-react-native/icons/terminal";
import Copy from "lucide-react-native/icons/copy";
import { memo, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { MessageMarkdown } from "./MessageMarkdown";
import { MessageImage } from "./MessageImage";
import { userImages } from "../core/messageImages";
import { codexUserText } from "@zotigo/shared/codexUserMessage";
import * as Clipboard from "expo-clipboard";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import { useDaemon } from "../platform/context";
import { Action, IconButton, colors, errorText, Notice, styles } from "./ui";

function Detail({
  label,
  text,
  language = "plaintext",
  allowReference = true,
  title,
  command,
  status,
  onSelection,
  onSelecting,
  highlight,
}: {
  label: string;
  text: string;
  language?: string;
  allowReference?: boolean;
  title?: string;
  command?: string;
  status?: "Success" | "Failed" | "Running";
  highlight?: string;
  onSelection?: (action: SelectionAction) => void;
  onSelecting?: () => void;
}) {
  const animateLayout = useLayoutTransition();
  const [open, setOpen] = useState(!!highlight);
  const [limit, setLimit] = useState(8000);
  const [commandExpanded, setCommandExpanded] = useState(false);
  const { height } = useWindowDimensions();
  const OutputContainer = onSelection ? View : ScrollView;
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          animateLayout();
          setOpen(!open);
        }}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          maxWidth: "100%",
          gap: 8,
        }}
      >
        <Terminal size={15} color={colors.muted} />
        <Text numberOfLines={1} style={[styles.muted, { flexShrink: 1 }]}>
          {label}
        </Text>
        {open ? (
          <ChevronDown size={15} color={colors.muted} />
        ) : (
          <ChevronRight size={15} color={colors.muted} />
        )}
      </Pressable>
      {open && (
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            padding: 12,
            gap: 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={[styles.muted, { flex: 1 }]}>{language}</Text>
            {command && (
              <IconButton
                icon={commandExpanded ? ChevronDown : ChevronRight}
                label={commandExpanded ? "Collapse command" : "Expand command"}
                onPress={() => {
                  animateLayout();
                  setCommandExpanded(!commandExpanded);
                }}
              />
            )}
            <IconButton
              icon={Copy}
              label={command ? "Copy command" : "Copy tool result"}
              onPress={() =>
                void Clipboard.setStringAsync(command ?? text).catch((e) =>
                  Alert.alert("Copy failed", errorText(e)),
                )
              }
            />
          </View>
          {!!title && (
            <Pressable
              disabled={!command}
              accessibilityRole={command ? "button" : undefined}
              accessibilityLabel={
                command
                  ? commandExpanded
                    ? "Collapse full command"
                    : "Expand full command"
                  : undefined
              }
              onPress={() => {
                animateLayout();
                setCommandExpanded(!commandExpanded);
              }}
            >
              <Text
                numberOfLines={command && !commandExpanded ? 2 : undefined}
                selectable
                style={[
                  styles.text,
                  {
                    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    fontSize: 13,
                  },
                ]}
              >
                {title}
              </Text>
            </Pressable>
          )}
          {command && (
            <View
              style={{
                alignItems: "flex-end",
                borderTopWidth: 1,
                borderColor: colors.border,
              }}
            >
              <IconButton
                icon={Copy}
                label="Copy tool result"
                onPress={() =>
                  void Clipboard.setStringAsync(text).catch((e) =>
                    Alert.alert("Copy failed", errorText(e)),
                  )
                }
              />
            </View>
          )}
          <OutputContainer
            nestedScrollEnabled
            style={
              onSelection
                ? undefined
                : { maxHeight: Math.min(260, height * 0.34) }
            }
          >
            {onSelection ? (
              <SelectableText
                allowReference={allowReference}
                runs={[{ text: text.slice(0, limit) }]}
                highlight={highlight}
                textColor={colors.muted}
                linkColor={colors.accent}
                onLink={() => false}
                onAction={onSelection}
                onSelecting={onSelecting}
              />
            ) : (
              <Text
                selectable
                style={[
                  styles.text,
                  {
                    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                    fontSize: 12,
                    lineHeight: 18,
                  },
                ]}
              >
                {highlightParts(text.slice(0, limit), highlight).map(
                  (part, i) => (
                    <Text
                      key={i}
                      style={
                        part.matched
                          ? { backgroundColor: "#865719" }
                          : undefined
                      }
                    >
                      {part.text}
                    </Text>
                  ),
                )}
              </Text>
            )}
          </OutputContainer>
          {text.length > limit && (
            <Action
              label="Show more"
              onPress={() => setLimit((x) => x + 16000)}
            />
          )}
          {!!status && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 6,
              }}
            >
              {status === "Success" && <Check size={14} color={colors.muted} />}
              <Text
                style={[
                  styles.muted,
                  status === "Failed" && { color: colors.danger },
                ]}
              >
                {status}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
export const MessageCard = memo(function MessageCard({
  item,
  sessionId,
  openFile,
  live = false,
  turnAction,
  onFork,
  forkDisabled,
  projection,
  revealReasoning = false,
  onSelectText,
  onSelecting,
  highlight,
  onLocateMessage,
}: {
  item: DisplayItem;
  highlight?: string;
  onLocateMessage?: (id: string) => void;
  sessionId: string;
  openFile: (path: string) => void;
  live?: boolean;
  turnAction?: TurnAction;
  onFork?: (turnId: string) => void;
  forkDisabled?: boolean;
  projection?: ToolRenderProjection;
  revealReasoning?: boolean;
  onSelectText?: (selection: SelectionAction & { messageId: string }) => void;
  onSelecting?: () => void;
}) {
  const client = useDaemon();
  const [copied, setCopied] = useState(false);
  function link(href: string) {
    try {
      const target = parseMarkdownLink(href);
      if (target.kind === "anchor" && target.anchor.startsWith("message-")) {
        onLocateMessage?.(decodeURIComponent(target.anchor.slice(8)));
      } else if (target.kind === "external") {
        Alert.alert("Open external link?", target.url, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open",
            onPress: () =>
              void Linking.openURL(target.url).catch((e) =>
                Alert.alert("Cannot open link", errorText(e)),
              ),
          },
        ]);
      } else if (target.kind === "local") openFile(target.path);
    } catch (e) {
      Alert.alert("Cannot open link", errorText(e));
    }
    return false;
  }

  const user = item.type === "user_message" || item.type === "steering_message";
  const parts = item.content ?? [];
  const timestamp = messageTimestamp(item.created_at);
  const userText = user
    ? codexUserText(
        parts
          .filter((p) => p.type === "text")
          .map((p) => p.text ?? "")
          .join("\n") ||
          item.command?.text ||
          "",
        item,
      )
    : "";
  const images = user
    ? userImages(item, client.connection.baseUrl, sessionId)
    : [];

  if (
    item.type === "assistant_message" &&
    projection &&
    !hasVisibleAssistantContent(item, projection)
  )
    return null;
  return (
    <View
      style={{
        paddingVertical: user
          ? 12
          : parts.every(
                (p) =>
                  !!p.tool_call || !!p.tool_result || p.type === "reasoning",
              )
            ? 0
            : 8,
        paddingHorizontal: 18,
        gap: 4,
        alignSelf: "stretch",
      }}
    >
      {item.type === "steering_message" && (
        <Text style={styles.muted}>Steering</Text>
      )}
      {item.subagent && (
        <Text style={[styles.muted, { color: colors.accent }]}>
          {item.subagent.name ?? "Subagent"} ·{" "}
          {item.subagent.status ?? "working"}
        </Text>
      )}
      {user && (
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          {images.length > 0 && (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              {images.map((url) => (
                <MessageImage
                  key={url}
                  url={url}
                  sessionId={sessionId}
                  thumbnail
                />
              ))}
            </View>
          )}
          {!!userText && (
            <View
              style={{
                maxWidth: "88%",
                backgroundColor: "#173e76",
                borderRadius: 22,
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}
            >
              <MessageMarkdown
                text={userText}
                sessionId={sessionId}
                user
                highlight={highlight}
                onLink={link}
                onSelection={(selection) =>
                  onSelectText?.({ ...selection, messageId: item.id })
                }
                onSelecting={onSelecting}
              />
            </View>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {timestamp && (
              <Text accessibilityLabel={timestamp.full} style={styles.muted}>
                {timestamp.label}
              </Text>
            )}
            {!!userText && (
              <IconButton
                icon={copied ? Check : Copy}
                label={copied ? "Copied message" : "Copy message"}
                onPress={() =>
                  void Clipboard.setStringAsync(userText)
                    .then(() => setCopied(true))
                    .catch((e) => Alert.alert("Copy failed", errorText(e)))
                }
              />
            )}
          </View>
        </View>
      )}
      {parts.map((p, index) => {
        if (user && (p.type === "text" || p.image)) return null;
        const location = contentLocation(item.id, index);
        if (projection?.consumedResults.has(location)) return null;
        if (p.type === "text" && p.text)
          return (
            <MessageMarkdown
              key={index}
              text={p.text}
              highlight={highlight}
              sessionId={sessionId}
              onLink={link}
              onSelection={(selection) =>
                onSelectText?.({ ...selection, messageId: item.id })
              }
              onSelecting={onSelecting}
            />
          );
        if (p.type === "reasoning")
          return revealReasoning ? (
            <SelectableText
              allowReference={false}
              key={index}
              highlight={highlight}
              runs={[{ text: p.text ?? "" }]}
              textColor={colors.muted}
              linkColor={colors.accent}
              onLink={link}
              onAction={(selection) =>
                onSelectText?.({ ...selection, messageId: item.id })
              }
              onSelecting={onSelecting}
            />
          ) : (
            <Detail
              key={index}
              label="reasoning"
              allowReference={false}
              text={p.text ?? ""}
              onSelection={(selection) =>
                onSelectText?.({ ...selection, messageId: item.id })
              }
              onSelecting={onSelecting}
            />
          );
        if (p.tool_call) {
          const result = projection?.resultsByCall.get(
            contentLocation(item.id, index),
          );
          const detail = toolDetail(
            p.tool_call,
            result,
            projection?.progressByCall.get(p.tool_call.id ?? ""),
            live,
          );
          return (
            <View key={index}>
              <Detail {...detail} highlight={highlight} />
              {result?.content?.map((c, i) =>
                c.image?.url ? (
                  <MessageImage
                    sessionId={sessionId}
                    key={i}
                    url={c.image.url}
                  />
                ) : null,
              )}
            </View>
          );
        }
        if (p.tool_result)
          return (
            <View key={index}>
              <Detail
                {...toolDetail(undefined, p.tool_result)}
                highlight={highlight}
              />
              {p.tool_result.content?.map((c, i) =>
                c.image?.url ? (
                  <MessageImage
                    sessionId={sessionId}
                    key={i}
                    url={c.image.url}
                  />
                ) : null,
              )}
            </View>
          );
        if (p.image?.url)
          return (
            <MessageImage sessionId={sessionId} key={index} url={p.image.url} />
          );
        if (p.text)
          return (
            <SelectableText
              key={index}
              highlight={highlight}
              runs={[{ text: p.text ?? "" }]}
              textColor={colors.muted}
              linkColor={colors.accent}
              onLink={link}
              onAction={(selection) =>
                onSelectText?.({ ...selection, messageId: item.id })
              }
              onSelecting={onSelecting}
            />
          );
        return null;
      })}
      {!user &&
        item.command?.images?.map((image, index) =>
          image.url ? (
            <MessageImage
              sessionId={sessionId}
              key={`image-${index}`}
              url={image.url}
            />
          ) : null,
        )}
      {item.error && <Notice text={item.error} error />}
      {!user && !parts.length && !!eventLabel(item) && (
        <Text style={styles.muted}>{eventLabel(item)}</Text>
      )}
      {!live && turnAction && (
        <View style={{ flexDirection: "row" }}>
          <IconButton
            icon={copied ? Check : Copy}
            label={copied ? "Copied" : "Copy response"}
            onPress={() =>
              void Clipboard.setStringAsync(turnAction.text)
                .then(() => setCopied(true))
                .catch((e) => Alert.alert("Copy failed", errorText(e)))
            }
          />
          <IconButton
            icon={GitBranch}
            label="Fork from this turn"
            disabled={forkDisabled}
            onPress={() => onFork?.(turnAction.turnId)}
          />
        </View>
      )}
    </View>
  );
});
