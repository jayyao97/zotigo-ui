import { useEffect, useMemo, useRef, useState } from "react";
import type { SourceCandidate } from "../../shared/clientTypes";
import { HostShell } from "../HostShell";
import { ClientContext } from "../ClientContext";
import { createWebClient, webRequest, WebRequestError } from "./api";

export function WebApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [paths, setPaths] = useState("");
  const [pickerError, setPickerError] = useState("");
  const [pickerBusy, setPickerBusy] = useState(false);
  const resolvePicker = useRef<((sources: SourceCandidate[]) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const client = useMemo(() => createWebClient(() => new Promise((resolve) => {
    resolvePicker.current?.([]);
    resolvePicker.current = resolve;
    setPaths(""); setPickerError(""); setPickerBusy(false); setPicker(true);
  })), []);

  useEffect(() => {
    const expired = () => {
      setAuthenticated(false); client.dispose();
      resolvePicker.current?.([]); resolvePicker.current = null; setPicker(false);
    };
    window.addEventListener("zotigo:unauthorized", expired);
    let active = true;
    void webRequest("/api/session").then(() => { if (active) setAuthenticated(true); })
      .catch((error: unknown) => {
        if (active && !(error instanceof WebRequestError && error.status === 401)) {
          setError(error instanceof Error ? error.message : "Cannot connect to the workspace server.");
        }
      }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; client.dispose(); resolvePicker.current?.([]); window.removeEventListener("zotigo:unauthorized", expired); };
  }, [client]);
  useEffect(() => { if (picker) dialog.current?.showModal(); }, [picker]);

  function closePicker(sources: SourceCandidate[]) {
    dialog.current?.close(); setPicker(false);
    resolvePicker.current?.(sources); resolvePicker.current = null;
  }

  if (!authenticated) return <main className="web-login">
    <form onSubmit={(event) => {
      event.preventDefault(); setBusy(true); setError("");
      void webRequest("/api/login", { token }).then(() => { setToken(""); setAuthenticated(true); })
        .catch((error: Error) => setError(error.message)).finally(() => setBusy(false));
    }}>
      <h1>Zotigo Web</h1>
      <p>Connect to your workspace server. The access token is shown when the server starts.</p>
      <label htmlFor="web-token">Access token</label>
      <input id="web-token" type="password" autoComplete="current-password" value={token} onChange={(event) => setToken(event.target.value)} required disabled={checking || busy} />
      {error && <p role="alert">{error}</p>}
      <button disabled={checking || busy || !token}>{checking ? "Connecting…" : busy ? "Signing in…" : "Sign in"}</button>
    </form>
  </main>;

  return <ClientContext.Provider value={{ api: client.api, kind: "web", signOut: async () => {
    await webRequest("/api/logout", {});
    client.dispose(); setAuthenticated(false);
    resolvePicker.current?.([]); resolvePicker.current = null; setPicker(false);
  } }}>
    <HostShell />
    {picker && <dialog ref={dialog} className="web-source-picker" onCancel={(event) => { event.preventDefault(); closePicker([]); }}>
      <form onSubmit={(event) => {
        event.preventDefault(); setPickerBusy(true); setPickerError("");
        const owner = resolvePicker.current;
        void webRequest<SourceCandidate[]>("/api/inspect-sources", { paths: paths.split("\n").map((item) => item.trim()).filter(Boolean) })
          .then((sources) => { if (resolvePicker.current === owner) closePicker(sources); })
          .catch((error: Error) => { if (resolvePicker.current === owner) setPickerError(error.message); })
          .finally(() => { if (resolvePicker.current === owner) setPickerBusy(false); });
      }}>
        <h2>Add server folders</h2>
        <p>Enter absolute paths on the machine running Zotigo, one per line. These are not folders on your browser's device.</p>
        <label htmlFor="server-paths">Server paths</label>
        <textarea id="server-paths" value={paths} onChange={(event) => setPaths(event.target.value)} autoFocus required rows={4} />
        {pickerError && <p role="alert">{pickerError}</p>}
        <div><button type="button" onClick={() => closePicker([])}>Cancel</button><button disabled={pickerBusy || !paths.trim()}>{pickerBusy ? "Checking…" : "Add folders"}</button></div>
      </form>
    </dialog>}
  </ClientContext.Provider>;
}
