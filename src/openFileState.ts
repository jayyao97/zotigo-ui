import type { TextFileSnapshot, ImageFileSnapshot } from "../shared/clientTypes";
import type { FileEditorMode, FileSaveStatus } from "./FileEditorTab";
type OpenTextFileState = {
  kind: "text";
  file: TextFileSnapshot;
  sessionId?: string;
  workspaceRoot?: string;
  draft: string;
  mode: FileEditorMode;
  saveStatus: FileSaveStatus;
  saveError?: string;
};
type OpenImageFileState = {
  kind: "image";
  file: ImageFileSnapshot;
  sessionId?: string;
  workspaceRoot?: string;
  saveStatus: "clean";
};
export type OpenFileState = (OpenTextFileState | OpenImageFileState) & { diskChanged?: boolean; refreshError?: string };

