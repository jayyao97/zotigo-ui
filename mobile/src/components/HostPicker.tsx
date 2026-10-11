import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Pressable, ScrollView, Text, View } from "react-native";
import Plus from "lucide-react-native/icons/plus";
import Monitor from "lucide-react-native/icons/monitor";
import type { DaemonClient, Host } from "../core/client";
import { hosts, storage } from "../platform/storage";
import { createDaemon } from "../platform/client";
import { Notice, colors, errorText } from "./ui";

export function HostPicker({
  client,
  onConnect,
  onAdd,
}: {
  client: DaemonClient | null;
  onAdd: () => void;
  onConnect: (client: DaemonClient) => void;
}) {
  const [list, setList] = useState<Host[]>([]);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState<string>();
  const generation = useRef(0);
  const pending = useRef<DaemonClient | null>(null);
  const locked = useRef(false);
  const attempted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      const ticket = ++generation.current;
      setConnecting(undefined);
      hosts
        .list()
        .then(async (value) => {
          if (ticket !== generation.current) return;
          setList(value);
          if (!client && !attempted.current) {
            attempted.current = true;
            const last = await storage.get("zotigo.mobile.lastHost");
            const host =
              value.find((h) => h.id === last) ??
              (value.length === 1 ? value[0] : undefined);
            if (host && ticket === generation.current) void select(host);
          }
        })
        .catch((error) => {
          if (ticket === generation.current) setError(errorText(error));
        });
      return () => {
        generation.current++;
        pending.current?.dispose();
      };
    }, []),
  );
  async function select(host: Host) {
    if (locked.current || host.id === client?.connection.id) return;
    locked.current = true;
    const ticket = generation.current;
    setConnecting(host.id);
    setError("");
    try {
      const connection = await hosts.connection(host);
      if (ticket !== generation.current) return;
      const next = createDaemon(connection);
      pending.current = next;
      await next.health();
      if (ticket !== generation.current) return;
      await storage.set("zotigo.mobile.lastHost", host.id);
      if (ticket !== generation.current) {
        next.dispose();
        return;
      }
      pending.current = null;
      onConnect(next);
    } catch (error) {
      pending.current?.dispose();
      pending.current = null;
      if (ticket === generation.current) setError(errorText(error));
    } finally {
      locked.current = false;
      if (ticket === generation.current) setConnecting(undefined);
    }
  }
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <ScrollView
          style={{ flex: 1 }}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            gap: 8,
          }}
        >
          {list.map((host) => {
            const selected = host.id === client?.connection.id;
            return (
              <Pressable
                key={host.id}
                accessibilityRole="button"
                accessibilityLabel={`Switch device: ${host.name}`}
                accessibilityState={{ selected, disabled: !!connecting }}
                disabled={!!connecting}
                onPress={() => void select(host)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 44,
                  paddingHorizontal: 14,
                  borderRadius: 24,
                  backgroundColor: selected
                    ? colors.elevated
                    : colors.background,
                }}
              >
                <Monitor
                  size={18}
                  color={selected ? colors.text : colors.muted}
                />
                <Text
                  style={{
                    color: selected ? colors.text : colors.muted,
                    fontSize: 15,
                  }}
                >
                  {connecting === host.id ? "Connecting…" : host.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add device"
            onPress={onAdd}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              minHeight: 44,
              paddingHorizontal: 12,
            }}
          >
            <Plus size={18} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              Add device
            </Text>
          </Pressable>
        </ScrollView>
      </View>
      <Notice text={error} error />
    </View>
  );
}
