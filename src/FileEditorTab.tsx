import { useLocale } from "./i18n";
import { t } from "../shared/i18n/index";
import { MarkdownImage, MarkdownImageContext } from "./MarkdownImage";
import { Check, Code2, Copy, Eye, LoaderCircle, RefreshCw, Save } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TextFileSnapshot } from "../shared/clientTypes";
import { CodeEditor } from "./CodeEditor";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";
import { markdownUrlTransform } from "./markdownUrlTransform";
import { FilePath } from "./FilePath";

export type FileEditorMode = "preview" | "source";
export type FileSaveStatus = "clean" | "dirty" | "saving" | "error";

export function FileEditorTab({
  sessionId,
  file,
  draft,
  mode,
  saveStatus,
  saveError,
  workspaceRoot,
  line,
  column,
  onDraftChange,
  onModeChange,
  onSave,
  onRefresh,
  refreshError,
  diskChanged,
}: {
  onRefresh: () => void;
  refreshError?: string;
  diskChanged?: boolean;
  sessionId?: string;
  file: TextFileSnapshot;
  draft: string;
  mode: FileEditorMode;
  saveStatus: FileSaveStatus;
  saveError?: string;
  workspaceRoot?: string;
  line?: number;
  column?: number;
  onDraftChange: (value: string) => void;
  onModeChange: (mode: FileEditorMode) => void;
  onSave: () => void;
}) {
  useLocale();
  const markdown = /\.(?:md|markdown|mdown|mkd)$/i.test(file.path);
  const preview = markdown && mode === "preview";
  return (
    <div className="file-editor-tab-content">
      <header className="file-editor-header">
        <FilePath path={file.path} workspaceRoot={workspaceRoot} />
        <span className={`file-save-status ${saveStatus}`}>
          {saveStatus === "saving" && <LoaderCircle size={12} />}
          {saveStatus === "clean" && <Check size={12} />}
          {saveStatus === "dirty" ? t("fileEditorTab.edited") : saveStatus === "saving" ? t("fileEditorTab.saving") : saveStatus === "error" ? t("fileEditorTab.saveFailed") : t("fileEditorTab.saved")}
        </span>
        {markdown && (
          <button
            type="button"
            className="file-editor-mode-button"
            onClick={() => onModeChange(preview ? "source" : "preview")}
          >
            {preview ? <Code2 size={14} /> : <Eye size={14} />}
            {preview ? t("fileEditorTab.viewSource") : t("fileEditorTab.viewPreview")}
          </button>
        )}
        <button
          type="button"
          className="file-editor-icon-button"
          title={t("app.copyPath")}
          aria-label={t("fileEditorTab.copyFilePath")}
          onClick={() => void navigator.clipboard.writeText(file.path)}
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          className="file-editor-icon-button"
          title={t("app.save")}
          aria-label={t("fileEditorTab.saveFile")}
          disabled={diskChanged || file.readOnly || saveStatus === "clean" || saveStatus === "saving"}
          onClick={onSave}
        >
          <Save size={14} />
        </button>
        <button type="button" className="file-editor-icon-button" title={t("fileEditorTab.refreshFile")} aria-label={t("fileEditorTab.refreshFile")} disabled={saveStatus === "saving"} onClick={onRefresh}><RefreshCw size={14} /></button>
      </header>
      {diskChanged && <div className="file-editor-banner" role="alert">{t("fileEditorTab.fileChangedOnDiskYourEditsArePreserved")}</div>}
      {refreshError && <div className="file-editor-banner error" role="alert">{refreshError}</div>}
      {file.readOnly && <div className="file-editor-banner">{t("fileEditorTab.fileOpenedReadOnly")}</div>}
      {saveError && <div className="file-editor-banner error">{saveError}</div>}
      {preview ? (
        <MarkdownImageContext.Provider value={{ sessionId, basePath: file.path, baseKind: "file" }}>
        <div className="file-markdown-preview markdown-copy" data-markdown-file={file.path}>
          <ReactMarkdown
            components={{ pre: MarkdownCodeBlock, img: MarkdownImage }}
            remarkPlugins={[remarkGfm]}
            urlTransform={markdownUrlTransform}
          >
            {draft}
          </ReactMarkdown>
        </div>
        </MarkdownImageContext.Provider>
      ) : (
        <CodeEditor
          value={draft}
          filePath={file.path}
          line={line}
          column={column}
          readOnly={file.readOnly}
          onChange={onDraftChange}
          onSave={onSave}
        />
      )}
    </div>
  );
}
