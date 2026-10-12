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
import { Alert, Linking, Platform, Pressable, Text, View } from "react-native";
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
  title,
  status,
}: {
  label: string;
  text: string;
  language?: string;
  title?: string;
  status?: "Success" | "Failed" | "Running";
}) {
  const animateLayout = useLayoutTransition();
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(8000);
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
            <Text style={styles.muted}>{language}</Text>
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
          {!!title && (
            <Text
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
          )}
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
            {text.slice(0, limit)}
          </Text>
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
}: {
  item: DisplayItem;
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
    if (/^https?:\/\//i.test(href)) {
      Alert.alert("Open external link?", href, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open",
          onPress: () =>
            void Linking.openURL(href).catch((e) =>
              Alert.alert("Cannot open link", errorText(e)),
            ),
        },
      ]);
    } else if (
      href &&
      !href.startsWith("#") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(href)
    ) {
      openFile(href);
    }
    return false;
  }
  const user = item.type === "user_message" || item.type === "steering_message";
  const parts = item.content ?? [];
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
        <View style={{ alignItems: "flex-end", gap: 8, marginVertical: 4 }}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {userImages(item, client.connection.baseUrl, sessionId).map(
              (url) => (
                <MessageImage
                  key={url}
                  url={url}
                  sessionId={sessionId}
                  thumbnail
                />
              ),
            )}
          </View>
          {!!(
            parts.some((p) => p.type === "text" && p.text) || item.command?.text
          ) && (
            <View
              style={{
                maxWidth: "88%",
                backgroundColor: "#173e76",
                borderRadius: 22,
                paddingHorizontal: 16,
                paddingVertical: 6,
              }}
            >
              <MessageMarkdown
                text={codexUserText(
                  parts
                    .filter((p) => p.type === "text")
                    .map((p) => p.text ?? "")
                    .join("\n") ||
                    item.command?.text ||
                    "",
                  item,
                )}
                sessionId={sessionId}
                user
                onLink={link}
                onSelection={(selection) =>
                  onSelectText?.({ ...selection, messageId: item.id })
                }
                onSelecting={onSelecting}
              />
            </View>
          )}
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
            <Text key={index} selectable style={styles.muted}>
              {p.text}
            </Text>
          ) : (
            <Detail key={index} label="reasoning" text={p.text ?? ""} />
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
              <Detail {...detail} />
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
              <Detail {...toolDetail(undefined, p.tool_result)} />
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
            <Text key={index} selectable style={styles.muted}>
              {p.text}
            </Text>
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
      <View style={{ flexDirection: "row" }}>
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
    </View>
  );
});
