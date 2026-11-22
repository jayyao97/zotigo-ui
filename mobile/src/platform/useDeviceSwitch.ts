import { t } from "@zotigo/shared/i18n/index";
import { useState } from "react";
import { DeviceSwitch, DeviceUnreachable, type SwitchState } from "../core/deviceSwitch";
import { createDaemon } from "./client";
import { hosts, storage } from "./storage";

export const lastHostKey = "zotigo.mobile.lastHost";

/** The one device-switching flow, shared by the Home switcher and the Devices screen. */
export function useDeviceSwitch() {
  const [state, setState] = useState<SwitchState>({});
  const [switcher] = useState(
    () =>
      new DeviceSwitch(
        {
          connection: (host) => hosts.connection(host),
          create: createDaemon,
          remember: (id) => storage.set(lastHostKey, id),
        },
        setState,
      ),
  );
  return [state, switcher] as const;
}

/** Daemon and storage errors keep their own text; only "no answer" is ours to word. */
export function connectionErrorText(error: unknown, name: string) {
  if (error instanceof DeviceUnreachable) return t("mobileUi.deviceUnreachable", { name });
  return error instanceof Error ? error.message : t("mobile.somethingWentWrong");
}
