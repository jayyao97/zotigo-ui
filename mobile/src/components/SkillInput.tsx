import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import { TextInput } from "react-native";
import { colors, styles } from "./ui";
export type SkillInputProps = {
  value: string;
  skills: string[];
  editable: boolean;
  caret: number;
  onChange: (value: string) => void;
  onCaret: (caret: number) => void;
};
// UIKit supplies atomic inline tokens on iOS. Other platforms retain plain editing.
export function SkillInput({
  value,
  editable,
  onChange,
  onCaret,
}: SkillInputProps) {
  useLocale();
  return (
    <TextInput
      accessibilityLabel={t("mobile.message")}
      multiline
      editable={editable}
      value={value}
      onChangeText={onChange}
      onSelectionChange={(event) => onCaret(event.nativeEvent.selection.end)}
      placeholder={t("mobile.askZotigo")}
      placeholderTextColor={colors.muted}
      style={[
        styles.input,
        {
          flex: 1,
          minHeight: 44,
          maxHeight: 160,
          borderWidth: 0,
          backgroundColor: "transparent",
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 6,
        },
      ]}
    />
  );
}
