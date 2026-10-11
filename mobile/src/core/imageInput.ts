import type { MessageImageInput } from "@zotigo/shared/zotigod";
import {
  decodedBase64Size,
  maxMessageImageBytes,
} from "@zotigo/shared/messageImages";

// Picker metadata describes the source asset; exported bytes may be re-encoded.
// Sniff only supported raster signatures. The daemon validates image decoding.
export function pickedImageInput(asset: {
  base64?: string | null;
}): MessageImageInput {
  const data = asset.base64;
  if (!data) throw new Error("Image data was unavailable.");
  if (decodedBase64Size(data) > maxMessageImageBytes)
    throw new Error("Each image must be 5 MiB or smaller.");
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
    throw new Error("The selected image contains invalid Base64 data.");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes: number[] = [];
  // Decode the first 16 bytes only, avoiding a second full-size image allocation.
  for (let i = 0; i < Math.min(data.length, 24); i += 4) {
    const a = alphabet.indexOf(data[i]),
      b = alphabet.indexOf(data[i + 1]);
    const c = alphabet.indexOf(data[i + 2]),
      d = alphabet.indexOf(data[i + 3]);
    bytes.push((a << 2) | (b >> 4));
    if (c >= 0) bytes.push(((b & 15) << 4) | (c >> 2));
    if (d >= 0) bytes.push(((c & 3) << 6) | d);
  }
  const starts = (signature: number[], offset = 0) =>
    signature.every((byte, i) => bytes[offset + i] === byte);
  let mime: MessageImageInput["mime_type"];
  if (starts([0xff, 0xd8, 0xff]) && bytes.length >= 4) mime = "image/jpeg";
  else if (
    starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
    bytes.length >= 16
  )
    mime = "image/png";
  else if (
    starts([0x52, 0x49, 0x46, 0x46]) &&
    starts([0x57, 0x45, 0x42, 0x50], 8) &&
    bytes.length >= 16
  )
    mime = "image/webp";
  else
    throw new Error(
      "The selected image data is not PNG, JPEG or WebP. Export it in one of those formats and try again.",
    );
  return { mime_type: mime, data_base64: data };
}
