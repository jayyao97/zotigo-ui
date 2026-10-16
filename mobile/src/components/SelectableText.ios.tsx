import { requireNativeView } from "expo";
import { useState } from "react";
import type { NativeSyntheticEvent, ViewProps } from "react-native";
import type { SelectionRun, SelectionAction } from "../core/selectionRuns";
export type SelectableTextProps = {
  fitContent?: boolean;
  allowReference?: boolean;
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
    allowReference: boolean;
    highlight?: string;
    runs: SelectionRun[];
    fontSize: number;
    lineHeight: number;
    textColor: string;
    linkColor: string;
    onMeasure: (
      e: NativeSyntheticEvent<{ height: number; width: number }>,
    ) => void;
    onLink: (e: NativeSyntheticEvent<{ url: string }>) => void;
    onAction: (e: NativeSyntheticEvent<SelectionAction>) => void;
    onSelecting: () => void;
  }
>("ZotigoSelectableText");
export function SelectableText({
  fitContent = false,
  allowReference = true,
  fontSize = 16,
  lineHeight = 26,
  onLink,
  onAction,
  onSelecting,
  ...props
}: SelectableTextProps) {
  const [size, setSize] = useState({ height: lineHeight, width: 0 });
  return (
    <NativeText
      {...props}
      allowReference={allowReference}
      fontSize={fontSize}
      lineHeight={lineHeight}
      style={{
        height: size.height,
        width: fitContent && size.width > 0 ? size.width : "100%",
        maxWidth: "100%",
      }}
      onMeasure={(e) => setSize(e.nativeEvent)}
      onLink={(e) => onLink(e.nativeEvent.url)}
      onAction={(e) => onAction?.(e.nativeEvent)}
      onSelecting={() => onSelecting?.()}
    />
  );
}
