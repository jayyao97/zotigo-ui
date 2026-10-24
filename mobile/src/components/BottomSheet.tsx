import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import type { LucideIcon } from "lucide-react-native";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
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
  onDismiss,
  children,
  disabled = false,
  scroll = true,
  anchorRef,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onDismiss?: () => void;
  children: ReactNode;
  disabled?: boolean;
  scroll?: boolean;
  anchorRef?: RefObject<View | null>;
}) {
  useLocale();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= 768;
  const [positioned, setPositioned] = useState(false);
  const [anchor, setAnchor] = useState<{
    x: number;
    width: number;
  }>();
  useEffect(() => {
    // Native Modal keeps its content mounted during the dismiss animation.
    if (!visible) {
      setPositioned(false);
      return;
    }
    if (!wide || !anchorRef) {
      setAnchor(undefined);
      return;
    }
    let active = true;
    const measure = () =>
      anchorRef.current?.measureInWindow((x, _y, w) => {
        if (active && w > 0) {
          setAnchor({ x, width: w });
          setPositioned(true);
        }
      });
    const frame = requestAnimationFrame(measure);
    const keyboard = Keyboard.addListener("keyboardDidHide", measure);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      keyboard.remove();
    };
  }, [visible, wide, width, height, anchorRef]);
  const anchored = wide && anchor && (!visible || anchorRef);
  const panelWidth = anchored
    ? Math.min(anchor.width, width - 24)
    : undefined;
  return (
    <Modal
      visible={visible && (!wide || !anchorRef || positioned)}
      transparent
      animationType="slide"
      onDismiss={onDismiss}
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
          accessibilityLabel={t("mobile.dismissSheet")}
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
            position: anchored ? "absolute" : undefined,
            left: anchored
              ? Math.max(
                  12,
                  Math.min(
                    width - panelWidth! - 12,
                    anchor.x + anchor.width - panelWidth!,
                  ),
                )
              : undefined,
            bottom: anchored ? 0 : undefined,
            width: panelWidth ?? "100%",
            maxWidth: wide && !anchored ? 560 : undefined,
            alignSelf: "center",
            marginBottom: anchored ? 0 : wide ? Math.max(insets.bottom, 24) : 0,
            borderBottomLeftRadius: wide && !anchored ? 26 : 0,
            borderBottomRightRadius: wide && !anchored ? 26 : 0,
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
              label={t("mobile.closeSheet")}
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
  useLocale();
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
        backgroundColor: selected || pressed ? colors.selected : "transparent",
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
