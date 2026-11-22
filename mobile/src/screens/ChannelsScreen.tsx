import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import { BottomSheet, ChoiceRow } from "../components/BottomSheet";
import {
  connectionPermissions,
  conversationPermissions,
  channelPermissionLabel,
} from "../core/channelPermissions";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { usePreventRemove } from "@react-navigation/native";
import MessageSquare from "lucide-react-native/icons/message-square";
import Radio from "lucide-react-native/icons/radio";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import SquareArrowOutUpRight from "lucide-react-native/icons/square-arrow-out-up-right";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type {
  ChannelConnection,
  ChannelConversation,
  ChannelMessage,
} from "@zotigo/shared/channels";
import { useDaemon } from "../platform/context";
import type { Routes } from "../navigation";
import {
  IconButton,
  ListGroup,
  ListRow,
  Loading,
  Notice,
  Section,
  errorText,
  styles,
  colors,
  radius,
  space,
} from "../components/ui";

export function ChannelsScreen({
  navigation,
}: NativeStackScreenProps<Routes, "Channels">) {
  const locale = useLocale();
  const client = useDaemon();
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [conversations, setConversations] = useState<ChannelConversation[]>([]);
  const [permissionTarget, setPermissionTarget] = useState<{
    kind: "connection" | "conversation";
    id: string;
  }>();
  const [selected, setSelected] = useState<ChannelConversation>();
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function load() {
    const [c, rooms] = await Promise.all([
      client.connections(),
      client.channelConversations(),
    ]);
    if (alive.current) {
      setConnections(c);
      setConversations(rooms);
    }
  }
  async function open(conversation: ChannelConversation) {
    setSelected(conversation);
    setMessages([]);
    const result = await client.channelMessages(conversation.id);
    if (alive.current) setMessages(result);
  }
  useEffect(() => {
    void run(load);
  }, [client]);
  const target =
    permissionTarget?.kind === "connection"
      ? connections.find((value) => value.id === permissionTarget.id)
      : conversations.find((value) => value.id === permissionTarget?.id);
  const permissionSheet = (
    <BottomSheet
      visible={!!permissionTarget}
      title={t("channelsPage.permissions")}
      disabled={busy}
      onClose={() => setPermissionTarget(undefined)}
    >
      <Notice text={error} error />
      <Notice text={t("mobile.fullAccessSkipsToolApprovalChangesApplyToExistingSessionsAtTheirNextIdleTurn")} />
      {(permissionTarget?.kind === "conversation"
        ? (["", "auto", "bypass_permissions"] as const)
        : (["auto", "bypass_permissions"] as const)
      ).map((policy) => (
        <ChoiceRow
          key={policy}
          title={policy ? channelPermissionLabel(policy) : t("channelsPage.inheritConnection")}
          selected={
            (target?.approval_policy ||
              (permissionTarget?.kind === "connection" ? "auto" : "")) ===
            policy
          }
          disabled={busy}
          onPress={() =>
            void run(async () => {
              if (!permissionTarget) return;
              if (permissionTarget.kind === "connection") {
                const latest = (await client.connections()).find(
                  (value) => value.id === permissionTarget.id,
                );
                if (!latest || !policy)
                  throw new Error(
                    t("mobile.connectionUnavailableRefreshAndTryAgain"),
                  );
                await client.updateConnection(
                  latest.id,
                  connectionPermissions(latest, policy),
                );
              } else {
                const latest = (await client.channelConversations()).find(
                  (value) => value.id === permissionTarget.id,
                );
                if (!latest)
                  throw new Error(
                    t("mobile.conversationUnavailableRefreshAndTryAgain"),
                  );
                const saved = await client.updateChannelConversation(
                  latest.id,
                  conversationPermissions(latest, policy),
                );
                if (alive.current)
                  setSelected((current) =>
                    current?.id === saved.id ? saved : current,
                  );
              }
              await load();
              if (alive.current) setPermissionTarget(undefined);
            })
          }
        />
      ))}
    </BottomSheet>
  );
  const refresh = () => void run(() => (selected ? open(selected) : load()));
  const selectedTitle = selected
    ? selected.display_name || selected.chat_name || selected.chat_id
    : undefined;
  // A conversation is a second level of this screen: the header shows its
  // name and the system back gesture returns to the list.
  useLayoutEffect(() => {
    navigation.setOptions({
      title: selectedTitle ?? t("app.channels"),
      headerRight: () => (
        <IconButton icon={RefreshCw} label={t("mobile.refresh")} disabled={busy} onPress={refresh} />
      ),
    });
    // `refresh` only reads `selected`; listing it keeps the header in step.
  }, [navigation, selectedTitle, selected, busy, locale]);
  usePreventRemove(!!selected, ({ data }) => {
    // Only "back" returns to the list; any other navigation proceeds.
    if (!["GO_BACK", "POP"].includes(data.action.type)) {
      navigation.dispatch(data.action);
      return;
    }
    setSelected(undefined);
    setMessages([]);
    setError("");
  });
  const status = (
    <>
      {busy && <Loading />}
      {!!error && <Notice text={error} error />}
    </>
  );
  if (selected)
    return (
      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.content}
        data={messages}
        keyExtractor={(message) => message.id}
        initialNumToRender={20}
        windowSize={7}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            {permissionSheet}
            <Section
              footer={`${selected.enabled ? t("channelsPage.enabled") : t("channelsPage.disabled")} · ${selected.agent} · ${selected.session_strategy}`}
            >
              <ListGroup>
                <ListRow
                  icon={ShieldCheck}
                  title={t("channelsPage.permissions")}
                  value={
                    selected.approval_policy
                      ? channelPermissionLabel(selected.approval_policy)
                      : t("mobile.inheritConnectionValue", {
                          p0: channelPermissionLabel(
                            connections.find((value) => value.id === selected.connection_id)
                              ?.approval_policy,
                          ),
                        })
                  }
                  onPress={() => setPermissionTarget({ kind: "conversation", id: selected.id })}
                />
                <ListRow
                  icon={SquareArrowOutUpRight}
                  title={t("mobile.openLinkedSession")}
                  subtitle={selected.session_id ? undefined : t("mobile.noLinkedSession")}
                  disabled={!selected.session_id}
                  onPress={() => {
                    const id = selected.session_id;
                    if (!id) return;
                    navigation.navigate("Conversation", {
                      id,
                      title: selectedTitle || t("mobile.channelSession"),
                    });
                  }}
                />
              </ListGroup>
            </Section>
            {status}
          </View>
        }
        ListEmptyComponent={
          !busy && !error ? <Notice text={t("mobile.noRecordedChannelMessages")} /> : null
        }
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              padding: 14,
              gap: space.sm,
            }}
          >
            <Text style={styles.muted}>
              {item.sender.display_name || item.sender.id} ·{" "}
              {new Date(item.created_at).toLocaleString()}
            </Text>
            {!!item.text && (
              <Text selectable style={styles.text}>
                {item.text}
              </Text>
            )}
            <Text style={[styles.muted, { color: colors.faint }]}>
              {item.trigger_status}
              {item.status_detail ? " · " + item.status_detail : ""}
            </Text>
          </View>
        )}
      />
    );
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[styles.content, { gap: 0 }]}
      data={conversations}
      keyExtractor={(conversation) => conversation.id}
      initialNumToRender={20}
      windowSize={7}
      ListHeaderComponent={
        <View style={{ gap: space.md, paddingBottom: space.sm }}>
          {permissionSheet}
          {status}
          <Section
            title={t("settingsPage.connections")}
            footer={t(
              "mobile.viewConnectionsChannelMessagesAndLinkedSessionsManageChannelCredentialsAndRoutingInDesktopOrWeb",
            )}
          >
            {!!connections.length && (
              <ListGroup>
                {connections.map((connection) => (
                  <ListRow
                    key={connection.id}
                    icon={Radio}
                    title={connection.name}
                    subtitle={`${connection.enabled ? connection.status : t("channelsPage.disabled")}${connection.last_error ? " · " + connection.last_error : ""}`}
                    value={channelPermissionLabel(connection.approval_policy)}
                    onPress={() => setPermissionTarget({ kind: "connection", id: connection.id })}
                  />
                ))}
              </ListGroup>
            )}
            {!busy && !error && connections.length === 0 && (
              <Notice text={t("mobile.noChannelConnectionsConfigured")} />
            )}
          </Section>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { marginTop: space.sm }]}>
            {t("mobile.channelConversations")}
          </Text>
        </View>
      }
      ListEmptyComponent={
        !busy && !error ? <Notice text={t("mobile.noChannelConversations")} /> : null
      }
      renderItem={({ item }) => (
        <ListRow
          icon={MessageSquare}
          title={item.display_name || item.chat_name || item.chat_id}
          subtitle={`${item.chat_type} · ${item.enabled ? item.agent : t("channelsPage.disabled")} · ${connections.find((connection) => connection.id === item.connection_id)?.name ?? item.connection_id}`}
          disabled={busy}
          onPress={() => void run(() => open(item))}
        />
      )}
    />
  );
}
