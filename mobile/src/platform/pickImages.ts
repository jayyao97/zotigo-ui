import { t } from "@zotigo/shared/i18n/index";
import {
  decodedBase64Size,
  maxMessageImageCount,
  messageImageSizeError,
} from "@zotigo/shared/messageImages";
import type { MessageImageInput } from "@zotigo/shared/zotigod";
import * as ImagePicker from "expo-image-picker";
import { validateAttachments, type DraftFile } from "../core/attachments";
import { pickedImageInput } from "../core/imageInput";

/**
 * Adds images from the photo library or a new camera photo to a draft's
 * attachments. Both composers (a conversation and a new conversation) use
 * this, so they offer the same sources and apply the same limits. Returns
 * undefined when the user cancels.
 */
export async function pickImages(
  source: "library" | "camera",
  images: MessageImageInput[],
  files: DraftFile[],
): Promise<MessageImageInput[] | undefined> {
  let result: ImagePicker.ImagePickerResult;
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error(t("mobile.cameraDenied"));
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], base64: true, quality: 0.8 });
  } else
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, maxMessageImageCount - images.length - files.length),
    });
  if (result.canceled) return;
  const next = [...images, ...result.assets.map(pickedImageInput)];
  const sizeError = messageImageSizeError(next.map((image) => decodedBase64Size(image.data_base64)));
  if (sizeError) throw new Error(sizeError);
  validateAttachments(next, files);
  return next;
}
