import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
export const colors = {
  background: "#181818",
  surface: "#212121",
  elevated: "#282828",
  text: "#ededed",
  muted: "#afafaf",
  border: "#383838",
  accent: "#77b7ff",
  danger: "#ff8582",
  green: "#67d391",
};
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  text: { color: colors.text, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  row: {
    minHeight: 56,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    color: colors.text,
    padding: 12,
    fontSize: 16,
  },
  action: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.elevated,
  },
  actionText: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  title: { color: colors.text, fontSize: 22, fontWeight: "600" },
  section: { gap: 10 },
});
export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {children}
    </ScrollView>
  );
}
export function TextField({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.muted}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          props.multiline && { minHeight: 90, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function Action({
  label,
  onPress,
  disabled,
  danger,
  secondary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        secondary && { backgroundColor: "transparent" },
        { opacity: disabled ? 0.4 : pressed ? 0.65 : 1 },
      ]}
    >
      <Text style={[styles.actionText, danger && { color: colors.danger }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Row({
  title,
  subtitle,
  onPress,
  right,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={styles.row}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.text} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.muted} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}
export function Notice({ text, error }: { text: string; error?: boolean }) {
  return text ? (
    <Text
      accessibilityRole={error ? "alert" : undefined}
      style={[
        styles.muted,
        { paddingVertical: 8 },
        error && { color: colors.danger },
      ]}
    >
      {text}
    </Text>
  ) : null;
}
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.muted, { fontWeight: "600", marginTop: 8 }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}
export function Loading() {
  return <ActivityIndicator color={colors.accent} style={{ padding: 24 }} />;
}
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
