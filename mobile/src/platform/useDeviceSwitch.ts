import { t } from "@zotigo/shared/i18n/index";
import { createContext, useContext, useState } from "react";
import { DeviceSwitch, DeviceUnreachable, type SwitchState } from "../core/deviceSwitch";
import { createDaemon } from "./client";
import { hosts, storage } from "./storage";

export const lastHostKey = "zotigo.mobile.lastHost";

/** Creates the app's one device-switching flow. Only `App` calls this. */
export function useDeviceSwitchRoot() {
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

/**
 * One flow for the whole app, so the Home switcher, the iPad sidebar and the
 * Devices screen (which can be on screen together on iPad) share it and the
 * newest choice wins wherever it was made.
 */
export const DeviceSwitchContext = createContext<ReturnType<typeof useDeviceSwitchRoot> | null>(null);

export function useDeviceSwitch() {
  const value = useContext(DeviceSwitchContext);
  if (!value) throw new Error("DeviceSwitchContext is missing.");
  return value;
}

/** Daemon and storage errors keep their own text; only "no answer" is ours to word. */
export function connectionErrorText(error: unknown, name: string) {
  if (error instanceof DeviceUnreachable) return t("mobileUi.deviceUnreachable", { name });
  return error instanceof Error ? error.message : t("mobile.somethingWentWrong");
}
