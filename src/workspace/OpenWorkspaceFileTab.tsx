import { lazy } from "react";
import { useLocale } from "../i18n";
import type { OpenFileState } from "../openFileState";
import type { FileEditorMode } from "../FileEditorTab";

const FileEditorTab = lazy(() => import("../FileEditorTab").then((module) => ({ default: module.FileEditorTab })));
const FileVideoTab = lazy(() => import("../FileVideoTab").then((module) => ({ default: module.FileVideoTab })));
const FileImageTab = lazy(() => import("../FileImageTab").then((module) => ({ default: module.FileImageTab })));

export function OpenWorkspaceFileTab({ active, state, line, column, onDraftChange, onModeChange, onSave, onRefresh }: {
  onRefresh: () => void;
  active: boolean;
  state: OpenFileState;
  line?: number;
  column?: number;
  onDraftChange: (draft: string) => void;
  onModeChange: (mode: FileEditorMode) => void;
  onSave: () => void;
}) {
  useLocale();
  if (state.kind === "video") return <FileVideoTab active={active} file={state.file} workspaceRoot={state.workspaceRoot} onRefresh={onRefresh} refreshError={state.refreshError} />;
  if (state.kind === "image") return <FileImageTab file={state.file} workspaceRoot={state.workspaceRoot} onRefresh={onRefresh} refreshError={state.refreshError} />;
  return <FileEditorTab
    sessionId={state.sessionId}
    file={state.file}
    draft={state.draft}
    mode={state.mode}
    saveStatus={state.saveStatus}
    saveError={state.saveError}
    refreshError={state.refreshError}
    diskChanged={state.diskChanged}
    onRefresh={onRefresh}
    workspaceRoot={state.workspaceRoot}
    line={line}
    column={column}
    onDraftChange={onDraftChange}
    onModeChange={onModeChange}
    onSave={onSave}
  />;
}
