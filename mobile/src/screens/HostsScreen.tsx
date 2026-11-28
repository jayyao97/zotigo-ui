import { t } from "@zotigo/shared/i18n/index";
import { resolveHostHeaders, type HostHeaderInput } from "@zotigo/shared/hostHeaders";
import { useLocale } from "../platform/i18n";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Text, View } from "react-native";
import Check from "lucide-react-native/icons/check";
import Monitor from "lucide-react-native/icons/monitor";
import Pencil from "lucide-react-native/icons/pencil";
import Plus from "lucide-react-native/icons/plus";
import { SafeAreaView } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import type { DaemonClient, Host } from "../core/client";
import { addressOrigin, normalizeAddress } from "../core/client";
import { hosts } from "../platform/storage";
import { useHostList } from "../platform/useHostList";
import { createDaemon } from "../platform/client";
import { reach } from "../core/deviceSwitch";
import { connectionErrorText, useDeviceSwitch } from "../platform/useDeviceSwitch";
import {
  Action,
  colors,
  errorText,
  IconButton,
  ListGroup,
  ListRow,
  Loading,
  Notice,
  Screen,
  Section,
  space,
  styles,
  TextField,
} from "../components/ui";

/**
 * Devices: tap a device to switch to it (same as the Home switcher); the
 * pencil opens its form, which is also where a device is removed.
 */
