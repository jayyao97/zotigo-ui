import { Text } from "react-native";
import type { SelectableTextProps } from "./SelectableText.ios";
// Android/Web retain the platform text-selection menu; iOS supplies custom actions.
export function SelectableText({
  runs,
  fontSize = 16,
  lineHeight = 26,
  textColor,
  linkColor,
  onLink,
  highlight,
}: SelectableTextProps) {
  return (
    <Text selectable style={{ fontSize, lineHeight, color: textColor }}>
      {runs.map((run, index) => (
        <Text
          key={index}
          onPress={run.link ? () => onLink(run.link!) : undefined}
          style={{
            fontWeight: run.bold ? "600" : "400",
            fontStyle: run.italic ? "italic" : "normal",
            fontFamily: run.code ? "monospace" : undefined,
            backgroundColor: run.code ? "#282828" : undefined,
            color: run.link ? linkColor : textColor,
            textDecorationLine: run.link
              ? "underline"
              : run.strike
                ? "line-through"
                : "none",
          }}
        >
          {highlight
            ? run.text
                .split(
                  new RegExp(
                    `(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
                    "gi",
                  ),
                )
                .map((part, i) => (
                  <Text
                    key={i}
                    style={
                      part.toLocaleLowerCase() === highlight.toLocaleLowerCase()
                        ? { backgroundColor: "#865719" }
                        : undefined
                    }
                  >
                    {part}
                  </Text>
                ))
            : run.text}
        </Text>
      ))}
    </Text>
  );
}
