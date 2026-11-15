import { useState, type Dispatch, type SetStateAction } from "react";
import type { ClientApi, DaemonSessionBinding } from "../../shared/clientTypes";
import { t } from "../../shared/i18n/index";
import type { DisplayItem, ZotigoSession } from "../../shared/zotigod";
import { errorMessage, upsertSession } from "../app/appHelpers";
import type { ModelFavorite } from "../modelFavorites";

export interface ProfileOverridesArgs {
  client: Pick<ClientApi, "changeSessionProfile" | "getSession">;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setSessions: Dispatch<SetStateAction<ZotigoSession[]>>;
  // Hoisted function declarations in App; they read the bindings of the render they were passed from.
  rememberModelSelection: (selection: ModelFavorite) => void;
  refreshSessionItems: (binding: DaemonSessionBinding, options?: { quiet?: boolean }) => Promise<DisplayItem[]>;
}

export interface ProfileOverrides {
  // Optimistic per-session profiles, kept until the session history confirms the switch.
  profileOverrides: Record<string, string>;
  // Durable item handling drops an override once the history reports the same profile.
  setProfileOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  // Takes the selected session and binding of the render it is called from.
  selectProfile: (
    selectedSession: ZotigoSession | null,
    selectedBinding: DaemonSessionBinding | null,
    profile: string,
  ) => Promise<void>;
}

// Owns the optimistic profile overrides of existing sessions and the profile switch itself.
// Without a session the choice goes to the draft model selection, which App still owns.
export function useProfileOverrides({
  client, setMessage, setIsBusy, setSessions, rememberModelSelection, refreshSessionItems,
}: ProfileOverridesArgs): ProfileOverrides {
  const [profileOverrides, setProfileOverrides] = useState<Record<string, string>>({});

  async function selectProfile(
    selectedSession: ZotigoSession | null,
    selectedBinding: DaemonSessionBinding | null,
    profile: string,
  ) {
    if (!selectedSession) {
      rememberModelSelection({ agent: "zotigo", profile });
      return;
    }

    setProfileOverrides((current) => ({ ...current, [selectedSession.id]: profile }));
    setIsBusy(true);
    setMessage(null);
    try {
      const result = await client.changeSessionProfile(selectedSession.id, profile);
      rememberModelSelection({ agent: "zotigo", profile });
      setMessage(result.status === "pending" ? t("app.switchingToBeforeTheNextModelGeneration", { p0: profile }) : t("app.profileChangedTo", { p0: profile }));
      if (result.status === "applied") {
        const session = await client.getSession(selectedSession.id);
        setSessions((current) => upsertSession(current, session));
      }
      void refreshSessionItems(selectedBinding!, { quiet: true });
    } catch (error) {
      setProfileOverrides((current) => {
        const next = { ...current };
        delete next[selectedSession.id];
        return next;
      });
      setMessage(errorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  return { profileOverrides, setProfileOverrides, selectProfile };
}
