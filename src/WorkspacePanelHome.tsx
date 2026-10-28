import { FileText, FolderOpen, Users } from "lucide-react";
import { t } from "../shared/i18n";
import { useLocale } from "./i18n";

export function WorkspacePanelHome({ files, onBrowse, onSubagents, onOpenFile }: {
  files: { id: string; path: string }[];
  onBrowse: () => void;
  onSubagents: () => void;
  onOpenFile: (id: string) => void;
}) {
  useLocale();
  return <div className="workspace-panel-home">
    <section aria-labelledby="panel-tools-heading">
      <h2 id="panel-tools-heading">{t("panel.tools")}</h2>
      <div className="workspace-tool-grid">
        <button type="button" onClick={onBrowse}><FolderOpen size={18} /><span>{t("app.browseFiles")}</span></button>
        <button type="button" onClick={onSubagents}><Users size={18} /><span>{t("app.subagents")}</span></button>
      </div>
    </section>
    {files.length > 0 && <section aria-labelledby="panel-files-heading">
      <h2 id="panel-files-heading">{t("panel.openFiles")}</h2>
      <div className="workspace-open-files">{files.map(file => <button type="button" key={file.id} onClick={() => onOpenFile(file.id)} title={file.path}>
        <FileText size={18} />
        <span><strong>{file.path.replace(/\\/g, "/").split("/").pop()}</strong><small>{file.path}</small></span>
      </button>)}</div>
    </section>}
  </div>;
}
