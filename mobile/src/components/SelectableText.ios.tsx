import { requireNativeView } from "expo";
import { useState } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";
import type { SelectionRun, SelectionAction } from "../core/selectionRuns";
export type SelectableTextProps = {
  highlight?: string;
  runs: SelectionRun[];
  fontSize?: number;
  lineHeight?: number;
  textColor: string;
  linkColor: string;
  onLink: (url: string) => boolean;
  onAction?: (action: SelectionAction) => void;
  onSelecting?: () => void;
};
const NativeText = requireNativeView<
  ViewProps & {
    highlight?: string;
    runs: SelectionRun[];
    fontSize: number;
    lineHeight: number;
    textColor: string;
    linkColor: string;
    onMeasure: (e: NativeSyntheticEvent<{ height: number }>) => void;
    onLink: (e: NativeSyntheticEvent<{ url: string }>) => void;
    onAction: (e: NativeSyntheticEvent<SelectionAction>) => void;
    onSelecting: () => void;
  }
>("ZotigoSelectableText");
export function SelectableText({
  fontSize = 16,
  lineHeight = 26,
  onLink,
  onAction,
  onSelecting,
  ...props
}: SelectableTextProps) {
  const [height, setHeight] = useState(lineHeight);
  return (
    <NativeText
      {...props}
      fontSize={fontSize}
      lineHeight={lineHeight}
      style={{ height, width: "100%" }}
      onMeasure={(e) => setHeight(e.nativeEvent.height)}
      onLink={(e) => onLink(e.nativeEvent.url)}
      onAction={(e) => onAction?.(e.nativeEvent)}
      onSelecting={() => onSelecting?.()}
    />
  );
}
