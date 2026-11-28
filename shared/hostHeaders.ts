import { t } from "./i18n/index";

export interface HostHeaderInput { name: string; value?: string }
export interface HostHeader { readonly name: string; readonly value: string }

// The client and HTTP transport own these fields. In particular the daemon
// bearer and request framing must not be replaced by a gateway credential.
const reserved = /^(?:authorization|host|content-length|content-type|accept|accept-encoding|connection|keep-alive|transfer-encoding|upgrade|expect|te|trailer|origin|referer|cookie|set-cookie|x-zotigo-.*|sec-.*|proxy-.*)$/i;

export function resolveHostHeaders(rows: readonly HostHeaderInput[], saved: readonly HostHeader[] = []): HostHeader[] {
  if (!Array.isArray(rows) || rows.length > 32) throw new Error(t("hostShell.invalidHeaders"));
  const names = new Set<string>();
  return rows.map((row) => {
    const name = typeof row?.name === "string" ? row.name.trim().toLowerCase() : "";
    if (!/^[!#$%&'*+.^_`|~a-z0-9-]{1,128}$/.test(name) || reserved.test(name) || names.has(name))
      throw new Error(t("hostShell.invalidHeaderName"));
    names.add(name);
    const value = row.value === undefined ? saved.find(header => header.name === name)?.value : row.value;
    if (typeof value !== "string" || !value.trim() || value.length > 8192 || /[^\x20-\x7e]/.test(value))
      throw new Error(t("hostShell.invalidHeaderValue"));
    return Object.freeze({ name, value: value.trim() });
  }).sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export function hostRequestHeaders(connection: { token: string; headers?: readonly HostHeader[] }, initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  for (const header of connection.headers ?? []) headers.set(header.name, header.value);
  if (connection.token) headers.set("Authorization", `Bearer ${connection.token}`);
  return headers;
}
