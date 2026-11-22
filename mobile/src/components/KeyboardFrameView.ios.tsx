import { useState } from "react";
import { requireNativeView } from "expo";
import { StyleSheet, View, type NativeSyntheticEvent, type ViewProps } from "react-native";

const KeyboardInset = requireNativeView<ViewProps & {
  onInset: (event: NativeSyntheticEvent<{ bottom: number }>) => void;
}>("ZotigoKeyboardInset");

export function KeyboardFrameView({
  style,
  children,
  onKeyboardVisibleChange,
}: ViewProps & { keyboardVerticalOffset?: number; onKeyboardVisibleChange?: (visible: boolean) => void }) {
  const [bottom, setBottom] = useState(0);
  return (
    <View style={style}>
      <KeyboardInset
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        onInset={event => {
          const inset = event.nativeEvent.bottom;
          setBottom(inset);
          onKeyboardVisibleChange?.(inset > 0);
        }}
      />
      <View style={{ flex: 1, paddingBottom: bottom }}>{children}</View>
    </View>
  );
}
