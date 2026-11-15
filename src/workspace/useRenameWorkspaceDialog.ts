import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { ClientApi, DesktopState, DesktopWorkspace } from "../../shared/clientTypes";
import { t } from "../../shared/i18n/index";
import { errorMessage } from "../app/appHelpers";

export interface RenameWorkspaceDialogArgs {
  workspaces: DesktopState["workspaces"];
  client: Pick<ClientApi, "renameWorkspace">;
  applyDesktopState: (update: SetStateAction<DesktopState>) => void;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setWorkspaceMenuId: Dispatch<SetStateAction<string | null>>;
}

export interface RenameWorkspaceDialogState {
  renameDialogWorkspace: DesktopWorkspace | null;
  renameDialogWorkspaceTitleDraft: string;
  setRenameDialogWorkspaceTitleDraft: Dispatch<SetStateAction<string>>;
  isSavingWorkspaceTitle: boolean;
  openRenameWorkspaceDialog: (workspace: DesktopWorkspace) => void;
  closeRenameWorkspaceDialog: () => void;
  submitRenameWorkspaceDialog: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

// Owns the rename-workspace dialog: target id, title draft and saving flag.
export function useRenameWorkspaceDialog({ workspaces, client, applyDesktopState, setMessage, setWorkspaceMenuId }: RenameWorkspaceDialogArgs): RenameWorkspaceDialogState {
  const [renameDialogWorkspaceId, setRenameDialogWorkspaceId] = useState<string | null>(null);
  const [renameDialogWorkspaceTitleDraft, setRenameDialogWorkspaceTitleDraft] = useState("");
  const [isSavingWorkspaceTitle, setIsSavingWorkspaceTitle] = useState(false);
  const renameDialogWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === renameDialogWorkspaceId) ?? null,
    [workspaces, renameDialogWorkspaceId],
  );

  function openRenameWorkspaceDialog(workspace: DesktopWorkspace) {
    setWorkspaceMenuId(null);
    setMessage(null);
    setRenameDialogWorkspaceId(workspace.id);
    setRenameDialogWorkspaceTitleDraft(workspace.title);
  }

  function closeRenameWorkspaceDialog() {
    if (isSavingWorkspaceTitle) return;
    setRenameDialogWorkspaceId(null);
    setRenameDialogWorkspaceTitleDraft("");
  }

  async function submitRenameWorkspaceDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameDialogWorkspace || isSavingWorkspaceTitle) return;
    const title = renameDialogWorkspaceTitleDraft.trim();
    if (!title) {
      setMessage(t("app.workspaceNameIsRequired"));
      return;
    }
    if (title === renameDialogWorkspace.title) {
      closeRenameWorkspaceDialog();
      return;
    }

    setIsSavingWorkspaceTitle(true);
    setMessage(null);
    try {
      applyDesktopState(await client.renameWorkspace(renameDialogWorkspace.id, title));
      setRenameDialogWorkspaceId(null);
      setRenameDialogWorkspaceTitleDraft("");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsSavingWorkspaceTitle(false);
    }
  }

  return {
    renameDialogWorkspace,
    renameDialogWorkspaceTitleDraft,
    setRenameDialogWorkspaceTitleDraft,
    isSavingWorkspaceTitle,
    openRenameWorkspaceDialog,
    closeRenameWorkspaceDialog,
    submitRenameWorkspaceDialog,
  };
}
