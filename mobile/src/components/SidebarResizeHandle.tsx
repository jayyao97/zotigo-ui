import { useMemo, useRef } from "react";
import { PanResponder, Pressable, View } from "react-native";
import { clampSidebarWidth, sidebarDefaultWidth } from "@zotigo/shared/sidebarWidth";
import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import { colors } from "./ui";

export function SidebarResizeHandle({ width, frameWidth, onWidth, onCommit }: {
  width: number;
  frameWidth: number;
  onWidth: (width: number) => void;
  onCommit: (width: number) => void;
}) {
  useLocale();
  const current = useRef({ width, frameWidth, onWidth, onCommit });
  current.current = { width, frameWidth, onWidth, onCommit };
  const start = useRef(width);
  const latest = useRef(width);
  const update = (value: number) => {
    latest.current = clampSidebarWidth(value, current.current.frameWidth);
    current.current.onWidth(latest.current);
  };
  const save = () => current.current.onCommit(latest.current);
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: () => { start.current = current.current.width; latest.current = start.current; },
    onPanResponderMove: (_, gesture) => update(start.current + gesture.dx),
    onPanResponderRelease: save,
    onPanResponderTerminate: save,
  }), []);
  return <Pressable
    {...responder.panHandlers}
    accessibilityRole="adjustable"
    accessibilityHint={t("mobile.resetSidebar")}
    accessibilityLabel={t("sidebarResizeHandle.sidebarWidth")}
    accessibilityValue={{ min: 240, max: clampSidebarWidth(480, frameWidth), now: width }}
    accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
    onAccessibilityAction={event => {
      update(width + (event.nativeEvent.actionName === "increment" ? 16 : -16)); save();
    }}
    onLongPress={() => { update(sidebarDefaultWidth); save(); }}
    style={{ position: "absolute", right: -22, top: 0, bottom: 0, width: 44, zIndex: 10, alignItems: "center", justifyContent: "center" }}
  >
    <View style={{ width: 3, height: 36, borderRadius: 2, backgroundColor: colors.border }} />
  </Pressable>;
}
