import { stateLabel } from "../../shared/i18n/display";
import type { ZotigoSession } from "../../shared/zotigod";
import { useLocale } from "../i18n";

export function StateBadge({ state }: { state: ZotigoSession["state"] | "idle" }) {
  useLocale();
  return <span className={`state-badge ${state}`}>{stateLabel(state)}</span>;
}
