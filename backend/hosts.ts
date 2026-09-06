import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { HostInput, HostProfile } from "../shared/hosts";

export interface Connection { id: string; name: string; baseUrl: string; token: string; }
const context = new AsyncLocalStorage<Connection>();
let file: string | null = null;
let hosts: Connection[] = [];
let localBaseUrl = process.env.ZOTIGOD_URL ?? "http://127.0.0.1:8766";
export function configureLocalHostUrl(url: string): void { localBaseUrl = url; }
export function initializeHosts(directory: string): void {
  file = path.join(directory, "hosts.json"); hosts = [];
  if (fs.existsSync(file)) {
    const data: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(data) || data.length > 50) throw new Error("Invalid saved hosts.");
    hosts = data.map((item) => validateInput(item, item.id));
    if (new Set(hosts.map((host) => host.id)).size !== hosts.length) throw new Error("Duplicate saved hosts.");
  }
}
function local(): Connection {
  return { id: "local", name: "Local", baseUrl: localBaseUrl, token: process.env.ZOTIGOD_AUTH_TOKEN_FILE ? fs.readFileSync(process.env.ZOTIGOD_AUTH_TOKEN_FILE, "utf8").trim() : "" };
}
export function resolveHost(id: string): Connection {
  const host = id === "local" ? local() : hosts.find((item) => item.id === id);
  if (!host) throw new Error("Host is no longer available.");
  return { ...host };
}
export function withConnection<T>(connection: Connection, run: () => T): T { return context.run(connection, run); }
export function currentHost(): Connection | undefined { return context.getStore(); }
export function withHost<T>(id: string, run: () => T): T { return context.run(resolveHost(id), run); }
export function listHosts(): HostProfile[] { return [local(), ...hosts].map(({ token, ...host }) => ({ ...host, hasToken: !!token })); }
export function saveHost(input: HostInput): HostProfile {
  if (input?.id) throw new Error("Add a new host to change connection credentials.");
  if (hosts.length >= 50) throw new Error("Too many saved hosts.");
  const next = validateInput(input, randomUUID());
  const updated = [...hosts, next];
  persist(updated); hosts = updated;
  const { token, ...host } = next; return { ...host, hasToken: !!token };
}
export function deleteHost(id: string): void {
  if (id === "local") throw new Error("The default host cannot be removed.");
  const updated = hosts.filter((host) => host.id !== id); persist(updated); hosts = updated;
}
function persist(value: Connection[]): void {
  if (!file) throw new Error("Host storage is not initialized.");
  const temporary = file + "." + randomUUID();
  fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  try { fs.renameSync(temporary, file); } finally { fs.rmSync(temporary, { force: true }); }
}
function validateInput(input: HostInput, id: string): Connection {
  if (!input || typeof input.name !== "string" || !input.name.trim() || input.name.length > 100 || typeof input.baseUrl !== "string") throw new Error("Enter a host name and address.");
  const url = new URL(input.baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) throw new Error("Use an HTTP(S) daemon origin without a path or credentials.");
  if (typeof id !== "string" || id === "local" || !/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid host ID.");
  if (input.token !== undefined && (typeof input.token !== "string" || input.token.length > 8192 || /[\r\n]/.test(input.token))) throw new Error("Invalid daemon token.");
  return { id, name: input.name.trim(), baseUrl: url.origin, token: input.token?.trim() ?? "" };
}
export async function testHost(id: string): Promise<void> {
  const host = resolveHost(id); const headers = host.token ? { Authorization: `Bearer ${host.token}` } : undefined;
  for (const endpoint of ["/health", "/projects", ...(id === "local" ? [] : ["/files/capabilities"])]) {
    const response = await fetch(host.baseUrl + endpoint, { headers, redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(endpoint === "/files/capabilities" && response.status === 404 ? "Update this daemon to support remote workspace files." : response.status === 401 ? "Daemon rejected the token." : `Daemon returned ${response.status}.`); }
    const result = await response.json();
    if (!result || result.code !== "ok" && result.code !== "success" && result.code !== 0) {
      if (!result?.data) throw new Error("This address is not a Zotigo daemon.");
    }
    if (endpoint === "/health" && result.data?.protocol_version !== "1") throw new Error("Unsupported daemon protocol.");
  }
}
