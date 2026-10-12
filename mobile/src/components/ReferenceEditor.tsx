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
  const [comment, setComment] = useState(reference.comment);
  return (
    <BottomSheet visible title="Reference" onClose={onClose}>
      <Text selectable style={styles.text}>
        {reference.text}
      </Text>
      <TextField
        label="Comment"
        multiline
        value={comment}
        onChangeText={setComment}
      />
      <Action label="Save comment" onPress={() => onSave(comment)} />
      <Action secondary label="Show original message" onPress={onLocate} />
    </BottomSheet>
  );
}
