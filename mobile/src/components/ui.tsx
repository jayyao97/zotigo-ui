import { useLocale } from "../platform/i18n";
import { t } from "@zotigo/shared/i18n/index";
import type { LucideIcon } from "lucide-react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { colors, radius, space, touch, type } from "../theme";

export { colors, radius, space, type };

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  text: { color: colors.text, ...type.body },
  muted: { color: colors.muted, ...type.footnote },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  action: {
    minHeight: touch,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.elevated,
  },
  actionText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  title: { color: colors.text, ...type.title },
  section: { gap: space.sm },
  sectionTitle: {
    color: colors.muted,
    ...type.section,
    paddingHorizontal: space.xs,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
});

export function Screen({ children }: { children: ReactNode }) {
  useLocale();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { width: "100%", maxWidth: 680, alignSelf: "center" },
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {children}
    </ScrollView>
  );
}

export function TextField({
  label,
  help,
  ...props
}: TextInputProps & { label: string; help?: string }) {
  useLocale();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.muted, { fontWeight: "500" }]}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          props.multiline && { minHeight: 90, textAlignVertical: "top" },
          props.style,
        ]}
      />
      {!!help && <Text style={[styles.muted, { color: colors.faint }]}>{help}</Text>}
    </View>
  );
}

/**
 * Buttons: `primary` is the single main action on a screen, default is a
 * neutral filled button, `secondary` is a borderless text button.
 */
export function Action({
  label,
  onPress,
  disabled,
  danger,
  secondary,
  primary,
  block,
  icon: Icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  secondary?: boolean;
  primary?: boolean;
  block?: boolean;
  icon?: LucideIcon;
}) {
  useLocale();
  const foreground = primary
    ? colors.background
    : danger
      ? colors.danger
      : secondary
        ? colors.accent
        : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        secondary && { backgroundColor: "transparent", paddingHorizontal: space.sm },
        primary && { backgroundColor: colors.text },
        block && { alignSelf: "stretch" },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {Icon && <Icon size={17} strokeWidth={2} color={foreground} />}
        <Text style={[styles.actionText, { color: foreground }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function Notice({ text, error }: { text: string; error?: boolean }) {
  useLocale();
  return text ? (
    <Text
      accessibilityRole={error ? "alert" : undefined}
      style={[
        styles.muted,
        { paddingVertical: space.sm },
        error && { color: colors.danger },
      ]}
    >
      {text}
    </Text>
  ) : null;
}

export function Section({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  useLocale();
  return (
    <View style={styles.section}>
      {!!title && (
        <Text accessibilityRole="header" style={[styles.sectionTitle, { marginTop: space.sm }]}>
          {title}
        </Text>
      )}
      {children}
      {!!footer && (
        <Text style={[styles.muted, { paddingHorizontal: space.xs }]}>{footer}</Text>
      )}
    </View>
  );
}

/** Inset grouped list. Hairline separators are inserted between children. */
export function ListGroup({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {items.map((child, index) => (
        <Fragment key={child.key ?? index}>
          {index > 0 && <View style={[styles.separator, { marginLeft: space.lg }]} />}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

/**
 * A row inside a ListGroup: icon, title, optional detail value and chevron.
 * `right` is decoration inside the row (a check mark). `accessory` is a second
 * control beside it (edit, remove): it sits outside the row's press target so
 * it keeps its own touch area and its own screen-reader element.
 */
export function ListRow({
  title,
  subtitle,
  value,
  icon: Icon,
  onPress,
  disabled,
  danger,
  chevron,
  expanded,
  right,
  accessory,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: LucideIcon;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
  chevron?: boolean;
  expanded?: boolean;
  right?: ReactNode;
  accessory?: ReactNode;
  accessibilityLabel?: string;
}) {
  useLocale();
  const showChevron = chevron ?? (!!onPress && !danger && expanded === undefined);
  const Disclosure = expanded ? ChevronDown : ChevronRight;
  const row = (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{
        disabled: !!disabled,
        ...(expanded === undefined ? {} : { expanded }),
      }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: accessory ? 1 : undefined,
        minHeight: 52,
        paddingLeft: space.lg,
        paddingRight: accessory ? space.sm : space.lg,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        backgroundColor: pressed && onPress ? colors.pressed : "transparent",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      {Icon && (
        <Icon size={19} strokeWidth={1.8} color={danger ? colors.danger : colors.muted} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{ color: danger ? colors.danger : colors.text, ...type.body }}
        >
          {title}
        </Text>
        {!!subtitle && (
          <Text numberOfLines={2} style={styles.muted}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!value && (
        <Text numberOfLines={1} style={[styles.muted, { ...type.callout, maxWidth: "45%" }]}>
          {value}
        </Text>
      )}
      {right}
      {(showChevron || expanded !== undefined) && (
        <Disclosure size={17} color={colors.faint} />
      )}
    </Pressable>
  );
  if (!accessory) return row;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingRight: space.sm }}>
      {row}
      {accessory}
    </View>
  );
}

/** Compact labeled control, used for composer settings such as model and access. */
export function Chip({
  label,
  icon: Icon,
  onPress,
  disabled,
  tone = "default",
  accessibilityLabel,
  fixed = false,
}: {
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
  tone?: "default" | "warning";
  accessibilityLabel?: string;
  /** Keep the full label; neighbouring chips shrink instead. */
  fixed?: boolean;
}) {
  useLocale();
  const color = tone === "warning" ? colors.warning : colors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => ({
        flexShrink: fixed ? 0 : 1,
        minHeight: 32,
        maxWidth: 220,
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        backgroundColor: pressed ? colors.selected : "transparent",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      {Icon && <Icon size={15} strokeWidth={1.9} color={color} />}
      <Text numberOfLines={1} style={{ color, fontSize: 14, fontWeight: "500", flexShrink: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  useLocale();
  return (
    <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: space.xl, gap: space.sm }}>
      {Icon && <Icon size={32} strokeWidth={1.5} color={colors.faint} />}
      <Text style={[styles.title, { textAlign: "center" }]}>{title}</Text>
      {!!message && (
        <Text style={[styles.muted, { ...type.callout, textAlign: "center" }]}>{message}</Text>
      )}
      {action && <View style={{ marginTop: space.md }}>{action}</View>}
    </View>
  );
}

export function Loading() {
  useLocale();
  return <ActivityIndicator color={colors.muted} style={{ padding: space.xl }} />;
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : t("mobile.somethingWentWrong");
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
  useLocale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: touch,
        height: touch,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
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
          borderWidth: outlined ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: colors.border,
        }}
      >
        <Icon
          size={filled ? 19 : 21}
          strokeWidth={filled ? 2.2 : 1.8}
          color={color ?? (filled ? colors.background : colors.text)}
        />
      </View>
    </Pressable>
  );
}
