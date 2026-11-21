import { useRef, type MouseEvent as ReactMouseEvent } from "react";
import { Archive, LoaderCircle, MoreHorizontal, Pin } from "lucide-react";
import { t } from "../../shared/i18n/index";
import type { DesktopConversation } from "../../shared/clientTypes";
import { useLocale } from "../i18n";
import type { SidebarSortProps } from "../app/appTypes";

export function ConversationNavItem({
  conversation,
  detail,
  selected,
  working,
  unread,
  onSelect,
  onContextMenu,
  onRename,
  onPin,
  onArchive,
  sort,
}: {
  conversation: DesktopConversation;
  detail?: string;
  selected: boolean;
  working: boolean;
  unread: boolean;
  onSelect: () => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  onRename: () => void;
  onPin: () => void;
  onArchive: () => void;
  sort?: SidebarSortProps;
}) {
  useLocale();
  const titleViewportRef = useRef<HTMLSpanElement | null>(null);
  const titleTextRef = useRef<HTMLSpanElement | null>(null);

  function startTitleScroll() {
    requestAnimationFrame(() => {
      const viewport = titleViewportRef.current;
      const text = titleTextRef.current;
      if (!viewport || !text) return;
      if (!viewport.closest(".sidebar-session")?.matches(":hover")) return;
      const distance = Math.max(0, text.scrollWidth - viewport.clientWidth);
      text.style.setProperty("--sidebar-title-distance", `${distance}px`);
      text.style.setProperty("--sidebar-title-duration", `${Math.max(3, Math.min(9, distance / 24 + 2))}s`);
      text.classList.toggle("scrolling", distance > 0);
    });
  }

  function stopTitleScroll() {
    titleTextRef.current?.classList.remove("scrolling");
  }

  return (
    <div
      data-session-id={conversation.id}
      className={`sidebar-session ${selected ? "selected" : ""} ${sort?.dragging ? "dragging" : ""} ${sort?.dropPosition ? `drop-${sort.dropPosition}` : ""}`}
      onMouseEnter={startTitleScroll}
      onMouseLeave={stopTitleScroll}
      onContextMenu={onContextMenu}
      draggable={sort?.draggable}
      onDragStart={sort?.onDragStart}
      onDragOver={sort?.onDragOver}
      onDrop={sort?.onDrop}
      onDragEnd={sort?.onDragEnd}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onRename}
        title={conversation.title}
      >
        <span className="sidebar-session-title" ref={titleViewportRef}>
          <span ref={titleTextRef}>{conversation.title}</span>
        </span>
        {detail && <small className="recent-session-context">{detail}</small>}
      </button>
      {working && <LoaderCircle className="sidebar-session-spinner" size={13} strokeWidth={1.9} aria-label={t("app.running")} />}
      {!working && unread && <span className="sidebar-session-unread" aria-label={t("app.unread")} />}
      <div className="sidebar-session-actions">
        <button className="sidebar-session-touch-menu" type="button" onClick={onContextMenu} aria-label={t("app.moreActionsFor", { p0: conversation.title })}>
          <MoreHorizontal size={18} strokeWidth={1.8} />
        </button>
        <button type="button" onClick={onPin} title={conversation.pinned_at ? t("app.unpin") : t("app.pin")} aria-label={`${conversation.pinned_at ? t("app.unpin") : t("app.pin")} ${conversation.title}`}>
          <Pin size={12} strokeWidth={1.8} fill={conversation.pinned_at ? "currentColor" : "none"} />
        </button>
        <button type="button" onClick={onArchive} title={t("app.archive")} aria-label={t("app.archive3", { p0: conversation.title })}>
          <Archive size={12} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
