import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import X from "lucide-react-native/icons/x";
import type { MessageImageInput } from "@zotigo/shared/zotigod";
import { BottomSheet } from "./BottomSheet";
import { IconButton } from "./ui";
export function DraftImages({
  images,
  disabled,
  onRemove,
}: {
  images: MessageImageInput[];
  disabled: boolean;
  onRemove: (index: number) => void;
}) {
  const [preview, setPreview] = useState<MessageImageInput>();
  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {images.map((image, index) => (
          <View key={index}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Preview draft image ${index + 1}`}
              onPress={() => setPreview(image)}
            >
              <Image
                source={{
                  uri: `data:${image.mime_type};base64,${image.data_base64}`,
                }}
                style={{ width: 48, height: 48, borderRadius: 8 }}
              />
            </Pressable>
            <IconButton
              icon={X}
              label={`Remove image ${index + 1}`}
              disabled={disabled}
              onPress={() => onRemove(index)}
            />
          </View>
        ))}
      </View>
      <BottomSheet
        visible={!!preview}
        title="Image preview"
        onClose={() => setPreview(undefined)}
      >
        {preview && (
          <Image
            source={{
              uri: `data:${preview.mime_type};base64,${preview.data_base64}`,
            }}
            style={{ width: "100%", height: 280 }}
            resizeMode="contain"
          />
        )}
      </BottomSheet>
    </>
  );
}
