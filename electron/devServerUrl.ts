const defaultDevServerUrl = "http://127.0.0.1:5173";
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function resolveDevServerUrl(value = process.env.ZOTIGO_DESKTOP_DEV_SERVER_URL): string {
  if (value === undefined || value.trim() === "") return defaultDevServerUrl;
  const url = new URL(value);
  if (
    url.protocol !== "http:"
    || !loopbackHosts.has(url.hostname.toLowerCase())
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    throw new Error("ZOTIGO_DESKTOP_DEV_SERVER_URL must be a loopback HTTP URL without credentials, query, or fragment.");
  }
  return url.toString().replace(/\/$/, "");
}
