export type ImageSize = { width: number; height: number };
export type ImageOffset = { x: number; y: number };

export function fitImageScale(image: ImageSize, viewport: ImageSize): number {
  return Math.min(1, viewport.width / image.width, viewport.height / image.height);
}

export function clampImageOffset(offset: ImageOffset, image: ImageSize, viewport: ImageSize, scale: number): ImageOffset {
  const x = Math.max(0, (image.width * scale - viewport.width) / 2);
  const y = Math.max(0, (image.height * scale - viewport.height) / 2);
  return { x: x === 0 ? 0 : Math.max(-x, Math.min(x, offset.x)), y: y === 0 ? 0 : Math.max(-y, Math.min(y, offset.y)) };
}
