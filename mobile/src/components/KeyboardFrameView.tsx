import { useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Keyboard,
  Platform,
  type ViewProps,
  type KeyboardEvent,
} from "react-native";
import { keyboardInset, type KeyboardFrame } from "../core/keyboardInset";

/** Keep the mounted screen intact when iOS restores its keyboard from background. */
export function KeyboardFrameView({
  keyboardVerticalOffset = 0,
  style,
  children,
}: ViewProps & { keyboardVerticalOffset?: number }) {
  const [frame, setFrame] = useState({ y: 0, height: 0 });
  const [keyboard, setKeyboard] = useState<KeyboardFrame>();
  const active = useRef(AppState.currentState === "active");
  const duration = useRef(0);
  const bottom = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const show = (event: KeyboardEvent) => {
      if (!active.current) return;
      duration.current = event.duration;
      setKeyboard(event.endCoordinates);
    };
    const hide = (event: KeyboardEvent) => {
      duration.current = active.current ? event.duration : 0;
      setKeyboard(undefined);
    };
    const subscriptions = [
      Keyboard.addListener("keyboardWillShow", show),
      Keyboard.addListener("keyboardDidShow", show),
      Keyboard.addListener("keyboardWillHide", hide),
      Keyboard.addListener("keyboardDidHide", hide),
      AppState.addEventListener("change", (state) => {
        active.current = state === "active";
        duration.current = 0;
        setKeyboard(active.current ? Keyboard.metrics() : undefined);
      }),
    ];
    if (active.current) setKeyboard(Keyboard.metrics());
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [bottom]);
  const inset = keyboardInset(frame, keyboard, keyboardVerticalOffset);
  useEffect(() => {
    // Local animation: do not apply a global LayoutAnimation to timeline rows.
    const animation = Animated.timing(bottom, {
      toValue: inset,
      duration: duration.current,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [bottom, inset]);
  return (
    <Animated.View
      style={[style, { paddingBottom: bottom }]}
      onLayout={({ nativeEvent }) => setFrame(nativeEvent.layout)}
    >
      {children}
    </Animated.View>
  );
}
