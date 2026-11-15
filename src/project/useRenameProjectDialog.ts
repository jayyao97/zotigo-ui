import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { ClientApi, DesktopProject, DesktopState } from "../../shared/clientTypes";
import { t } from "../../shared/i18n/index";
import { errorMessage } from "../app/appHelpers";

export interface RenameProjectDialogArgs {
  projects: DesktopState["projects"];
  client: Pick<ClientApi, "renameProject">;
  applyDesktopState: (update: SetStateAction<DesktopState>) => void;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setProjectMenuId: Dispatch<SetStateAction<string | null>>;
}

export interface RenameProjectDialogState {
  renameDialogProject: DesktopProject | null;
  renameDialogProjectNameDraft: string;
  setRenameDialogProjectNameDraft: Dispatch<SetStateAction<string>>;
  isSavingProjectName: boolean;
  openRenameProjectDialog: (project: DesktopProject) => void;
  closeRenameProjectDialog: () => void;
  submitRenameProjectDialog: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

// Owns the rename-project dialog: target id, name draft and saving flag.
export function useRenameProjectDialog({ projects, client, applyDesktopState, setMessage, setProjectMenuId }: RenameProjectDialogArgs): RenameProjectDialogState {
  const [renameDialogProjectId, setRenameDialogProjectId] = useState<string | null>(null);
  const [renameDialogProjectNameDraft, setRenameDialogProjectNameDraft] = useState("");
  const [isSavingProjectName, setIsSavingProjectName] = useState(false);
  const renameDialogProject = useMemo(
    () => projects.find((project) => project.id === renameDialogProjectId) ?? null,
    [projects, renameDialogProjectId],
  );

  function openRenameProjectDialog(project: DesktopProject) {
    setProjectMenuId(null);
    setMessage(null);
    setRenameDialogProjectId(project.id);
    setRenameDialogProjectNameDraft(project.name);
  }

  function closeRenameProjectDialog() {
    if (isSavingProjectName) return;
    setRenameDialogProjectId(null);
    setRenameDialogProjectNameDraft("");
  }

  async function submitRenameProjectDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameDialogProject || isSavingProjectName) return;
    const name = renameDialogProjectNameDraft.trim();
    if (!name) {
      setMessage(t("app.projectNameIsRequired"));
      return;
    }
    if (name === renameDialogProject.name) {
      closeRenameProjectDialog();
      return;
    }

    setIsSavingProjectName(true);
    setMessage(null);
    try {
      applyDesktopState(await client.renameProject(renameDialogProject.id, name));
      setRenameDialogProjectId(null);
      setRenameDialogProjectNameDraft("");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsSavingProjectName(false);
    }
  }

  return {
    renameDialogProject,
    renameDialogProjectNameDraft,
    setRenameDialogProjectNameDraft,
    isSavingProjectName,
    openRenameProjectDialog,
    closeRenameProjectDialog,
    submitRenameProjectDialog,
  };
}
