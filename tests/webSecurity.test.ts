import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import { createWebSecurity } from "../web/security";

const token = "test-only-token-at-least-24-characters";
const request = (headers: IncomingMessage["headers"]) => ({ headers } as IncomingMessage);

test("Web access rejects foreign origin, DNS rebinding hosts and weak tokens", () => {
  const security = createWebSecurity(token, "http://127.0.0.1:8080");
  assert.equal(security.trustedRequest(request({ host: "127.0.0.1:8080" })), true);
  assert.equal(security.trustedRequest(request({ host: "attacker.example:8080" })), false);
  assert.equal(security.trustedRequest(request({ host: "127.0.0.1:8080", origin: "https://attacker.example" })), false);
  assert.equal(security.trustedRequest(request({ host: "127.0.0.1:8080", "sec-fetch-site": "cross-site" })), false);
  assert.throws(() => createWebSecurity("short", "http://127.0.0.1:8080"));
  assert.equal(security.validToken(token), true);
  assert.equal(security.validToken(token + "x"), false);
});

test("Web sessions expire, are revocable and are invalidated by server restart", () => {
  const security = createWebSecurity(token, "https://zotigo.example");
  const cookie = security.issueCookie(1000);
  assert.match(cookie, /HttpOnly; SameSite=Strict; Secure/);
  assert.equal(security.authenticated(request({ cookie }), 1001), true);
  assert.equal(security.authenticated(request({ cookie }), 1000 + 12 * 60 * 60 * 1000), false);
  assert.equal(security.authenticated(request({ cookie: cookie.replace(/=[a-f0-9]{64}/, "=" + "0".repeat(64)) }), 1001), false);
  assert.equal(createWebSecurity(token, "https://zotigo.example").authenticated(request({ cookie }), 1001), false);
  security.revoke(request({ cookie }));
  assert.equal(security.authenticated(request({ cookie }), 1001), false);
});