export function HostsScreen({
  onConnect,
  currentId,
  addOnly = false,
  onClose,
  onRemoved,
}: {
  onConnect: (client: DaemonClient) => void;
  currentId?: string;
  addOnly?: boolean;
  onClose?: () => void;
  /** A device was removed; its connection must close. */
  onRemoved?: (id: string) => void;
}) {
  useLocale();
  const hostList = useHostList();
  const list = hostList.list,
    ready = hostList.ready;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [editing, setEditing] = useState<Host | null | undefined>(
    addOnly ? null : undefined,
  );
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const [headers, setHeaders] = useState<HostHeaderInput[]>([]);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [tested, setTested] = useState(false);
  const [{ connecting, failed }, switcher] = useDeviceSwitch();
  const pending = useRef<DaemonClient | null>(null);
  useEffect(() => {
    mounted.current = true;
    // A failure from an earlier visit is old news; one in flight keeps going.
    switcher.dismiss();
    // The switch is app-wide: an attempt started here keeps going after the
    // screen closes and is reported wherever devices are listed.
    return () => {
      mounted.current = false;
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
    switcher.cancel();
    void run(async () => {
      setName(host?.name ?? "");
      setAddress(host?.baseUrl ?? "");
      const saved = host ? await hosts.credentials(host.id) : null;
      setToken(saved?.token ?? "");
      const names = saved?.headers.map(header => header.name) ?? [];
      setSavedNames(names);
      setHeaders(names.map(name => ({ name })));
      setTested(false);
      setEditing(host);
    });
  }
  function close() {
    setEditing(undefined);
    setHeaders([]);
    setSavedNames([]);
    setToken("");
    setTested(false);
    setError("");
    if (addOnly) onClose?.();
  }
  // Half-typed addresses are normal here, so rendering must not validate by throwing.
  const origin = addressOrigin(address);
  const movesDevice = !!editing && origin !== undefined && origin !== editing.baseUrl;
  function updateHeaders(next: HostHeaderInput[]) {
    setHeaders(next);
    setTested(false);
  }
  async function formCredentials() {
    const saved = editing && editing.baseUrl === normalizeAddress(address) ? await hosts.credentials(editing.id) : null;
    const resolved = resolveHostHeaders(headers, saved?.headers);
    return { headers: resolved, changed: token.trim() !== saved?.token || JSON.stringify(resolved) !== JSON.stringify(saved?.headers) };
  }
  return (
    <SafeAreaView edges={["bottom"]} style={styles.screen}>
      <Screen>
        {!addOnly && (
          <>
            {!ready && <Loading />}
            {editing === undefined && (
              <Notice text={failed ? connectionErrorText(failed.error, failed.host.name) : error || hostList.error} error />
            )}
            {ready && !list.length && (
              <Notice text={t("mobile.addYourFirstDeviceUsingItsDaemonAddressAndToken")} />
            )}
            <Section footer={list.length ? t("mobile.chooseWhereYouWantToWork") : undefined}>
              <ListGroup>
                {list.map((host) => (
                  <ListRow
                    key={host.id}
                    icon={Monitor}
                    title={host.name}
                    subtitle={connecting?.id === host.id ? t("webApp.connecting") : host.baseUrl}
                    accessibilityLabel={t("mobile.switchDeviceValue", { p0: host.name })}
                    chevron={false}
                    disabled={busy}
                    // Not disabled while another device is connecting: choosing
                    // one abandons that attempt (see DeviceSwitch).
                    onPress={() =>
                      host.id === currentId ? switcher.cancel() : connecting?.id === host.id ? undefined : void switcher.select(host, onConnect)
                    }
                    right={
                      connecting?.id === host.id ? (
                        <ActivityIndicator size="small" color={colors.muted} />
                      ) : host.id === currentId ? (
                        <Check size={18} color={colors.accent} />
                      ) : undefined
                    }
                    accessory={
                      <IconButton
                        icon={Pencil}
                        color={colors.muted}
                        label={t("mobileUi.editNamed", { name: host.name })}
                        disabled={busy}
                        onPress={() => edit(host)}
                      />
                    }
                  />
                ))}
                <ListRow
                  icon={Plus}
                  title={t("mobile.addDevice")}
                  chevron={false}
                  disabled={busy}
                  onPress={() => edit(null)}
                />
              </ListGroup>
            </Section>
          </>
        )}
        <Modal
          visible={editing !== undefined}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            if (!busy) close();
          }}
        >
          <SafeAreaView style={styles.screen}>
            <Screen>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text accessibilityRole="header" style={styles.title}>
                  {editing ? t("mobile.editDevice") : t("mobile.addDevice")}
                </Text>
                <Action label={t("app.cancel")} secondary disabled={busy} onPress={close} />
              </View>
              <TextField
                label={t("hostShell.name")}
                value={name}
                onChangeText={setName}
                placeholder={t("mobile.homeMacWorkDevbox")}
              />
              <TextField
                label={t("hostShell.daemonAddress")}
                value={address}
                onChangeText={(value) => {
                  setAddress(value);
                  setTested(false);
                }}
                placeholder="http://100.64.0.1:8766"
                keyboardType="url"
                help={
                  movesDevice
                    ? t("mobile.changingTheAddressAddsASeparateDeviceTheOldDeviceAndItsDraftsAreKept")
                    : undefined
                }
              />
              <TextField
                label={t("hostShell.daemonToken")}
                value={token}
                onChangeText={(value) => {
                  setToken(value);
                  setTested(false);
                }}
                secureTextEntry
              />
              {headers.map((header, index) => (
                <View key={index} style={{ gap: space.sm }}>
                  <TextField label={t("hostShell.headerName")} value={header.name} editable={!busy}
                    onChangeText={name => updateHeaders(headers.map((item, i) => i === index ? { ...item, name } : item))} />
                  <TextField label={t("hostShell.headerValue")} value={header.value ?? ""} editable={!busy} secureTextEntry
                    placeholder={!movesDevice && savedNames.includes(header.name) ? t("hostShell.keepHeader") : undefined}
                    onChangeText={value => updateHeaders(headers.map((item, i) => i === index ? { ...item, value: value || undefined } : item))} />
                  <Action label={t("hostShell.removeHeader")} secondary disabled={busy}
                    onPress={() => updateHeaders(headers.filter((_, i) => i !== index))} />
                </View>
              ))}
              <Action label={t("hostShell.addHeader")} secondary disabled={busy || headers.length >= 32}
                onPress={() => updateHeaders([...headers, { name: "", value: "" }])} />
              <Notice text={error} error />
              <Notice text={tested ? t("models.success") : ""} />
              <View style={{ gap: space.sm, marginTop: space.sm }}>
                <Action
                  primary
                  block
                  label={t("mobile.saveDevice")}
                  disabled={busy || !name.trim() || !address.trim()}
                  onPress={() =>
                    void run(async () => {
                      // Throws for an invalid address; `run` shows the message.
                      const sameDevice = !!editing && editing.baseUrl === normalizeAddress(address);
                      const host = {
                        id: sameDevice ? editing.id : randomUUID(),
                        name,
                        baseUrl: address,
                      };
                      const isCurrent = sameDevice && editing.id === currentId;
                      const credentials = await formCredentials();
                      // Connect with the new details first, and save them only
                      // once they answer, when they replace the connection in
                      // use (a new token for this device) or when there is no
                      // connection yet (the first device): a wrong token is
                      // reported here and never stored.
                      if ((isCurrent && credentials.changed) || (!currentId && !editing)) {
                        const connection = {
                          id: host.id,
                          name: name.trim(),
                          baseUrl: normalizeAddress(address),
                          token: token.trim(),
                          headers: credentials.headers,
                        };
                        close();
                        void switcher.select(
                          { id: connection.id, name: connection.name, baseUrl: connection.baseUrl },
                          onConnect,
                          { connection, accept: () => hosts.save(host, token, credentials.headers) },
                        );
                        return;
                      }
                      // Otherwise (another device, or only a new name) save as
                      // is; a name shows from the saved list at once.
                      await hosts.save(host, token, credentials.headers);
                      close();
                    })
                  }
                />
                <Action
                  block
                  label={t("mobile.testConnection")}
                  disabled={busy || !address.trim()}
                  onPress={() => {
                    setTested(false);
                    void run(async () => {
                      const client = createDaemon({
                        headers: (await formCredentials()).headers,
                        id: "test",
                        name,
                        baseUrl: normalizeAddress(address),
                        token: token.trim(),
                      });
                      pending.current = client;
                      try {
                        await reach(client);
                        if (mounted.current) setTested(true);
                      } catch (e) {
                        throw new Error(connectionErrorText(e, name.trim() || normalizeAddress(address)));
                      } finally {
                        client.dispose();
                        pending.current = null;
                      }
                    });
                  }}
                />
              </View>
              {editing && (
                <ListGroup style={{ marginTop: space.lg }}>
                  <ListRow
                    danger
                    title={t("mobileUi.removeDevice")}
                    disabled={busy}
                    onPress={() =>
                      Alert.alert(
                        t("mobile.removeDevice"),
                        t("mobile.projectsAndSessionsOnTheDaemonAreKept"),
                        [
                          { text: t("app.cancel"), style: "cancel" },
                          {
                            text: t("favoriteModelSettings.remove"),
                            style: "destructive",
                            onPress: () =>
                              void run(async () => {
                                await hosts.remove(editing.id);
                                onRemoved?.(editing.id);
                                close();
                              }),
                          },
                        ],
                      )
                    }
                  />
                </ListGroup>
              )}
            </Screen>
          </SafeAreaView>
        </Modal>
      </Screen>
    </SafeAreaView>
  );
}
