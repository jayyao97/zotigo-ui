import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { initializePreferencesStore } from "../backend/preferencesStore";
import { getDaemonConfig } from "../backend/zotigod";
import { createWebServer } from "./server";


const host = process.env.ZOTIGO_WEB_HOST ?? "127.0.0.1";
const port = Number(process.env.ZOTIGO_WEB_PORT ?? "8080");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid ZOTIGO_WEB_PORT.");
const origin = process.env.ZOTIGO_WEB_ORIGIN ?? `http://127.0.0.1:${port}`;
if (host !== "127.0.0.1" && !process.env.ZOTIGO_WEB_ORIGIN) throw new Error("Set ZOTIGO_WEB_ORIGIN before enabling remote access.");
if (host !== "127.0.0.1" && !origin.startsWith("https://") && process.env.ZOTIGO_WEB_ALLOW_HTTP !== "1") throw new Error("Remote Web access requires HTTPS, or ZOTIGO_WEB_ALLOW_HTTP=1 on a trusted network.");
const daemon = new URL(getDaemonConfig().baseUrl);
if (!["127.0.0.1", "localhost", "[::1]"].includes(daemon.hostname)) {
  throw new Error("Run the Web server on the same host as a loopback zotigod; file operations use that host's filesystem.");
}
const token = process.env.ZOTIGO_WEB_TOKEN ?? randomBytes(32).toString("base64url");
const dataDirectory = process.env.ZOTIGO_WEB_DATA_DIR ?? path.join(os.homedir(), ".zotigo", "web");
initializePreferencesStore(dataDirectory);
const server = createWebServer({ origin, token, assetsPath: path.resolve(__dirname, "../../dist") });
server.listen(port, host, () => {
  console.log(`Zotigo Web: ${origin}`);
  if (!process.env.ZOTIGO_WEB_TOKEN) {
    const tokenPath = path.join(dataDirectory, "access-token");
    const fd = fs.openSync(tokenPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600);
    try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, `${token}\n`); }
    finally { fs.closeSync(fd); }
    console.log(`Access token file (valid until restart): ${tokenPath}`);
  }
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => {
  server.close();
  server.closeAllConnections();
});
