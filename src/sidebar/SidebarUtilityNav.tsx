import type { RefObject } from "react";
import { Blocks, CalendarClock, GitBranch, House } from "lucide-react";
import { t } from "../../shared/i18n/index";

export function SidebarUtilityNav({
  channelsOpen,
  repositoriesOpen,
  channelsEntryButton,
  onHome,
  onChannels,
  onRepositories,
}: {
  channelsOpen: boolean;
  repositoriesOpen: boolean;
  channelsEntryButton: RefObject<HTMLButtonElement | null>;
  onHome: () => void;
  onChannels: () => void;
  onRepositories: () => void;
}) {
  return (
        <nav className="utility-nav" aria-label={t("app.navigation")}>
          <button type="button" aria-label={t("app.home")} aria-pressed={!channelsOpen && !repositoriesOpen} className={!channelsOpen && !repositoriesOpen ? "selected" : ""} onClick={onHome}>
            <House size={18} strokeWidth={1.8} />
            <span className="utility-nav-label">{t("app.home")}</span>
          </button>
          <button type="button" aria-disabled="true" aria-label={t("app.scheduledNotAvailableYet")} className="utility-placeholder">
            <CalendarClock size={15} strokeWidth={1.8} />
            <span className="utility-nav-label">{t("app.scheduled")}</span>
          </button>
          <button ref={channelsEntryButton} type="button" aria-label={t("app.channels")} aria-pressed={channelsOpen} className={channelsOpen ? "selected" : ""} onClick={onChannels}>
            <Blocks size={15} strokeWidth={1.8} />
            <span className="utility-nav-label">{t("app.channels")}</span>
          </button>
          <button type="button" aria-label={t("repositories.library")} aria-pressed={repositoriesOpen} className={repositoriesOpen ? "selected" : ""} onClick={onRepositories}>
            <GitBranch size={16} strokeWidth={1.8} />
            <span className="utility-nav-label">{t("repositories.library")}</span>
          </button>
        </nav>
  );
}
