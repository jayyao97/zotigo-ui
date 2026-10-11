import { eventLabel } from "../core/eventLabel";
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
import { memo, useEffect, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import * as Clipboard from "expo-clipboard";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import { useDaemon } from "../platform/context";
import { Action, IconButton, colors, errorText, Notice, styles } from "./ui";

function Attachment({ url }: { url: string }) {
  const client = useDaemon();
  const [data, setData] = useState("");
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (!requested) return;
    let active = true;
    client
      .image(url)
      .then((x) => {
        if (active) setData(x);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [client, url, requested]);
  return (
    <View>
      {data ? (
        <Image
          source={{ uri: data }}
          style={{ width: "100%", height: 240, borderRadius: 12 }}
          resizeMode="contain"
          accessibilityLabel="Conversation attachment"
        />
      ) : (
        <Action
          label={requested ? "Loading image…" : "View image"}
          disabled={requested}
          onPress={() => setRequested(true)}
        />
      )}
      <Notice text={error} error />
    </View>
  );
}
function Detail({ label, text }: { label: string; text: string }) {
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
          gap: 8,
        }}
      >
        <Terminal size={15} color={colors.muted} />
        <Text numberOfLines={1} style={[styles.muted, { flex: 1 }]}>
          {label}
        </Text>
        {open ? (
          <ChevronDown size={15} color={colors.muted} />
        ) : (
          <ChevronRight size={15} color={colors.muted} />
        )}
      </Pressable>
      {open && (
        <>
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
          <Action
            label="Copy"
            secondary
            onPress={() =>
              void Clipboard.setStringAsync(text).catch((e) =>
                Alert.alert("Copy failed", errorText(e)),
              )
            }
          />
        </>
      )}
    </View>
  );
}
export const MessageCard = memo(function MessageCard({
  item,
  openFile,
  live = false,
  turnAction,
  onFork,
  forkDisabled,
  projection,
  revealReasoning = false,
}: {
  item: DisplayItem;
  openFile: (path: string) => void;
  live?: boolean;
  turnAction?: TurnAction;
  onFork?: (turnId: string) => void;
  forkDisabled?: boolean;
  projection?: ToolRenderProjection;
  revealReasoning?: boolean;
}) {
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
  const user =
    item.type === "user_message" || item.type === "steering_message";
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
        ...(user
          ? {
              backgroundColor: colors.surface,
              borderRadius: 18,
              marginLeft: 36,
              marginRight: 16,
              marginVertical: 10,
              paddingHorizontal: 14,
            }
          : {}),
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
      {user &&
        item.command?.text &&
        !parts.some((p) => p.type === "text") && (
          <Text selectable style={styles.text}>
            {item.command.text}
          </Text>
        )}
      {parts.map((p, index) => {
        const location = contentLocation(item.id, index);
        if (projection?.consumedResults.has(location)) return null;
        if (p.type === "text" && p.text)
          return live || user ? (
            <Text key={index} selectable style={styles.text}>
              {p.text}
            </Text>
          ) : (
            <Markdown
              key={index}
              style={{
                body: { color: colors.text, fontSize: 16, lineHeight: 24 },
                code_inline: {
                  backgroundColor: colors.elevated,
                  color: colors.text,
                },
                fence: {
                  backgroundColor: colors.surface,
                  color: colors.text,
                  borderColor: colors.border,
                  fontSize: 12,
                },
                code_block: {
                  backgroundColor: colors.surface,
                  color: colors.text,
                },
                link: { color: colors.accent },
                blockquote: {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
                table: { borderColor: colors.border },
                tr: { borderColor: colors.border },
              }}
              onLinkPress={link}
              rules={{
                image: (node) => (
                  <Action
                    key={node.key}
                    label="Open image reference"
                    secondary
                    onPress={() => link(String(node.attributes.src))}
                  />
                ),
              }}
            >
              {p.text}
            </Markdown>
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
          return (
            <View key={index}>
              <Detail
                label={`${p.tool_call.name ?? "tool call"}${result?.is_error ? " · failed" : ""}`}
                text={[
                  p.tool_call.arguments ?? "",
                  result
                    ? (result.text ??
                      JSON.stringify(result.json ?? result, null, 2))
                    : (projection?.progressByCall.get(p.tool_call.id ?? "") ??
                      ""),
                ]
                  .filter(Boolean)
                  .join("\n\n")}
              />
              {result?.content?.map((c, i) =>
                c.image?.url ? (
                  <Attachment key={i} url={c.image.url} />
                ) : null,
              )}
            </View>
          );
        }
        if (p.tool_result)
          return (
            <View key={index}>
              <Detail
                label={`${p.tool_result.tool_name ?? "Tool"} result${p.tool_result.is_error ? " · failed" : ""}`}
                text={
                  p.tool_result.text ??
                  JSON.stringify(p.tool_result.json ?? p.tool_result, null, 2)
                }
              />
              {p.tool_result.content?.map((c, i) =>
                c.image?.url ? (
                  <Attachment key={i} url={c.image.url} />
                ) : null,
              )}
            </View>
          );
        if (p.image?.url) return <Attachment key={index} url={p.image.url} />;
        if (p.text)
          return (
            <Text key={index} selectable style={styles.muted}>
              {p.text}
            </Text>
          );
        return null;
      })}
      {item.command?.images?.map((image, index) =>
        image.url ? (
          <Attachment key={`image-${index}`} url={image.url} />
        ) : null,
      )}
      {item.error && <Notice text={item.error} error />}
      {!user && !parts.length && !!eventLabel(item) && (
        <Text style={styles.muted}>
          {eventLabel(item)}
        </Text>
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
