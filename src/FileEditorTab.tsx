import { Check, ChevronRight, Code2, Copy, Eye, LoaderCircle, Save } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TextFileSnapshot } from "../shared/clientTypes";
import { CodeEditor } from "./CodeEditor";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";
import { markdownUrlTransform } from "./markdownUrlTransform";

export type FileEditorMode = "preview" | "source";
export type FileSaveStatus = "clean" | "dirty" | "saving" | "error";

export function FileEditorTab({
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
}: {
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
  const markdown = /\.(?:md|markdown|mdown|mkd)$/i.test(file.path);
  const preview = markdown && mode === "preview";
  const normalizedRoot = workspaceRoot?.replace(/\/+$/, "");
  const relativePath = normalizedRoot && file.path.startsWith(`${normalizedRoot}/`)
    ? file.path.slice(normalizedRoot.length + 1)
    : file.name;
  const breadcrumbs = [
    ...(normalizedRoot ? [normalizedRoot.split("/").at(-1) ?? normalizedRoot] : []),
    ...relativePath.split("/").filter(Boolean),
  ];
  return (
    <div className="file-editor-tab-content">
      <header className="file-editor-header">
        <nav className="file-editor-path" title={file.path} aria-label="File path">
          {breadcrumbs.map((segment, index) => (
            <span className="file-editor-breadcrumb" key={`${index}-${segment}`}>
              {index > 0 && <ChevronRight size={14} strokeWidth={1.8} />}
              <span>{segment}</span>
            </span>
          ))}
        </nav>
        <span className={`file-save-status ${saveStatus}`}>
          {saveStatus === "saving" && <LoaderCircle size={12} />}
          {saveStatus === "clean" && <Check size={12} />}
          {saveStatus === "dirty" ? "Edited" : saveStatus === "saving" ? "Saving" : saveStatus === "error" ? "Save failed" : "Saved"}
        </span>
        {markdown && (
          <button
            type="button"
            className="file-editor-mode-button"
            onClick={() => onModeChange(preview ? "source" : "preview")}
          >
            {preview ? <Code2 size={14} /> : <Eye size={14} />}
            {preview ? "View source" : "View preview"}
          </button>
        )}
        <button
          type="button"
          className="file-editor-icon-button"
          title="Copy path"
          aria-label="Copy file path"
          onClick={() => void navigator.clipboard.writeText(file.path)}
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          className="file-editor-icon-button"
          title="Save"
          aria-label="Save file"
          disabled={file.readOnly || saveStatus === "clean" || saveStatus === "saving"}
          onClick={onSave}
        >
          <Save size={14} />
        </button>
      </header>
      {file.readOnly && <div className="file-editor-banner">Large file opened read-only</div>}
      {saveError && <div className="file-editor-banner error">{saveError}</div>}
      {preview ? (
        <div className="file-markdown-preview markdown-copy" data-markdown-file={file.path}>
          <ReactMarkdown
            components={{ pre: MarkdownCodeBlock }}
            remarkPlugins={[remarkGfm]}
            urlTransform={markdownUrlTransform}
          >
            {draft}
          </ReactMarkdown>
        </div>
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
