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
  const circumference = 2 * Math.PI * 17;
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
      <Svg width={40} height={40} viewBox="0 0 40 40">
        <Circle
          cx={20}
          cy={20}
          r={17}
          fill="none"
          stroke={colors.border}
          strokeWidth={3}
        />
        <Circle
          cx={20}
          cy={20}
          r={17}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
          rotation={-90}
          origin="20,20"
          strokeLinecap="round"
        />
      </Svg>
      <View pointerEvents="none" style={{ position: "absolute" }}>
        <Text style={{ color, fontSize: 10 }}>{Math.round(ratio * 100)}%</Text>
      </View>
    </Pressable>
  );
}
