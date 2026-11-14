import { useLocale } from "../i18n";
import { connectionLabel } from "./appHelpers";
import type { ConnectionState } from "./appTypes";

export function StatusPill({ state }: { state: ConnectionState }) {
  useLocale();
  return (
    <span className={`status-pill ${state}`}>
      <span />
      {connectionLabel(state)}
    </span>
  );
}
