import { useState, type Dispatch, type SetStateAction } from "react";
import type { ClientApi, DesktopState } from "../../shared/clientTypes";
import { errorMessage } from "../app/appHelpers";

export type RemoveSourceTarget = { kind: "git" | "folder"; id: string; name: string };

export interface RemoveSourceDialogArgs {
  client: Pick<ClientApi, "removeProjectSource">;
  applyDesktopState: (update: SetStateAction<DesktopState>) => void;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
}

export interface RemoveSourceDialogState {
  removeSourceTarget: RemoveSourceTarget | null;
  setRemoveSourceTarget: Dispatch<SetStateAction<RemoveSourceTarget | null>>;
  confirmRemoveSource: () => Promise<void>;
}

// Owns the remove-source confirmation dialog target and its confirm action.
export function useRemoveSourceDialog({ client, applyDesktopState, setMessage, setIsBusy }: RemoveSourceDialogArgs): RemoveSourceDialogState {
  const [removeSourceTarget, setRemoveSourceTarget] = useState<RemoveSourceTarget | null>(null);

  async function confirmRemoveSource() {
    if (!removeSourceTarget) return;
    setIsBusy(true);
    setMessage(null);
    try {
      applyDesktopState(await client.removeProjectSource(removeSourceTarget.kind, removeSourceTarget.id));
      setRemoveSourceTarget(null);
    }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setIsBusy(false); }
  }

  return { removeSourceTarget, setRemoveSourceTarget, confirmRemoveSource };
}
