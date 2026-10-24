import type { LucideIcon } from "lucide-react-native";
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
  selected: "#303030",
  text: "#ededed",
  muted: "#afafaf",
  border: "#383838",
  accent: "#77b7ff",
  danger: "#ff8582",
  green: "#67d391",
};
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  text: { color: colors.text, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  row: {
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.elevated,
  },
  actionText: { color: colors.text, fontSize: 14, fontWeight: "500" },
  title: { color: colors.text, fontSize: 18, fontWeight: "600" },
  section: { gap: 4 },
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
  leading,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={styles.row}
    >
      {leading}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.text} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.muted} numberOfLines={1}>
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

export function IconButton({
  icon: Icon,
  label,
  onPress,
  disabled,
  filled = false,
  outlined = false,
  color,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  filled?: boolean;
  outlined?: boolean;
  color?: string;
  hint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : pressed ? 0.65 : 1,
      })}
    >
      <View
        style={{
          width: filled ? 34 : 36,
          height: filled ? 34 : 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: filled ? colors.text : "transparent",
          borderWidth: outlined ? 1.5 : 0,
          borderColor: colors.border,
        }}
      >
        <Icon
          size={20}
          strokeWidth={1.8}
          color={color ?? (filled ? colors.background : colors.text)}
        />
      </View>
    </Pressable>
  );
}
