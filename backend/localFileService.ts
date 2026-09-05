import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SaveTextFileInput, TextFileSnapshot } from "../shared/clientTypes";

const maximumPreviewBytes = 5 * 1024 * 1024;
const maximumEditableBytes = 1024 * 1024;

export type LocalPathOpenResult =
  | { kind: "system"; path: string }
  | { kind: "text"; file: TextFileSnapshot };

export async function openAuthorizedLocalPath(requestedPath: string, roots: string[]): Promise<LocalPathOpenResult> {
  const resolved = authorizedExistingPath(requestedPath, roots);
  const stat = await fs.promises.stat(resolved);
  if (!stat.isFile() || stat.size > maximumPreviewBytes) return { kind: "system", path: resolved };

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
