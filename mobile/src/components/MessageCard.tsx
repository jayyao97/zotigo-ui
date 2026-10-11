import { memo, useEffect, useState } from "react";
import { Alert, Image, Linking, Pressable, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import * as Clipboard from "expo-clipboard";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import { useDaemon } from "../platform/context";
import { Action, colors, errorText, Notice, styles } from "./ui";

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
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(8000);
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 10,
        gap: 6,
      }}
    >
      <Action
        label={`${open ? "Hide" : "Show"} ${label}`}
        secondary
        onPress={() => setOpen(!open)}
      />
      {open && (
        <>
          <Text
            selectable
            style={[
              styles.text,
              { fontFamily: "Menlo", fontSize: 12, lineHeight: 18 },
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
}: {
  item: DisplayItem;
  openFile: (path: string) => void;
  live?: boolean;
}) {
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
  return (
    <View
      style={{
        paddingVertical: 10,
        paddingHorizontal: 18,
        gap: 8,
        alignSelf: "stretch",
      }}
    >
      {user && (
        <Text style={styles.muted}>
          {item.type === "steering_message" ? "You · steering" : "You"}
        </Text>
      )}
      {item.subagent && (
        <Text style={[styles.muted, { color: colors.accent }]}>
          {item.subagent.name ?? "Subagent"} ·{" "}
          {item.subagent.status ?? "working"}
        </Text>
      )}
      {user && item.command?.text && !parts.some((p) => p.type === "text") && (
        <Text selectable style={styles.text}>
          {item.command.text}
        </Text>
      )}
      {parts.map((p, index) => {
        if (p.type === "text" && p.text)
          return live ? (
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
          return <Detail key={index} label="reasoning" text={p.text ?? ""} />;
        if (p.tool_call)
          return (
            <Detail
              key={index}
              label={p.tool_call.name ?? "tool call"}
              text={p.tool_call.arguments ?? ""}
            />
          );
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
                c.image?.url ? <Attachment key={i} url={c.image.url} /> : null,
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
      {!user && !parts.length && (
        <Text style={styles.muted}>
          {item.type.replaceAll("_", " ")}
          {item.turn?.reason ? ` · ${item.turn.reason}` : ""}
          {item.turn?.duration_ms
            ? ` · ${(item.turn.duration_ms / 1000).toFixed(1)}s`
            : ""}
        </Text>
      )}
      {!live && parts.some((p) => p.type === "text") && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy message"
          style={{
            minHeight: 44,
            justifyContent: "center",
            alignSelf: "flex-start",
          }}
          onPress={() =>
            void Clipboard.setStringAsync(
              parts
                .filter((p) => p.type === "text")
                .map((p) => p.text)
                .join("\n"),
            ).catch((e) => Alert.alert("Copy failed", errorText(e)))
          }
        >
          <Text style={styles.muted}>Copy</Text>
        </Pressable>
      )}
    </View>
  );
});
