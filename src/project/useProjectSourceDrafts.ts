import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { ClientApi, DesktopState } from "../../shared/clientTypes";
import type { ProjectSourceDraft } from "../app/appTypes";
import { errorMessage, projectSourceInput } from "../app/appHelpers";

export interface ProjectSourceDraftsArgs {
  client: Pick<ClientApi, "chooseSourceFolders" | "createProject" | "getDesktopState">;
  isBusy: boolean;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  applyDesktopState: (update: SetStateAction<DesktopState>) => void;
  setRepositoriesOpen: Dispatch<SetStateAction<boolean>>;
  closeWorkspaceSources: () => void;
}

export interface ProjectSourceDrafts {
  createProjectOpen: boolean;
  newProjectName: string;
  setNewProjectName: Dispatch<SetStateAction<string>>;
  newProjectSources: ProjectSourceDraft[];
  setNewProjectSources: Dispatch<SetStateAction<ProjectSourceDraft[]>>;
  newProjectRepositoryIds: string[];
  setNewProjectRepositoryIds: Dispatch<SetStateAction<string[]>>;
  repositoryAdding: boolean;
  setRepositoryAdding: Dispatch<SetStateAction<boolean>>;
  addSourcesProjectId: string | null;
  setAddSourcesProjectId: Dispatch<SetStateAction<string | null>>;
  openCreateProjectDialog: () => void;
  closeCreateProjectDialog: () => void;
  chooseNewProjectSources: () => Promise<void>;
  createNamedProject: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  addSourcesToProject: (projectId: string, fromWorkspace?: boolean) => Promise<void>;
}

// Owns the create-project dialog and the source drafts it shares with the add-sources dialog:
// project name, chosen folders, chosen managed repositories, and which project is receiving sources.
export function useProjectSourceDrafts({
  client, isBusy, setIsBusy, setMessage, applyDesktopState, setRepositoriesOpen, closeWorkspaceSources,
}: ProjectSourceDraftsArgs): ProjectSourceDrafts {
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectSources, setNewProjectSources] = useState<ProjectSourceDraft[]>([]);
  const [newProjectRepositoryIds, setNewProjectRepositoryIds] = useState<string[]>([]);
  const [repositoryAdding, setRepositoryAdding] = useState(false);
  const [addSourcesProjectId, setAddSourcesProjectId] = useState<string | null>(null);

  function openCreateProjectDialog() {
    setMessage(null);
    setNewProjectName("");
    setNewProjectSources([]);
    setNewProjectRepositoryIds([]);
    setCreateProjectOpen(true);
  }

  function closeCreateProjectDialog() {
    if (isBusy || repositoryAdding) {
      return;
    }
    setCreateProjectOpen(false);
  }

  async function chooseNewProjectSources() {
    setMessage(null);
    try {
      const candidates = await client.chooseSourceFolders();
      setNewProjectSources((current) => {
        const paths = new Set(current.map((draft) => draft.candidate.selectedPath));
        return [...current, ...candidates.filter((candidate) => !paths.has(candidate.selectedPath)).map((candidate) => ({ candidate, folderMode: "direct" as const }))];
      });
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function createNamedProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name || repositoryAdding) {
      return;
    }

    setIsBusy(true);
    setMessage(null);
    try {
      applyDesktopState(await client.createProject({
        name,
        sources: [...newProjectRepositoryIds.map(repositoryId => ({ repositoryId })), ...newProjectSources.map(projectSourceInput)],
      }));
      setCreateProjectOpen(false);
      setRepositoriesOpen(false);
    } catch (error) {
      setMessage(errorMessage(error));
      applyDesktopState(await client.getDesktopState());
    } finally {
      setIsBusy(false);
    }
  }

  async function addSourcesToProject(projectId: string, fromWorkspace = false) {
    if (!fromWorkspace) closeWorkspaceSources();
    setMessage(null);
    setNewProjectSources([]);
    setNewProjectRepositoryIds([]);
    setAddSourcesProjectId(projectId);
  }

  return {
    createProjectOpen, newProjectName, setNewProjectName, newProjectSources, setNewProjectSources,
    newProjectRepositoryIds, setNewProjectRepositoryIds, repositoryAdding, setRepositoryAdding,
    addSourcesProjectId, setAddSourcesProjectId,
    openCreateProjectDialog, closeCreateProjectDialog, chooseNewProjectSources, createNamedProject, addSourcesToProject,
  };
}
