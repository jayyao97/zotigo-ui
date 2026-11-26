import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { t } from "../shared/i18n/index";
import { markdownLinkCopyText } from "../shared/markdownLinks";
import { useLocale } from "./i18n";

export type LinkMenuState = { x: number; y: number; href: string; copy: string; anchor: HTMLAnchorElement };

/**
 * The link under a right-click inside rendered Markdown, if it can be copied.
 * In-page anchors and links this app would not open keep the system menu.
 */
export function markdownLinkMenuTarget(event: Pick<ReactMouseEvent, "target" | "clientX" | "clientY">): LinkMenuState | null {
  if (!(event.target instanceof Element)) return null;
  // A linked image keeps its own menu (save or copy the image).
  if (event.target.closest("img, .image-preview-trigger")) return null;
  const anchor = event.target.closest<HTMLAnchorElement>(".markdown-copy a");
  // Text the user selected within this link is theirs to copy with the system menu.
  const selection = window.getSelection();
  if (anchor && selection && !selection.isCollapsed && selection.rangeCount && selection.getRangeAt(0).intersectsNode(anchor)) return null;
  const href = anchor?.getAttribute("href");
  const copy = href ? markdownLinkCopyText(href) : undefined;
  if (!anchor || !href || !copy) return null;
  return { x: event.clientX, y: event.clientY, href, copy, anchor };
}

/**
 * Right-click menu for a Markdown link: Open does what a click does, Copy
 * puts the link on the clipboard. Closes on Escape, a click elsewhere, a
 * scroll or leaving the window.
 */
export function MarkdownLinkMenu({ menu, onClose, onCopy }: {
  menu: LinkMenuState;
  onClose: () => void;
  onCopy: (text: string) => void;
}) {
  useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)),
    });
    element.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [menu]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) onClose();
    };
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); onClose();
      if (menu.anchor.isConnected) menu.anchor.focus({ preventScroll: true });
    };
    // Only a scroll that moves the link away: streaming output elsewhere also scrolls.
    const closeOnScroll = (event: Event) => {
      if (event.target === document || (event.target instanceof Node && event.target.contains(menu.anchor))) onClose();
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("keydown", closeOnKey, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("keydown", closeOnKey, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [menu, onClose]);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };
  return (
    <div
      ref={ref}
      className="workspace-action-menu markdown-link-menu"
      role="menu"
      aria-label={menu.copy}
      style={position}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" role="menuitem" onClick={() => {
        onClose();
        // The same path as a click on the link, so files and anchors open as usual.
        if (menu.anchor.isConnected) menu.anchor.click();
      }}>
        <ExternalLink size={14} strokeWidth={1.8} /><span>{t("markdownLink.open")}</span>
      </button>
      <button type="button" role="menuitem" onClick={() => { onClose(); onCopy(menu.copy); }}>
        <Copy size={14} strokeWidth={1.8} /><span>{t("markdownLink.copy")}</span>
      </button>
    </div>
  );
}
