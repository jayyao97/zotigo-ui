import type { Ref } from "react";
import { Archive, Copy, FolderOpen, FolderPlus, Pin, SquarePen, Trash2 } from "lucide-react";
import { t } from "../../shared/i18n/index";

export function WorkspaceActionMenu({
  menuRef,
  opensUp,
  pinned,
  ready,
  kind,
  onTogglePinned,
  onAddRepository,
  onBrowseFiles,
  onCopyPath,
  onRename,
  onArchive,
  onDelete,
}: {
  menuRef: Ref<HTMLDivElement>;
  opensUp: boolean;
  pinned: boolean;
  ready: boolean;
  kind: "desktop" | "web";
  onTogglePinned: () => void;
  onAddRepository: () => void;
  onBrowseFiles: () => void;
  onCopyPath: () => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
                <div
                  ref={menuRef}
                  className={`workspace-action-menu ${opensUp ? "opens-up" : ""}`}
                  role="menu"
                >
                  <button type="button" role="menuitem" onClick={onTogglePinned}>
                    <Pin size={13} strokeWidth={1.8} /><span>{pinned ? t("app.unpinWorkspace") : t("app.pinWorkspace")}</span>
                  </button>
                  {ready && <button type="button" role="menuitem" onClick={onAddRepository}>
                    <FolderPlus size={13} strokeWidth={1.8} /><span>{t("workspace.addRepository")}</span>
                  </button>}
                  {<button
                    type="button"
                    role="menuitem"
                    onClick={onBrowseFiles}
                  >
                    <FolderOpen size={13} strokeWidth={1.8} />
                    <span>{t("app.browseFiles")}</span>
                  </button>}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onCopyPath}
                  >
                    <Copy size={13} strokeWidth={1.8} />
                    <span>{kind === "web" ? t("app.copyServerPath") : t("app.copyAbsolutePath")}</span>
                  </button>
                  <div className="workspace-action-menu-separator" role="separator" />
                  <button type="button" role="menuitem" onClick={onRename}>
                    <SquarePen size={13} strokeWidth={1.8} />
                    <span>{t("app.rename")}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={onArchive}>
                    <Archive size={13} strokeWidth={1.8} />
                    <span>{t("app.archive")}</span>
                  </button>
                  <button type="button" role="menuitem" className="destructive" onClick={onDelete}>
                    <Trash2 size={13} strokeWidth={1.8} />
                    <span>{t("app.delete")}</span>
                  </button>
                </div>
  );
}
