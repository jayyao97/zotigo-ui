import { useEffect, useMemo, useState } from "react";
import { HostShell } from "../HostShell";
import { ClientContext } from "../ClientContext";
import { createWebClient, webRequest, WebRequestError } from "./api";

export function WebApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const client = useMemo(() => createWebClient(), []);

  useEffect(() => {
    const expired = () => {
      setAuthenticated(false); client.dispose();
    };
    window.addEventListener("zotigo:unauthorized", expired);
    let active = true;
    void webRequest("/api/session").then(() => { if (active) setAuthenticated(true); })
      .catch((error: unknown) => {
        if (active && !(error instanceof WebRequestError && error.status === 401)) {
          setError(error instanceof Error ? error.message : "Cannot connect to the workspace server.");
        }
      }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; client.dispose(); window.removeEventListener("zotigo:unauthorized", expired); };
  }, [client]);
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
  } }}>
    <HostShell />
  </ClientContext.Provider>;
}
