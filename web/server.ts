import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createApplicationService } from "../backend/applicationService";
import { createSessionEvents } from "../backend/sessionEvents";
import { getDaemonConfig, inspectCatalogSource } from "../backend/zotigod";
import { imageDownloadUrl } from "../backend/imageDownload";
import { createWebSecurity } from "./security";
import { writeSessionEvent } from "./eventStream";
import { createSelectionStore } from "../shared/catalogSelection";

const maxBodyBytes = 30 * 1024 * 1024; // Five images, up to 20 MiB total, encoded as base64.
const nativeOnly = new Set([
  "desktop:choose-source-folders", "desktop:reveal-path", "desktop:download-image",
  "sessions:subscribe-events", "sessions:unsubscribe-events",
]);

export function createWebServer(options: { origin: string; token: string; assetsPath: string }) {
  const security = createWebSecurity(options.token, options.origin);
  const unavailable = async () => { throw new Error("This operation requires the Desktop application."); };
  const platform = {
    chooseSourceFolders: unavailable, openPath: unavailable,
    openExternal: unavailable, downloadImage: unavailable,
  };
  const streams = new Map<() => void, IncomingMessage>();
  let loginAttempts = 0;
  let loginWindowStart = Date.now();

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      if (response.headersSent) { response.destroy(); return; }
      const status = error instanceof RequestError ? error.status : 500;
      json(response, status, { error: status === 500 ? "Web request failed." : (error as Error).message });
    });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.on("close", () => { for (const stop of streams.keys()) stop(); });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (!security.trustedRequest(request)) throw new RequestError(403, "Untrusted request origin or host.");
    const url = new URL(request.url ?? "/", options.origin);
    if (request.method === "POST") {
      if (request.headers["x-zotigo-request"] !== "1" || request.headers["content-type"] !== "application/json") {
        throw new RequestError(403, "Expected a same-origin JSON request.");
      }
      if (url.pathname === "/api/login") {
        if (Date.now() - loginWindowStart > 60_000) { loginAttempts = 0; loginWindowStart = Date.now(); }
        if (++loginAttempts > 20) throw new RequestError(429, "Too many login attempts. Try again in one minute.");
        const body = await readJson(request, 4096);
        if (!security.validToken(body.token)) throw new RequestError(401, "Invalid access token.");
        response.setHeader("Set-Cookie", security.issueCookie());
        json(response, 200, { ok: true });
        return;
      }
      if (!security.authenticated(request)) throw new RequestError(401, "Sign in to Zotigo Web.");
      if (url.pathname === "/api/logout") {
        security.revoke(request);
        for (const [stop, owner] of streams) if (!security.authenticated(owner)) stop();
        response.setHeader("Set-Cookie", security.clearCookie());
        json(response, 200, { ok: true });
        return;
      }
      if (url.pathname === "/api/inspect-sources") {
        const body = await readJson(request, 64 * 1024);
        if (!Array.isArray(body.paths) || body.paths.length > 20 || body.paths.some((item) => typeof item !== "string" || !path.isAbsolute(item))) {
          throw new RequestError(400, "Choose up to 20 absolute paths on the server.");
        }
        const sources = [];
        for (const selectedPath of body.paths as string[]) {
          const result = await inspectCatalogSource(selectedPath);
          sources.push({ selectedPath, canonicalPath: result.canonical_path, name: path.basename(result.canonical_path), kind: result.kind });
        }
        json(response, 200, sources);
        return;
      }
      if (url.pathname !== "/api/rpc") throw new RequestError(404, "Unknown endpoint.");
      const body = await readJson(request, maxBodyBytes);
      if (typeof body.channel !== "string" || !Array.isArray(body.args) || body.args.length > 8) throw new RequestError(400, "Invalid application request.");
      if (nativeOnly.has(body.channel)) throw new RequestError(400, "Use the Web platform operation.");
      const selection = createSelectionStore(body.selection);
      const application = createApplicationService(platform, () => {}, selection);
      const result = body.channel === "daemon:get-config"
        ? { ok: true, value: { baseUrl: options.origin } }
        : await application.invoke(body.channel, body.args);
      application.dispose();
      json(response, 200, { ...result, selection: selection.getCatalogSelection() });
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") throw new RequestError(405, "Method not allowed.");
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/sessions/")) {
      if (!security.authenticated(request)) throw new RequestError(401, "Sign in to Zotigo Web.");
      if (url.pathname === "/api/session") { json(response, 200, { ok: true }); return; }
      if (url.pathname === "/api/events" && request.method === "GET") {
        const session = url.searchParams.get("session");
        const lastEventId = request.headers["last-event-id"];
        const after = typeof lastEventId === "string" && lastEventId ? lastEventId : url.searchParams.get("after");
        if (!session || session.length > 256 || (after !== null && (!/^\d+$/.test(after) || !Number.isSafeInteger(Number(after)) || Number(after) < 1))) {
          throw new RequestError(400, "Invalid event subscription.");
        }
        if (streams.size >= 32) throw new RequestError(429, "Too many event streams.");
        response.writeHead(200, { "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" });
        response.flushHeaders();
        const controller = new AbortController();
        const events = createSessionEvents((event) => writeSessionEvent(response, event, controller.signal));
        const heartbeat = setInterval(() => { if (!response.writableNeedDrain) response.write(": keepalive\n\n"); }, 15_000);
        const expiry = setTimeout(() => stop(), Math.max(0, security.expiresAt(request) - Date.now()));
        const stop = () => {
          clearInterval(heartbeat); clearTimeout(expiry); controller.abort();
          events.stop(); streams.delete(stop); response.destroy();
        };
        streams.set(stop, request);
        response.on("close", stop);
        events.start(session, after === null ? undefined : Number(after));
        return;
      }
      if (/^\/sessions\/[^/]+\/images\/[^/]+$/.test(url.pathname)) {
        const source = imageDownloadUrl(`${getDaemonConfig().baseUrl}${url.pathname}`, getDaemonConfig().baseUrl);
        const controller = new AbortController();
        response.on("close", () => controller.abort());
        const upstream = await fetch(source, { redirect: "error", signal: controller.signal });
        if (!upstream.ok) throw new RequestError(upstream.status, "Image unavailable.");
        const mediaType = upstream.headers.get("content-type")?.split(";")[0];
        if (!mediaType || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mediaType)) throw new RequestError(415, "Unsupported image type.");
        response.setHeader("Content-Type", mediaType);
        if (url.searchParams.has("download")) response.setHeader("Content-Disposition", "attachment");
        if (request.method === "HEAD") { await upstream.body?.cancel(); response.end(); return; }
        if (!upstream.body) throw new RequestError(502, "Empty image response.");
        const body = upstream.body;
        async function* chunks() {
          let total = 0;
          const reader = body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) return;
              total += value.length;
              if (total > 50 * 1024 * 1024) throw new Error("Image exceeds download limit.");
              yield value;
            }
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
        }
        await pipeline(chunks(), response);
        return;
      }
      throw new RequestError(404, "Unknown endpoint.");
    }
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    let file: string;
    try {
      const root = await realpath(options.assetsPath);
      file = await realpath(path.join(root, decodeURIComponent(pathname)));
      const relative = path.relative(root, file);
      if (relative.startsWith("..") || path.isAbsolute(relative) || !(await stat(file)).isFile()) throw new Error("Outside assets");
    } catch { throw new RequestError(404, "File not found."); }
    const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
    response.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
    response.end(request.method === "HEAD" ? undefined : await readFile(file));
  }

  return server;
}

class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function readJson(request: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new RequestError(413, "Request is too large.");
    chunks.push(Buffer.from(chunk));
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object");
    return value as Record<string, unknown>;
  } catch { throw new RequestError(400, "Invalid JSON object."); }
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}
