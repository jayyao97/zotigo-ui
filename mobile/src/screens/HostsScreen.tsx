import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import type { DaemonClient, Host } from "../core/client";
import { normalizeAddress } from "../core/client";
import { hosts } from "../platform/storage";
import { createDaemon } from "../platform/client";
import {
  Action,
  errorText,
  Loading,
  Notice,
  Row,
  Screen,
  Section,
  styles,
  TextField,
} from "../components/ui";

export function HostsScreen({
  onConnect,
}: {
  onConnect: (client: DaemonClient) => void;
}) {
  const [list, setList] = useState<Host[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [editing, setEditing] = useState<Host | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const pending = useRef<DaemonClient | null>(null);
  useEffect(() => {
    let alive = true;
    hosts
      .list()
      .then((value) => {
        if (alive) {
          setList(value);
          setReady(true);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(errorText(e));
          setReady(true);
        }
      });
    return () => {
      alive = false;
      pending.current?.dispose();
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function edit(host: Host | null) {
    void run(async () => {
      setName(host?.name ?? "");
      setAddress(host?.baseUrl ?? "");
      setToken(host ? ((await hosts.savedToken(host.id)) ?? "") : "");
      setEditing(host);
    });
  }
  function connect(host: Host) {
    void run(async () => {
      const client = createDaemon(await hosts.connection(host));
      pending.current = client;
      try {
        await client.health();
        pending.current = null;
        onConnect(client);
      } catch (e) {
        client.dispose();
        pending.current = null;
        throw e;
      }
    });
  }
  return (
    <SafeAreaView style={styles.screen}>
      <Screen>
        <Text style={styles.title}>Your devices</Text>
        <Notice text="Choose where you want to work." />
        {!ready && <Loading />}
        <Notice text={error} error />
        <Section title="DAEMONS">
          {list.map((host) => (
            <View key={host.id} style={{ gap: 4 }}>
              <Row
                title={host.name}
                subtitle={host.baseUrl}
                onPress={() => {
                  if (!busy) connect(host);
                }}
              />
              <View style={{ flexDirection: "row" }}>
                <Action
                  label="Edit"
                  secondary
                  disabled={busy}
                  onPress={() => edit(host)}
                />
                <Action
                  label="Remove"
                  secondary
                  danger
                  disabled={busy}
                  onPress={() =>
                    Alert.alert(
                      "Remove device?",
                      "Projects and sessions on the daemon are kept.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () =>
                            void run(async () => {
                              await hosts.remove(host.id);
                              setList(await hosts.list());
                            }),
                        },
                      ],
                    )
                  }
                />
              </View>
            </View>
          ))}
        </Section>
        {ready && !list.length && (
          <Notice text="Add your first device using its daemon address and token." />
        )}
        <Action
          label={busy ? "Connecting…" : "Add device"}
          disabled={busy}
          onPress={() => edit(null)}
        />
        <Modal
          visible={editing !== undefined}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            if (!busy) setEditing(undefined);
          }}
        >
          <SafeAreaView style={styles.screen}>
            <Screen>
              <Text style={styles.title}>
                {editing ? "Edit device" : "Add device"}
              </Text>
              <TextField
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="Home Mac / Work devbox"
              />
              <TextField
                label="Daemon address"
                value={address}
                onChangeText={setAddress}
                placeholder="http://100.64.0.1:8766"
                keyboardType="url"
              />
              <TextField
                label="Daemon token"
                value={token}
                onChangeText={setToken}
                secureTextEntry
              />
              <Notice text={error} error />
              {editing && editing.baseUrl !== address && (
                <Notice text="Changing the address adds a separate device. The old device and its drafts are kept." />
              )}
              <Action
                label="Test connection"
                disabled={busy || !address.trim()}
                onPress={() =>
                  void run(async () => {
                    const client = createDaemon({
                      id: "test",
                      name,
                      baseUrl: normalizeAddress(address),
                      token: token.trim(),
                    });
                    pending.current = client;
                    try {
                      await client.health();
                      Alert.alert("Connected", name || address);
                    } finally {
                      client.dispose();
                      pending.current = null;
                    }
                  })
                }
              />
              <Action
                label="Save device"
                disabled={busy || !name.trim() || !address.trim()}
                onPress={() =>
                  void run(async () => {
                    const sameDevice =
                      editing && editing.baseUrl === normalizeAddress(address);
                    await hosts.save(
                      {
                        id: sameDevice ? editing.id : randomUUID(),
                        name,
                        baseUrl: address,
                      },
                      token,
                    );
                    setList(await hosts.list());
                    setEditing(undefined);
                    setToken("");
                  })
                }
              />
              <Action
                label="Cancel"
                secondary
                disabled={busy}
                onPress={() => {
                  setEditing(undefined);
                  setToken("");
                }}
              />
            </Screen>
          </SafeAreaView>
        </Modal>
      </Screen>
    </SafeAreaView>
  );
}
