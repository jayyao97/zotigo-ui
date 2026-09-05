import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

const sessionLifetimeMs = 12 * 60 * 60 * 1000;
const cookieName = "zotigo_web_session";

export function createWebSecurity(token: string, origin: string) {
  if (token.length < 24) throw new Error("ZOTIGO_WEB_TOKEN must contain at least 24 characters.");
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
    throw new Error("Web origin must be an HTTP(S) origin without a path.");
  }
  const sessions = new Map<string, number>();
  const tokenHash = createHash("sha256").update(token).digest();

  const attributes = `Path=/; HttpOnly; SameSite=Strict${url.protocol === "https:" ? "; Secure" : ""}`;

  return {
    trustedRequest(request: IncomingMessage): boolean {
      return request.headers.host === url.host
        && (!request.headers.origin || request.headers.origin === origin)
        && request.headers["sec-fetch-site"] !== "cross-site";
    },
    validToken(value: unknown): boolean {
      return typeof value === "string" && timingSafeEqual(tokenHash, createHash("sha256").update(value).digest());
    },
    issueCookie(now = Date.now()): string {
      for (const [id, expires] of sessions) if (expires <= now) sessions.delete(id);
      if (sessions.size >= 256) throw new Error("Too many active Web sessions. Restart the server or wait for sessions to expire.");
      const id = randomBytes(32).toString("hex");
      sessions.set(id, now + sessionLifetimeMs);
      return `${cookieName}=${id}; ${attributes}; Max-Age=${sessionLifetimeMs / 1000}`;
    },
    clearCookie(): string {
      return `${cookieName}=; ${attributes}; Max-Age=0`;
    },
    expiresAt(request: IncomingMessage): number {
      return sessions.get(sessionId(request)) ?? 0;
    },
    revoke(request: IncomingMessage): void {
      sessions.delete(sessionId(request));
    },
    authenticated(request: IncomingMessage, now = Date.now()): boolean {
      return (sessions.get(sessionId(request)) ?? 0) > now;
    },
  };
}

function sessionId(request: IncomingMessage): string {
  return request.headers.cookie?.split(";").map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? "";
}
