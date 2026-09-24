import type { KeyboardEvent } from "react";

export function handleComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  handleSkillMenuKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean,
): void {
  // An IME can emit compositionend before the keydown that confirms a candidate.
  // In that case isComposing is false, but the native keyCode is still 229.
  if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
  if (handleSkillMenuKeyDown(event)) return;
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}
