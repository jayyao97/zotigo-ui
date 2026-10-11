import { useEffect, useRef, useState } from "react";
import { FlatList, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type {
  ChannelConnection,
  ChannelConversation,
  ChannelMessage,
} from "@zotigo/shared/channels";
import { useDaemon } from "../platform/context";
import type { Routes } from "../navigation";
import {
  Action,
  Loading,
  Notice,
  Row,
  Section,
  errorText,
  styles,
} from "../components/ui";

export function ChannelsScreen({
  navigation,
}: NativeStackScreenProps<Routes, "Channels">) {
  const client = useDaemon();
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [conversations, setConversations] = useState<ChannelConversation[]>([]);
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
          <View style={{ gap: 12 }}>
            <Action
              label="All channel conversations"
              secondary
              disabled={busy}
              onPress={() => {
                setSelected(undefined);
                setMessages([]);
                setError("");
              }}
            />
            <Text style={styles.title}>
              {selected.display_name || selected.chat_name || selected.chat_id}
            </Text>
            <Notice
              text={`${selected.enabled ? "Enabled" : "Disabled"} · ${selected.agent} · ${selected.session_strategy}`}
            />
            {selected.session_id ? (
              <Action
                label="Open linked session"
                onPress={() =>
                  navigation.navigate("Conversation", {
                    id: selected.session_id!,
                    title:
                      selected.display_name ||
                      selected.chat_name ||
                      "Channel session",
                  })
                }
              />
            ) : (
              <Notice text="No linked session." />
            )}
            <Action
              label="Refresh messages"
              disabled={busy}
              onPress={() => void run(() => open(selected))}
            />
            {status}
          </View>
        }
        ListEmptyComponent={
          !busy && !error ? (
            <Notice text="No recorded channel messages." />
          ) : null
        }
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: "#212121",
              borderRadius: 12,
              padding: 14,
              gap: 8,
            }}
          >
            <Text style={styles.muted}>
              {item.sender.display_name || item.sender.id} · {item.created_at}
            </Text>
            <Text selectable style={styles.text}>
              {item.text || "(No text)"}
            </Text>
            <Notice
              text={`${item.trigger_status}${item.status_detail ? " · " + item.status_detail : ""}`}
            />
          </View>
        )}
      />
    );
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={conversations}
      keyExtractor={(conversation) => conversation.id}
      initialNumToRender={20}
      windowSize={7}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Notice text="View connections, channel messages and linked sessions. Manage channel credentials and routing in Desktop or Web." />
          <Action
            label="Refresh channels"
            disabled={busy}
            onPress={() => void run(load)}
          />
          {status}
          <Section title="Connections">
            {connections.map((connection) => (
              <Row
                key={connection.id}
                title={connection.name}
                subtitle={`${connection.enabled ? connection.status : "Disabled"}${connection.last_error ? " · " + connection.last_error : ""}`}
              />
            ))}
            {!busy && !error && connections.length === 0 && (
              <Notice text="No channel connections configured." />
            )}
          </Section>
          <Text style={styles.muted}>Channel conversations</Text>
        </View>
      }
      ListEmptyComponent={
        !busy && !error ? <Notice text="No channel conversations." /> : null
      }
      renderItem={({ item }) => (
        <Row
          title={item.display_name || item.chat_name || item.chat_id}
          subtitle={`${item.chat_type} · ${item.enabled ? item.agent : "Disabled"} · ${connections.find((connection) => connection.id === item.connection_id)?.name ?? item.connection_id}`}
          onPress={busy ? undefined : () => void run(() => open(item))}
        />
      )}
    />
  );
}
