import { Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "./ui";
export function ContextUsage({
  tokens,
  window,
  onPress,
}: {
  tokens: number;
  window: number;
  onPress: () => void;
}) {
  const ratio = window > 0 ? Math.max(0, Math.min(1, tokens / window)) : 0;
  const color =
    ratio >= 0.9 ? colors.danger : ratio >= 0.75 ? "#ffb454" : colors.accent;
  const circumference = 2 * Math.PI * 15;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Context usage ${Math.round(ratio * 100)}%`}
      onPress={onPress}
      style={{
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={36} height={36} viewBox="0 0 36 36">
        <Circle
          cx={18}
          cy={18}
          r={15}
          fill="none"
          stroke={colors.border}
          strokeWidth={2.5}
        />
        <Circle
          cx={18}
          cy={18}
          r={15}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
          rotation={-90}
          origin="18,18"
          strokeLinecap="round"
        />
      </Svg>
      <View pointerEvents="none" style={{ position: "absolute" }}>
        <Text style={{ color, fontSize: 10 }}>{Math.round(ratio * 100)}%</Text>
      </View>
    </Pressable>
  );
}
