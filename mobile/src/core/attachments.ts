import {
  attachmentReference,
  attachmentSizeError,
  parseMessageFiles,
  type MessageFileInput,
} from "@zotigo/shared/messageFiles";
import { decodedBase64Size } from "@zotigo/shared/messageImages";
import type { MessageImageInput } from "@zotigo/shared/zotigod";
export interface DraftFile extends MessageFileInput {
  path?: string;
  mimeType?: string;
}
export function validateAttachments(
  images: MessageImageInput[],
  files: DraftFile[],
) {
  parseMessageFiles(files);
  if (
    files.some(
      (file) =>
        (file.path !== undefined &&
          (typeof file.path !== "string" || !file.path.startsWith("/"))) ||
        (file.mimeType !== undefined && typeof file.mimeType !== "string"),
    )
  )
    throw new Error("Invalid saved attachment.");
  const error = attachmentSizeError([
    ...images.map((image) => ({
      size: decodedBase64Size(image.data_base64),
      image: true,
    })),
    ...files.map((file) => ({
      size: decodedBase64Size(file.data_base64),
      image: false,
    })),
  ]);
  if (error) throw new Error(error);
}
export function attachmentPrompt(text: string, files: DraftFile[] = []) {
  if (!files.length) return text;
  if (files.some((file) => !file.path))
    throw new Error("Upload attachments before sending.");
  return [
    text,
    "Attached files (use tools to read or analyze):",
    ...files.map((file) => attachmentReference(file.name, file.path!)),
  ]
    .filter(Boolean)
    .join("\n\n");
}
