import { Archive, Check, Circle, GitBranch, Pin, SquarePen } from "lucide-react";
import { t } from "../../shared/i18n/index";

export function SessionContextMenu({
  x,
  y,
  unread,
  pinned,
  isBusy,
  onToggleRead,
  onTogglePinned,
  onFork,
  onRename,
  onArchive,
}: {
  x: number;
  y: number;
  unread: boolean;
  pinned: boolean;
  isBusy: boolean;
  onToggleRead: () => void;
  onTogglePinned: () => void;
  onFork: () => void;
  onRename: () => void;
  onArchive: () => void;
}) {
  return (
    <div
      className="workspace-action-menu session-context-menu"
      role="menu"
      style={{ left: x, top: y }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={onToggleRead}
      >
        {unread ? (
          <><Check size={14} strokeWidth={1.8} /><span>{t("app.markAsRead")}</span></>
        ) : (
          <><Circle size={14} strokeWidth={1.8} /><span>{t("app.markAsUnread")}</span></>
        )}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onTogglePinned}
      >
        <Pin size={14} strokeWidth={1.8} />
        <span>{pinned ? t("app.unpin") : t("app.pin")}</span>
      </button>
      <div className="workspace-action-menu-separator" />
      <button type="button" role="menuitem" disabled={isBusy} onClick={onFork}>
        <GitBranch size={14} strokeWidth={1.8} /><span>{t("app.forkSession")}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onRename}
      >
        <SquarePen size={14} strokeWidth={1.8} />
        <span>{t("app.rename")}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onArchive}
      >
        <Archive size={14} strokeWidth={1.8} />
        <span>{t("app.archive")}</span>
      </button>
    </div>
  );
}
