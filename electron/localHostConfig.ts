import fs from "node:fs";
import { setDaemonBaseUrl } from "../backend/zotigod";

// The source installer links this file to its persistent Desktop configuration.
export function loadInstalledLocalHost(file: string): void {
  if (process.env.ZOTIGOD_URL !== undefined || !fs.lstatSync(file, { throwIfNoEntry: false })) return;
  const config: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!config || typeof config !== "object" || !("baseUrl" in config) || typeof config.baseUrl !== "string"
    || !("tokenFile" in config) || typeof config.tokenFile !== "string") {
    throw new Error("Invalid installed Local connection configuration.");
  }
  process.env.ZOTIGOD_URL = setDaemonBaseUrl(config.baseUrl).baseUrl;
  process.env.ZOTIGOD_AUTH_TOKEN_FILE ??= config.tokenFile;
}
