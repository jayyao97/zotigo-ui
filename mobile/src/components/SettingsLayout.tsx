import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { space, styles } from "./ui";

export function SettingsPage({ children }: { children: ReactNode }) {
  return <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, paddingBottom: 40 }}>
    <View style={{ width: "100%", maxWidth: 680, alignSelf: "center", gap: space.xl }}>{children}</View>
  </ScrollView>;
}
