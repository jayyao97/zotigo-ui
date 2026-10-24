import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import { Copy, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { VideoFileSnapshot } from "../shared/clientTypes";
import { FilePath } from "./FilePath";

export function FileVideoTab({ active = true, file, workspaceRoot, onRefresh, refreshError }: { active?: boolean; file: VideoFileSnapshot; workspaceRoot?: string; onRefresh: () => void; refreshError?: string }) {
  useLocale();
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (!active) video.current?.pause(); }, [active]);
  const [source, setSource] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const bytes = Uint8Array.from(atob(file.dataBase64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: file.mediaType }));
    setSource(url);
    setFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [file.dataBase64, file.mediaType]);
  return <div className="file-editor-tab-content file-video-tab">
    <header className="file-editor-header">
        <FilePath path={file.path} workspaceRoot={workspaceRoot} />
      <span className="file-image-size">{(file.sizeBytes / (1024 * 1024)).toFixed(1)} {t("fileVideoTab.mb")}</span>
      <button type="button" className="file-editor-icon-button" aria-label={t("fileEditorTab.copyFilePath")} title={t("app.copyPath")} onClick={() => void navigator.clipboard.writeText(file.path)}><Copy size={14} /></button>
      <button type="button" className="file-editor-icon-button" aria-label={t("fileEditorTab.refreshFile")} title={t("fileEditorTab.refreshFile")} onClick={onRefresh}><RefreshCw size={14} /></button>
    </header>
    {refreshError && <div className="file-editor-banner error" role="alert">{refreshError}</div>}
    {failed && <div className="file-editor-banner error" role="alert">{t("fileVideoTab.thisVideoCouldNotBePlayedItsEncoding")}</div>}
    <div className="file-video-canvas">
      {source && <video ref={video} key={source} src={source} controls playsInline preload="metadata" aria-label={file.name} onError={() => setFailed(true)} />}
    </div>
  </div>;
}
