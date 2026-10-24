import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import { Copy, Maximize2, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { ImageFileSnapshot } from "../shared/clientTypes";
import { ImagePreview } from "./ImagePreview";
import { FilePath } from "./FilePath";

export function FileImageTab({ file, workspaceRoot, onRefresh, refreshError }: { file: ImageFileSnapshot; workspaceRoot?: string; onRefresh: () => void; refreshError?: string }) {
  useLocale();
  const [expanded, setExpanded] = useState(false);
  const src = `data:${file.mediaType};base64,${file.dataBase64}`;
  return (
    <div className="file-editor-tab-content">
      <header className="file-editor-header">
        <FilePath path={file.path} workspaceRoot={workspaceRoot} />
        <span className="file-image-size">{formatFileSize(file.sizeBytes)}</span>
        <button type="button" className="file-editor-icon-button" title={t("app.copyPath")} aria-label={t("fileEditorTab.copyFilePath")} onClick={() => void navigator.clipboard.writeText(file.path)}><Copy size={14} /></button>
        <button type="button" className="file-editor-icon-button" title={t("fileImageTab.openFullPreview")} aria-label={t("fileImageTab.openFullImagePreview")} onClick={() => setExpanded(true)}><Maximize2 size={14} /></button>
        <button type="button" className="file-editor-icon-button" title={t("fileEditorTab.refreshFile")} aria-label={t("fileEditorTab.refreshFile")} onClick={onRefresh}><RefreshCw size={14} /></button>
      </header>
      {refreshError && <div className="file-editor-banner error" role="alert">{refreshError}</div>}
      <button type="button" className="file-image-canvas" aria-label={t("fileImageTab.openFullPreviewOf", { p0: file.name })} onClick={() => setExpanded(true)}>
        <img src={src} alt={file.name} draggable={false} />
      </button>
      {expanded && <ImagePreview src={src} alt={file.name} onClose={() => setExpanded(false)} />}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return t("fileImageTab.b", { p0: bytes });
  if (bytes < 1024 * 1024) return t("fileImageTab.kb", { p0: Math.round(bytes / 1024) });
  return t("fileImageTab.mb", { p0: (bytes / (1024 * 1024)).toFixed(1) });
}
