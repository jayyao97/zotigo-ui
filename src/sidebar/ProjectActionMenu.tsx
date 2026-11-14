import type { Ref } from "react";
import { FileText, FolderPlus, Pin, SquarePen, Trash2 } from "lucide-react";
import { t } from "../../shared/i18n/index";

export function ProjectActionMenu({
  menuRef,
  opensUp,
  pinned,
  isBusy,
  onTogglePinned,
  onOpenOverview,
  onAddSources,
  onRename,
  onDelete,
}: {
  menuRef: Ref<HTMLDivElement>;
  opensUp: boolean;
  pinned: boolean;
  isBusy: boolean;
  onTogglePinned: () => void;
  onOpenOverview: () => void;
  onAddSources: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
              <div
                ref={menuRef}
                className={`workspace-action-menu project-action-menu ${opensUp ? "opens-up" : ""}`}
                role="menu"
              >
                <button type="button" role="menuitem" onClick={onTogglePinned}>
                  <Pin size={13} strokeWidth={1.8} /><span>{pinned ? t("app.unpinProject") : t("app.pinProject")}</span>
                </button>
                <button type="button" role="menuitem" onClick={onOpenOverview}>
                  <FileText size={13} strokeWidth={1.8} />
                  <span>{t("app.openOverview")}</span>
                </button>
                <button type="button" role="menuitem" onClick={onAddSources}>
                  <FolderPlus size={13} strokeWidth={1.8} />
                  <span>{t("app.addSources")}</span>
                </button>
                <button type="button" role="menuitem" onClick={onRename}>
                  <SquarePen size={13} strokeWidth={1.8} />
                  <span>{t("app.rename")}</span>
                </button>
                <button type="button" role="menuitem" className="destructive" disabled={isBusy} onClick={onDelete}>
                  <Trash2 size={13} strokeWidth={1.8} />
                  <span>{t("app.deleteProject")}</span>
                </button>
              </div>
  );
}
