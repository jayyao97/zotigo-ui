import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import { useEffect, useRef, useState } from "react";
import { useHostList } from "../platform/useHostList";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Plus from "lucide-react-native/icons/plus";
import Monitor from "lucide-react-native/icons/monitor";
import Check from "lucide-react-native/icons/check";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import Settings2 from "lucide-react-native/icons/settings-2";
import { BottomSheet } from "./BottomSheet";
import type { DaemonClient } from "../core/client";
import { storage } from "../platform/storage";
import { connectionErrorText, lastHostKey, useDeviceSwitch } from "../platform/useDeviceSwitch";
import { Action, EmptyState, ListGroup, ListRow, Notice, colors, space, styles } from "./ui";

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
  const { list, ready, error } = useHostList();
  const [open, setOpen] = useState(false);
  const [{ connecting, failed }, switcher] = useDeviceSwitch();
  // Reconnect to the last device once, when the saved list is first known.
  const attempted = useRef(false);
  useEffect(() => {
    if (!ready || client || attempted.current || switcher.state.connecting) return;
    attempted.current = true;
    let active = true;
    void storage
      .get(lastHostKey)
      .then((last) => {
        const host = list.find((h) => h.id === last) ?? (list.length === 1 ? list[0] : undefined);
        if (host && active) void switcher.select(host, onConnect);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ready]);
  // Whether the attempt in flight was started from this sheet.
  const startedHere = useRef(false);
  function close() {
    setOpen(false);
    // Only this sheet's own attempt: one started on the Devices screen (such
    // as saving new details) keeps going, and its result is reported there.
    if (startedHere.current) switcher.cancel();
    startedHere.current = false;
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
        onPress={() => {
          if (selected) return close();
          if (connecting?.id === host.id) return;
          startedHere.current = open;
          void switcher.select(host, onConnect);
        }}
      />
    );
  });
  // A device being added is listed while it connects, before it is saved.
  const unsaved = connecting && !list.some((host) => host.id === connecting.id) ? connecting : undefined;
  if (unsaved)
    deviceRows.push(
      <ListRow
        key={unsaved.id}
        icon={Monitor}
        title={unsaved.name}
        subtitle={t("webApp.connecting")}
        chevron={false}
        right={<ActivityIndicator size="small" color={colors.muted} />}
      />,
    );
  if (!client) {
    if (ready && !deviceRows.length && !problem)
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
