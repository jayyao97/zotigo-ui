import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import {
  maxAttachmentBytes,
  modelImageTypes,
} from "@zotigo/shared/messageFiles";
import type { MessageImageInput } from "@zotigo/shared/zotigod";
import { pickedImageInput } from "../core/imageInput";
import { validateAttachments, type DraftFile } from "../core/attachments";
export async function pickAttachments(
  images: MessageImageInput[],
  files: DraftFile[],
) {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return;
  const cached = result.assets.map((asset) =>
    Platform.OS === "web" ? undefined : new File(asset.uri),
  );
  try {
    if (images.length + files.length + result.assets.length > 5)
      throw new Error("A message can include at most 5 attachments.");
    const nextImages = [...images],
      nextFiles = [...files];
    for (const [index, asset] of result.assets.entries()) {
      const file = cached[index];
      const size = asset.size ?? file?.size;
      if (size == null || size > maxAttachmentBytes)
        throw new Error("Attachments can total at most 20 MiB per message.");
      const base64 = file
        ? await file.base64()
        : asset.base64?.replace(/^data:[^,]*,/, "");
      if (!base64) throw new Error("Could not read the selected file.");
      if (modelImageTypes.has(asset.mimeType ?? ""))
        nextImages.push(pickedImageInput({ base64 }));
      else
        nextFiles.push({
          name: asset.name,
          data_base64: base64,
          mimeType: asset.mimeType,
        });
      validateAttachments(nextImages, nextFiles);
    }
    return { images: nextImages, files: nextFiles };
  } finally {
    for (const file of cached) if (file?.exists) file.delete();
  }
}
