import { decodedBase64Size, maxMessageImageBytes } from "./messageImages";

export interface MessageFileInput {
  name: string;
  data_base64: string;
}

export const maxAttachmentBytes = 20 * 1024 * 1024;
export const modelImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function attachmentSizeError(files: Array<{ size: number; image: boolean }>): string | null {
  if (files.length > 5) return "A message can include at most 5 attachments.";
  if (files.some((file) => file.image && file.size > maxMessageImageBytes)) return "Each image must be 5 MiB or smaller.";
  if (files.some((file) => !Number.isSafeInteger(file.size) || file.size < 0)) return "Invalid attachment size.";
  if (files.reduce((sum, file) => sum + file.size, 0) > maxAttachmentBytes) return "Attachments can total at most 20 MiB per message.";
  return null;
}

export function parseMessageFiles(value: unknown): MessageFileInput[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 5) throw new Error("Invalid attachments.");
  const files = value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid attachment.");
    const { name, data_base64 } = item as Record<string, unknown>;
    if (typeof name !== "string" || !name || new TextEncoder().encode(name).length > 180 || /[/\\\x00-\x1f]/.test(name) || name === "." || name === "..") throw new Error("Invalid attachment filename (maximum 180 UTF-8 bytes).");
    if (typeof data_base64 !== "string" || data_base64.length > Math.ceil(maxAttachmentBytes / 3) * 4 || data_base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(data_base64) || (data_base64.includes("=") && !/^[A-Za-z0-9+/]*={1,2}$/.test(data_base64.slice(-4))) || data_base64.slice(0, -2).includes("=")) throw new Error("Invalid attachment data.");
    return { name, data_base64 };
  });
  const error = attachmentSizeError(files.map((file) => ({ size: decodedBase64Size(file.data_base64), image: false })));
  if (error) throw new Error(error);
  return files;
}

export function attachmentReference(name: string, path: string): string {
  const label = name.replace(/[\\\[\]`*_<>]/g, "\\$&");
  return `[${label}](<${encodeURI(path).replace(/[()<>#?:]/g, (char) => encodeURIComponent(char))}>)`;
}
