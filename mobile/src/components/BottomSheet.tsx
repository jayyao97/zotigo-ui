import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import X from "lucide-react-native/icons/x";
import Check from "lucide-react-native/icons/check";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { colors, IconButton, styles } from "./ui";

/** Keep the underlying conversation visible; long pickers scroll inside the sheet. */
export function BottomSheet({
  visible,
  title,
  onClose,
  children,
  disabled = false,
  scroll = true,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  disabled?: boolean;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!disabled) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
          disabled={disabled}
          onPress={onClose}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.35)",
          }}
        />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "75%",
            backgroundColor: colors.surface,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            borderWidth: 1,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12),
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: 20,
              paddingRight: 8,
              paddingTop: 8,
            }}
          >
            <Text
              accessibilityRole="header"
              style={[styles.title, { flex: 1 }]}
            >
              {title}
            </Text>
            <IconButton
              icon={X}
              label="Close sheet"
              disabled={disabled}
              onPress={onClose}
            />
          </View>
          {scroll ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ padding: 16, gap: 8 }}
            >
              {children}
            </ScrollView>
          ) : (
            <View
              style={{
                flexShrink: 1,
                paddingHorizontal: 16,
                paddingBottom: 12,
                gap: 8,
              }}
            >
              {children}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ChoiceRow({
  title,
  subtitle,
  selected,
  onPress,
  disabled = false,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <Pressable
      accessibilityRole={selected === undefined ? "button" : "radio"}
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        borderRadius: 12,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor:
          selected || pressed ? colors.selected : "transparent",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      {Icon && <Icon size={20} color={colors.muted} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.text}>{title}</Text>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      </View>
      {selected === undefined ? (
        <ChevronRight size={17} color={colors.muted} />
      ) : selected ? (
        <Check size={18} color={colors.accent} />
      ) : null}
    </Pressable>
  );
}
