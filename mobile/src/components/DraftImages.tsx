import { t } from "@zotigo/shared/i18n/index";
import { useLocale } from "../platform/i18n";
import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import X from "lucide-react-native/icons/x";
import type { MessageImageInput } from "@zotigo/shared/zotigod";
import { BottomSheet } from "./BottomSheet";
import { colors, radius } from "./ui";
export function DraftImages({
  images,
  disabled,
  onRemove,
}: {
  images: MessageImageInput[];
  disabled: boolean;
  onRemove: (index: number) => void;
}) {
  useLocale();
  const [preview, setPreview] = useState<MessageImageInput>();
  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {images.map((image, index) => (
          <View key={index} style={{ width: 60, height: 60, justifyContent: "flex-end" }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("mobile.previewDraftImageValue", {p0: index + 1})}
              onPress={() => setPreview(image)}
            >
              <Image
                source={{
                  uri: `data:${image.mime_type};base64,${image.data_base64}`,
                }}
                style={{ width: 52, height: 52, borderRadius: radius.md }}
              />
            </Pressable>
            {/* Small visual badge, full 44pt target via hitSlop. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("inputQueue.removeImage", {p0: index + 1})}
              disabled={disabled}
              hitSlop={12}
              onPress={() => onRemove(index)}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 22,
                height: 22,
                borderRadius: 11,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.selected,
                borderWidth: 2,
                borderColor: colors.background,
                opacity: disabled ? 0.4 : 1,
              }}
            >
              <X size={12} strokeWidth={2.5} color={colors.text} />
            </Pressable>
          </View>
        ))}
      </View>
      <BottomSheet
        visible={!!preview}
        title={t("mobile.imagePreview")}
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
