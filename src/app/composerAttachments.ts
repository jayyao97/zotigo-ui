import { t } from "../../shared/i18n/index";
import type { MessageImageInput } from "../../shared/zotigod";
import { attachmentReference, type MessageFileInput } from "../../shared/messageFiles";
import type { ComposerAttachment } from "../conversation/ConversationComposer";
import type { ComposerDraft } from "./appTypes";

export function revokeDraftAttachments(drafts: Record<string, ComposerDraft>): void {
  for (const draft of Object.values(drafts)) {
    for (const attachment of draft.attachments) {
      if (attachment.url) URL.revokeObjectURL(attachment.url);
    }
  }
}

export async function attachmentToMessageImage(attachment: ComposerAttachment): Promise<MessageImageInput> {
  return {
    mime_type: attachment.mimeType,
    data_base64: await readFileAsBase64(attachment.file),
  };
}

export function appendUploadedReferences(text: string, attachments: ComposerAttachment[]): string {
  const references = attachments.flatMap(file => file.upload?.state === "ready" ? [attachmentReference(file.name, file.upload.path)] : []);
  return references.length ? [text, "Attached files (use tools to read or analyze):", ...references].filter(Boolean).join("\n\n") : text;
}

export async function attachmentToMessageFile(attachment: ComposerAttachment): Promise<MessageFileInput> {
  return { name: attachment.name, data_base64: await readFileAsBase64(attachment.file) };
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = value.indexOf(",");
      resolve(commaIndex >= 0 ? value.slice(commaIndex + 1) : value);
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error(t("app.failedToReadAttachment"))));
    reader.readAsDataURL(file);
  });
}
