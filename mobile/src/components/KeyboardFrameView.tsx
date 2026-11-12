import { View, type ViewProps } from "react-native";

// iOS uses the native keyboard layout guide in KeyboardFrameView.ios.tsx.
export function KeyboardFrameView({ style, children }: ViewProps & { keyboardVerticalOffset?: number; onKeyboardVisibleChange?: (visible: boolean) => void }) {
  return <View style={style}>{children}</View>;
}
