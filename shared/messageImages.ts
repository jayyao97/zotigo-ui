export const maxMessageImageCount = 5;
export const maxMessageImageBytes = 5 * 1024 * 1024;
export const maxMessageTotalImageBytes = 20 * 1024 * 1024;

export function messageImageSizeError(sizes: number[]): string | null {
  if (sizes.length > maxMessageImageCount) {
    return `A message can include at most ${maxMessageImageCount} images.`;
  }
  if (sizes.some((size) => size > maxMessageImageBytes)) {
    return "Each image must be 5 MiB or smaller.";
  }
  if (sizes.reduce((total, size) => total + size, 0) > maxMessageTotalImageBytes) {
    return "Images can total at most 20 MiB per message.";
  }
  return null;
}

export function decodedBase64Size(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}
