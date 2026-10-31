import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { colors, styles } from "./ui";

export function SettingsPage({ children }: { children: ReactNode }) {
  return <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
    <View style={{ width: "100%", maxWidth: 680, alignSelf: "center", gap: 24 }}>{children}</View>
  </ScrollView>;
}
export function SettingsGroup({ children, form = false }: { children: ReactNode; form?: boolean }) {
  return <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: form ? 16 : 0, gap: form ? 16 : 0, overflow: "hidden" }}>{children}</View>;
}
export function SettingRow({ title, subtitle, value, onPress, last = false, expanded, right }: { title: string; subtitle?: string; value?: string; onPress?: () => void; last?: boolean; expanded?: boolean; right?: ReactNode }) {
  return <Pressable accessibilityRole={onPress ? "button" : undefined} accessibilityState={expanded === undefined ? undefined : { expanded }} onPress={onPress} style={({ pressed }) => ({ minHeight: 64, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: last ? 0 : 1, borderColor: colors.border, opacity: pressed && onPress ? 0.65 : 1 })}>
    <View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>{title}</Text>{!!subtitle && <Text style={styles.muted}>{subtitle}</Text>}</View>
    {!!value && <Text numberOfLines={1} style={[styles.muted, { maxWidth: "42%" }]}>{value}</Text>}
    {right}
    {!!onPress && (expanded ? <ChevronDown size={16} color={colors.muted} /> : <ChevronRight size={16} color={colors.muted} />)}
  </Pressable>;
}
