import { ChevronRight, Copy, Maximize2 } from "lucide-react";
import { useState } from "react";
import type { ImageFileSnapshot } from "../shared/clientTypes";
import { ImagePreview } from "./ImagePreview";

export function FileImageTab({ file, workspaceRoot }: { file: ImageFileSnapshot; workspaceRoot?: string }) {
  const [expanded, setExpanded] = useState(false);
  const normalizedRoot = workspaceRoot?.replace(/\/+$/, "");
  const relativePath = normalizedRoot && file.path.startsWith(`${normalizedRoot}/`)
    ? file.path.slice(normalizedRoot.length + 1)
    : file.name;
  const breadcrumbs = [
    ...(normalizedRoot ? [normalizedRoot.split("/").at(-1) ?? normalizedRoot] : []),
    ...relativePath.split("/").filter(Boolean),
  ];
  const src = `data:${file.mediaType};base64,${file.dataBase64}`;
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
        <span className="file-image-size">{formatFileSize(file.sizeBytes)}</span>
        <button type="button" className="file-editor-icon-button" title="Copy path" aria-label="Copy file path" onClick={() => void navigator.clipboard.writeText(file.path)}><Copy size={14} /></button>
        <button type="button" className="file-editor-icon-button" title="Open full preview" aria-label="Open full image preview" onClick={() => setExpanded(true)}><Maximize2 size={14} /></button>
      </header>
      <button type="button" className="file-image-canvas" aria-label={`Open full preview of ${file.name}`} onClick={() => setExpanded(true)}>
        <img src={src} alt={file.name} draggable={false} />
      </button>
      {expanded && <ImagePreview src={src} alt={file.name} onClose={() => setExpanded(false)} />}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
