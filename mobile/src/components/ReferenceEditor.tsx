import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import { useState } from "react";
import { Text } from "react-native";
import type { ConversationReference } from "../core/conversationReferences";
import { BottomSheet } from "./BottomSheet";
import { Action, TextField, styles } from "./ui";
export function ReferenceEditor({
  reference,
  onSave,
  onLocate,
  onClose,
}: {
  reference: ConversationReference;
  onSave: (comment: string) => void;
  onLocate: () => void;
  onClose: () => void;
}) {
  useLocale();
  const [comment, setComment] = useState(reference.comment);
  return (
    <BottomSheet visible title={t("app.reference")} onClose={onClose}>
      <Text selectable style={styles.text}>
        {reference.text}
      </Text>
      <TextField
        label={t("mobile.comment")}
        multiline
        value={comment}
        onChangeText={setComment}
      />
      <Action label={t("mobile.saveComment")} onPress={() => onSave(comment)} />
      <Action secondary label={t("mobile.showOriginalMessage")} onPress={onLocate} />
    </BottomSheet>
  );
}
