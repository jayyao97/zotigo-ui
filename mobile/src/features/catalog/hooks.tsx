import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "../../platform/i18n";
import { Action, colors, errorText, space, styles } from "../../components/ui";

// Focus-bound reads cannot commit after a route blur, host replacement, or newer refresh.
export function useCatalogLoad<T>(load: () => Promise<T>, poll = false) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const active = useRef(false);
  const inFlight = useRef(0);
  const refresh = useCallback(
    async (silent = false) => {
      if (silent && inFlight.current > 0) return;
      inFlight.current++;
      const ticket = ++generation.current;
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const result = await load();
        if (active.current && ticket === generation.current) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (active.current && ticket === generation.current)
          setError(errorText(e));
      } finally {
        inFlight.current--;
        if (active.current && ticket === generation.current) setLoading(false);
      }
    },
    [load],
  );
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      void refresh();
      const timer = poll
        ? setInterval(() => {
            if (AppState.currentState === "active") void refresh(true);
          }, 10000)
        : undefined;
      return () => {
        if (timer) clearInterval(timer);
        active.current = false;
        generation.current++;
      };
    }, [refresh, poll]),
  );
  return { data, error, loading, refresh: () => refresh() };
}
export function useMutation() {
  const lock = useRef(false);
  const alive = useRef(true);
  const focused = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const isCurrent = () => alive.current && focused.current;
  const run = async (work: () => Promise<unknown>) => {
    if (lock.current || !isCurrent()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (alive.current) setError(errorText(e));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return { busy, error, run, isCurrent };
}
/** Title row of a page-sheet modal with its single dismiss action. */
export function SheetHeader({
  title,
  action,
  disabled,
  onAction,
}: {
  title: string;
  action: string;
  disabled?: boolean;
  onAction: () => void;
}) {
  useLocale();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Action label={action} secondary disabled={disabled} onPress={onAction} />
    </View>
  );
}
export function Footer({ children }: { children: ReactNode }) {
  useLocale();
  const insets = useSafeAreaInsets();
  return (
    <View style={[footerStyle, { paddingBottom: Math.max(16, insets.bottom) }]}>
      {children}
    </View>
  );
}
const footerStyle = {
  paddingHorizontal: space.lg,
  paddingTop: space.sm,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: colors.border,
  backgroundColor: colors.background,
};
