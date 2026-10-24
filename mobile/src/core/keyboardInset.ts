export type KeyboardFrame = { screenY: number; height: number };

export function keyboardInset(
  frame: { y: number; height: number },
  keyboard: KeyboardFrame | undefined,
  verticalOffset: number,
): number {
  // App/keyboard transitions can briefly report an offscreen or zero frame.
  // Never let a transient coordinate consume the entire conversation viewport.
  if (!keyboard || keyboard.screenY <= 0 || keyboard.height <= 0) return 0;
  return Math.max(
    0,
    Math.min(
      keyboard.height,
      frame.height,
      frame.y + frame.height + verticalOffset - keyboard.screenY,
    ),
  );
}
