import type { DisplayItem } from "@zotigo/shared/zotigod";
import { userImageUrl } from "@zotigo/shared/codexUserMessage";
import { imagePreviewUri } from "./fileEditor";
import type { DaemonClient } from "./client";

export function userImages(
  item: DisplayItem,
  origin: string,
  sessionId: string,
): string[] {
  const images = [
    ...(item.content ?? []).flatMap((part, index) =>
      part.image?.url ? [{ url: part.image.url, index }] : [],
    ),
    ...(item.command?.images ?? []).map((image) => ({
      url: image.url,
      index: -1,
    })),
  ];
  const seen = new Set<string>();
  return [
    ...new Set(
      images.flatMap(({ url, index }) => {
        if (!url || seen.has(url)) return [];
        seen.add(url);
        const resolved = userImageUrl(
          url,
          origin,
          sessionId,
          item.sequence,
          index,
        );
        return resolved ? [resolved] : [];
      }),
    ),
  ];
}

export async function messageImage(
  client: DaemonClient,
  source: string,
  sessionId: string,
  explicit = false,
): Promise<string | null> {
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(source)) {
    if (source.length > 7 * 1024 * 1024) throw new Error("Image is too large.");
    return source;
  }
  if (/^https?:\/\//i.test(source) || source.startsWith("/sessions/")) {
    const url = new URL(source, client.connection.baseUrl);
    if (url.username || url.password) throw new Error("Untrusted image URL.");
    if (url.origin === client.connection.baseUrl) return client.image(source);
    // Native Image loads external sources without the daemon Authorization header.
    return url.toString();
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(source) || source.startsWith("//"))
    throw new Error("Unsupported image URL.");
  const base = !source.startsWith("/")
    ? (await client.session(sessionId)).working_directory
    : undefined;
  if (!source.startsWith("/") && !base)
    throw new Error("This session has no working directory.");
  const result = await client.openFile(
    source,
    sessionId,
    explicit,
    base ? { basePath: base, baseKind: "directory" } : undefined,
  );
  if (result.kind === "requires_confirmation") return null;
  if (result.kind !== "image")
    throw new Error("This file cannot be previewed as an image.");
  return imagePreviewUri(result.file);
}
