import type {
  ImageFileSnapshot,
  SaveTextFileInput,
  TextFileSnapshot,
} from "@zotigo/shared/clientTypes";

// Remote paths are opaque daemon paths. Never pass them to a phone filesystem API.
export function daemonPath(input: string): string {
  const path = input.trim();
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path) || path.includes("\0"))
    throw new Error("Enter a path on the daemon, not a URL.");
  return path;
}
export function fileSaveInput(
  file: TextFileSnapshot,
  content: string,
  sessionId?: string,
): SaveTextFileInput {
  if (file.readOnly) throw new Error("This file is read-only.");
  return {
    path: file.path,
    content,
    expectedMtimeMs: file.mtimeMs,
    expectedContentRevision: file.contentRevision,
    sessionId,
  };
}
export function imagePreviewUri(file: ImageFileSnapshot): string {
  // SVG and other active/unsupported formats are deliberately not embedded in a WebView.
  if (
    ![
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/avif",
      "image/bmp",
      "image/x-icon",
    ].includes(file.mediaType)
  ) {
    throw new Error("This image format cannot be previewed on mobile.");
  }
  if (
    file.dataBase64.length > 14 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(file.dataBase64)
  )
    throw new Error("Invalid or oversized image.");
  return `data:${file.mediaType};base64,${file.dataBase64}`;
}
