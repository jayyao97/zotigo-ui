import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HostShell } from "./HostShell";
import { ClientContext } from "./ClientContext";
import { WebApp } from "./web/WebApp";
import "./styles.css";

document.documentElement.dataset.platform = window.zotigo ? "desktop" : "web";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {window.zotigo
      ? <ClientContext.Provider value={{ api: window.zotigo, kind: "desktop" }}><HostShell /></ClientContext.Provider>
      : <WebApp />}
  </StrictMode>,
);
