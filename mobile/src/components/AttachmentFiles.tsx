import { useState } from "react";
import { FlatList, Image, Text, View } from "react-native";
import FileIcon from "lucide-react-native/icons/file";
import X from "lucide-react-native/icons/x";
import type { DraftFile } from "../core/attachments";
import { decodedBase64Size } from "@zotigo/shared/messageImages";
import { BottomSheet } from "./BottomSheet";
import { VideoPreview } from "./VideoPreview";
import { IconButton, Row, Notice, styles } from "./ui";
export function AttachmentFiles({
  files,
  disabled,
  onRemove,
}: {
  files: DraftFile[];
  disabled: boolean;
  onRemove: (index: number) => void;
}) {
  const [preview, setPreview] = useState<DraftFile>();
  if (!files.length) return null;
  const mediaType =
    preview?.mimeType ||
    (/\.(mp4|m4v)$/i.test(preview?.name ?? "")
      ? "video/mp4"
      : /\.mov$/i.test(preview?.name ?? "")
        ? "video/quicktime"
        : "");
  const text =
    preview &&
    (/^text\//.test(mediaType) ||
      /\.(md|json|csv|log|ya?ml|tsx?|jsx?|py|go)$/i.test(preview.name))
      ? new TextDecoder().decode(
          Uint8Array.from(atob(preview.data_base64.slice(0, 8192)), (char) =>
            char.charCodeAt(0),
          ),
        )
      : "";
  return (
    <>
      <FlatList
        style={{ maxHeight: 136 }}
        data={files}
        keyExtractor={(_, index) => String(index)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <FileIcon size={18} color="#aaa" />
            <View style={{ flex: 1 }}>
              <Row
                title={item.name}
                subtitle={`${Math.ceil(decodedBase64Size(item.data_base64) / 1024)} KiB · ${item.path ? "Uploaded" : "Ready to upload"}`}
                onPress={() => setPreview(item)}
              />
            </View>
            <IconButton
              icon={X}
              label={`Remove ${item.name}`}
              disabled={disabled}
              onPress={() => onRemove(index)}
            />
          </View>
        )}
      />
      <BottomSheet
        visible={!!preview}
        title={preview?.name ?? "Attachment"}
        onClose={() => setPreview(undefined)}
      >
        {preview &&
          (mediaType.startsWith("video/") ? (
            <VideoPreview data={preview.data_base64} mediaType={mediaType} />
          ) : mediaType.startsWith("image/") &&
            mediaType !== "image/svg+xml" ? (
            <Image
              source={{
                uri: `data:${mediaType};base64,${preview.data_base64}`,
              }}
              style={{ width: "100%", height: 260 }}
              resizeMode="contain"
            />
          ) : text ? (
            <Text selectable style={styles.text}>
              {text}
            </Text>
          ) : (
            <Notice text="This file can be attached; a preview is not available." />
          ))}
      </BottomSheet>
    </>
  );
}
