import { currentHost } from "./hosts";
import fs from "node:fs";

// Credentials belong to the configured endpoint, never a renderer-selected URL.
export function daemonHeaders(url: string, initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  const host = currentHost();
  if (host) {
    if (new URL(url).origin !== new URL(host.baseUrl).origin) throw new Error("Daemon credentials do not match this endpoint.");
    if (host.token) headers.set("Authorization", `Bearer ${host.token}`);
    return headers;
  }
  const tokenFile = process.env.ZOTIGOD_AUTH_TOKEN_FILE;
  if (tokenFile) {
    const endpoint = new URL(process.env.ZOTIGOD_URL ?? "http://127.0.0.1:8766");
    if (new URL(url).origin !== endpoint.origin) throw new Error("Daemon credentials do not match this endpoint.");
    const token = fs.readFileSync(tokenFile, "utf8").trim();
    if (!token) throw new Error("Daemon token file is empty.");
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

export function fetchDaemon(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, headers: daemonHeaders(url, init.headers), redirect: "error" });
}
