import { requireNativeView } from "expo";
import { t } from "@zotigo/shared/i18n/index";
import { useMemo, useState } from "react";
import { useLocale } from "../platform/i18n";
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
  /** `menu` is a long press: offer the link's actions rather than opening it. */
  onLink: (url: string, menu?: boolean) => boolean;
  onAction?: (action: SelectionAction) => void;
  onSelecting?: () => void;
};
const NativeText = requireNativeView<
  ViewProps & {
    allowReference: boolean;
    menuTitles: Record<"reference" | "copy" | "translate", string>;
    highlight?: string;
    runs: SelectionRun[];
    fontSize: number;
    lineHeight: number;
    textColor: string;
    linkColor: string;
    onMeasure: (
      e: NativeSyntheticEvent<{ height: number; width: number }>,
    ) => void;
    onLink: (e: NativeSyntheticEvent<{ url: string; menu?: boolean }>) => void;
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
  const locale = useLocale();
  const menuTitles = useMemo(
    () => ({
      reference: t("conversationTools.addToConversation"),
      copy: t("app.copy"),
      translate: t("conversationTools.translate"),
    }),
    [locale],
  );
  const [size, setSize] = useState({ height: lineHeight, width: 0 });
  return (
    <NativeText
      {...props}
      allowReference={allowReference}
      menuTitles={menuTitles}
      fontSize={fontSize}
      lineHeight={lineHeight}
      style={{
        height: size.height,
        width: fitContent && size.width > 0 ? size.width : "100%",
        maxWidth: "100%",
      }}
      onMeasure={(e) => setSize(e.nativeEvent)}
      onLink={(e) => onLink(e.nativeEvent.url, !!e.nativeEvent.menu)}
      onAction={(e) => onAction?.(e.nativeEvent)}
      onSelecting={() => onSelecting?.()}
    />
  );
}
