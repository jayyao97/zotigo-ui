import { t } from "../shared/i18n/index";

/**
 * Copies text to the clipboard. Browsers expose the Clipboard API only in
 * secure contexts, so a Web UI served over plain HTTP from another host falls
 * back to copying from a hidden text area, which they still allow on a click.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // A page without focus rejects the API; the fallback below can still work.
    }
  }
  const active = document.activeElement as HTMLElement | null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  Object.assign(textarea.style, { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
  document.body.append(textarea);
  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    if (!document.execCommand("copy")) throw new Error(t("conversationTimeline.clipboardUnavailable"));
  } finally {
    textarea.remove();
    active?.focus?.({ preventScroll: true });
  }
}
