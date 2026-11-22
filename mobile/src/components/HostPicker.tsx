import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Plus from "lucide-react-native/icons/plus";
import Monitor from "lucide-react-native/icons/monitor";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import Settings2 from "lucide-react-native/icons/settings-2";
import { BottomSheet } from "./BottomSheet";
import type { DaemonClient, Host } from "../core/client";
import { hosts, storage } from "../platform/storage";
import { connectionErrorText, lastHostKey, useDeviceSwitch } from "../platform/useDeviceSwitch";
import { Action, EmptyState, ListGroup, ListRow, Notice, colors, errorText, space, styles } from "./ui";

export function HostPicker({
  client,
  onConnect,
  onAdd,
  onManage,
  beforeOpen,
}: {
  client: DaemonClient | null;
  onAdd: () => void;
  onManage?: () => void;
  /** Runs instead of opening the switcher, e.g. to leave a detail screen first. */
  beforeOpen?: () => void;
  onConnect: (client: DaemonClient) => void;
}) {
  useLocale();
  const [list, setList] = useState<Host[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [{ connecting, failed }, switcher] = useDeviceSwitch();
  const generation = useRef(0);
  const attempted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      const ticket = ++generation.current;
      hosts
        .list()
        .then(async (value) => {
          if (ticket !== generation.current) return;
          setList(value);
          setReady(true);
          if (!client && !attempted.current) {
            attempted.current = true;
            const last = await storage.get(lastHostKey);
            const host =
              value.find((h) => h.id === last) ??
              (value.length === 1 ? value[0] : undefined);
            if (host && ticket === generation.current) void switcher.select(host, onConnect);
          }
        })
        .catch((error) => {
          if (ticket === generation.current) setError(errorText(error));
        });
      return () => {
        generation.current++;
        switcher.cancel();
      };
    }, []),
  );
  function close() {
    setOpen(false);
    switcher.cancel();
  }
  const problem = failed ? connectionErrorText(failed.error, failed.host.name) : error;
  const current = list.find((host) => host.id === client?.connection.id);
  const deviceRows = list.map((host) => {
    const selected = host.id === client?.connection.id;
    return (
      <ListRow
        key={host.id}
        icon={Monitor}
        title={host.name}
        subtitle={connecting?.id === host.id ? t("webApp.connecting") : host.baseUrl}
        accessibilityLabel={t("mobile.switchDeviceValue", { p0: host.name })}
        chevron={false}
        right={
          connecting?.id === host.id ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : selected ? (
            <Check size={18} color={colors.accent} />
          ) : undefined
        }
        // Rows stay enabled while another device is connecting: choosing one
        // abandons that attempt, so an unreachable device never traps the user.
        onPress={() => (selected ? close() : void switcher.select(host, onConnect))}
      />
    );
  });
  if (!client) {
    if (ready && !list.length)
      return (
        <EmptyState
          icon={Monitor}
          title={t("mobileUi.noDevicesTitle")}
          message={t("mobileUi.noDevicesMessage")}
          action={<Action primary icon={Plus} label={t("mobile.addDevice")} onPress={onAdd} />}
        />
      );
    return (
      <View style={{ padding: space.lg, gap: space.md }}>
        <Text style={styles.sectionTitle}>{t("mobile.devices")}</Text>
        <Notice text={problem} error />
        <ListGroup>
          {deviceRows}
          <ListRow icon={Plus} title={t("mobile.addDevice")} onPress={onAdd} chevron={false} />
        </ListGroup>
      </View>
    );
  }
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("mobileUi.switchDevice")}
        accessibilityValue={{ text: client.connection.name }}
        onPress={() => (beforeOpen ? beforeOpen() : setOpen(true))}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: 6,
          minHeight: 44,
          paddingHorizontal: space.lg,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green }} />
        <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 14, fontWeight: "500", maxWidth: 240 }}>
          {current?.name ?? client.connection.name}
        </Text>
        <ChevronDown size={14} color={colors.muted} />
      </Pressable>
      <Notice text={open ? "" : error} error />
      {/* The sheet stays up while connecting: the current device keeps working
          underneath, and a failure is reported next to the other choices. */}
      <BottomSheet visible={open} title={t("mobileUi.switchDevice")} onClose={close}>
        <Notice text={problem} error />
        <ListGroup>{deviceRows}</ListGroup>
        <ListGroup>
          <ListRow icon={Plus} title={t("mobile.addDevice")} chevron={false} onPress={() => { close(); onAdd(); }} />
          <ListRow icon={Settings2} title={t("mobileUi.manageDevices")} onPress={() => { close(); onManage?.(); }} />
        </ListGroup>
      </BottomSheet>
    </View>
  );
}
