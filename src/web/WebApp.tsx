import { useLocale } from "../i18n";
import { t } from "../../shared/i18n/index";
import { useWebViewport } from "./useWebViewport";
import { useEffect, useMemo, useState } from "react";
import { HostShell } from "../HostShell";
import { ClientContext } from "../ClientContext";
import { createWebClient, webRequest, WebRequestError } from "./api";

export function WebApp() {
  useLocale();
  useWebViewport();
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
          setError(error instanceof Error ? error.message : t("webApp.cannotConnectToTheWorkspaceServer"));
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
      <img className="web-login-brand" src="./brand/zotigo-sprite.png" alt="" aria-hidden="true" />
      <h1>{t("webApp.zotigoWeb")}</h1>
      <p>{t("webApp.connectToYourWorkspaceServerTheAccessToken")}</p>
      <label htmlFor="web-token">{t("webApp.accessToken")}</label>
      <input id="web-token" type="password" autoComplete="current-password" value={token} onChange={(event) => setToken(event.target.value)} required disabled={checking || busy} />
      {error && <p role="alert">{error}</p>}
      <button disabled={checking || busy || !token}>{checking ? t("webApp.connecting") : busy ? t("webApp.signingIn") : t("webApp.signIn")}</button>
    </form>
  </main>;

  return <ClientContext.Provider value={{ api: client.api, kind: "web", signOut: async () => {
    await webRequest("/api/logout", {});
    client.dispose(); setAuthenticated(false);
  } }}>
    <HostShell />
  </ClientContext.Provider>;
}
