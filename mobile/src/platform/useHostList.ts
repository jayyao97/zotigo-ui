import { useEffect, useState } from "react";
import { errorText } from "../components/ui";
import type { Host } from "../core/client";
import { hosts } from "./storage";

/**
 * The saved devices, kept current: reloaded whenever a device is saved or
 * removed anywhere in the app. The iPad sidebar stays mounted across
 * navigation, so it cannot rely on screen focus to notice an added device.
 */
export function useHostList() {
  const [list, setList] = useState<Host[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let generation = 0;
    const load = () => {
      const ticket = ++generation;
      hosts
        .list()
        .then((value) => {
          if (!active || ticket !== generation) return;
          setList(value);
          setError("");
          setReady(true);
        })
        .catch((e) => {
          if (!active || ticket !== generation) return;
          setError(errorText(e));
          setReady(true);
        });
    };
    load();
    const unsubscribe = hosts.subscribe(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return { list, ready, error };
}
