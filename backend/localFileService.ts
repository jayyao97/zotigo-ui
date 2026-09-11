import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ImageFileSnapshot, SaveTextFileInput, TextFileSnapshot } from "../shared/clientTypes";

const maximumPreviewBytes = 5 * 1024 * 1024;
const maximumEditableBytes = 1024 * 1024;
const maximumImagePreviewBytes = 10 * 1024 * 1024;
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".ico", ".svg"]);

export type LocalPathOpenResult =
  | { kind: "system"; path: string }
  | { kind: "directory"; path: string }
  | { kind: "text"; file: TextFileSnapshot }
  | { kind: "image"; file: ImageFileSnapshot };

export async function openAuthorizedLocalPath(requestedPath: string, roots: string[]): Promise<LocalPathOpenResult> {
  const resolved = authorizedExistingPath(requestedPath, roots);
  const stat = await fs.promises.stat(resolved);
  if (stat.isDirectory()) return { kind: "directory", path: resolved };
  if (!stat.isFile()) return { kind: "system", path: resolved };

  const extension = path.extname(resolved).toLowerCase();
  if (imageExtensions.has(extension) && stat.size <= maximumImagePreviewBytes) {
    const data = await fs.promises.readFile(resolved);
    const mediaType = imageMediaType(extension, data);
    if (mediaType) {
      return {
        kind: "image",
        file: {
          path: resolved,
          name: path.basename(resolved),
          mediaType,
          dataBase64: data.toString("base64"),
          sizeBytes: stat.size,
          mtimeMs: stat.mtimeMs,
        },
      };
    }
  }
  if (stat.size > maximumPreviewBytes) return { kind: "system", path: resolved };

  const buffer = await fs.promises.readFile(resolved);
  if (buffer.includes(0)) return { kind: "system", path: resolved };
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return { kind: "system", path: resolved };
  }

  return {
    kind: "text",
    file: {
      path: resolved,
      name: path.basename(resolved),
      content,
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
      readOnly: stat.size > maximumEditableBytes,
    },
  };
}

export function imageMediaType(extension: string, data: Uint8Array): string | null {
  const prefix = (...bytes: number[]) => bytes.every((value, index) => data[index] === value);
  const ascii = (start: number, end: number) => Buffer.from(data.subarray(start, end)).toString("ascii");
  switch (extension.toLowerCase()) {
    case ".png": return prefix(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ? "image/png" : null;
    case ".jpg":
    case ".jpeg": return prefix(0xff, 0xd8, 0xff) ? "image/jpeg" : null;
    case ".gif": return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a" ? "image/gif" : null;
    case ".webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP" ? "image/webp" : null;
    case ".avif": return ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12)) ? "image/avif" : null;
    case ".bmp": return ascii(0, 2) === "BM" ? "image/bmp" : null;
    case ".ico": return prefix(0, 0, 1, 0) ? "image/x-icon" : null;
    case ".svg": {
      try {
        let source = new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^\uFEFF?\s*<\?xml[^>]*>\s*/i, "");
        for (;;) {
          const next = source
            .replace(/^\s*<!--[\s\S]*?-->\s*/, "")
            .replace(/^\s*<!DOCTYPE(?:[^>\[]|\[[\s\S]*?\])*>\s*/i, "");
          if (next === source) break;
          source = next;
        }
        return /^<svg(?:\s|>)/i.test(source) ? "image/svg+xml" : null;
      } catch {
        return null;
      }
    }
    default: return null;
  }
}

export async function saveAuthorizedTextFile(input: SaveTextFileInput, roots: string[]): Promise<TextFileSnapshot> {
  const resolved = authorizedExistingPath(input.path, roots);
  const stat = await fs.promises.stat(resolved);
  if (!stat.isFile()) throw new Error("Only files can be saved.");
  if (stat.size > maximumEditableBytes) throw new Error("Large files are read-only.");
  if (stat.mtimeMs !== input.expectedMtimeMs) throw new Error("File changed on disk. Reopen it before saving.");
  if (Buffer.byteLength(input.content, "utf8") > maximumEditableBytes) throw new Error("File is too large to save in Zotigo.");

  await fs.promises.writeFile(resolved, input.content, "utf8");
  const saved = await openAuthorizedLocalPath(resolved, roots);
  if (saved.kind !== "text") throw new Error("Saved file is no longer readable as text.");
  return saved.file;
}

export function resolveLocalPathReference(
  reference: string,
  basePath: string | null,
  baseKind: "directory" | "file",
): string {
  const localPath = reference.startsWith("file:") ? fileURLToPath(reference) : reference;
  if (path.isAbsolute(localPath)) return path.resolve(localPath);
  if (!basePath) throw new Error("Relative file link has no working directory.");
  const baseDirectory = baseKind === "file" ? path.dirname(basePath) : basePath;
  return path.resolve(baseDirectory, localPath);
}

export function authorizedExistingPath(requestedPath: string, roots: string[]): string {
  if (!fs.existsSync(requestedPath)) throw new Error("Path does not exist.");
  const resolved = fs.realpathSync(requestedPath);
  if (!roots.some((root) => fs.existsSync(root) && isPathInsideRoot(root, resolved))) {
    throw new Error("Path is outside the current Zotigo workspace.");
  }
  return resolved;
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const parent = fs.realpathSync(root);
  const child = fs.realpathSync(candidate);
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
