import { currentHost, configureLocalHostUrl } from "../hosts";
import { fetchDaemon, type DaemonRequestInit } from "../daemonHttp";
import type { HealthResponse } from "../../shared/zotigod";
import type { DaemonConfig } from "../../shared/clientTypes";
import { expectRecord, expectString, expectOptionalString } from "./validation";
import { inputDeliveryOutcome } from "../../shared/inputDelivery";

const defaultBaseUrl = "http://127.0.0.1:8766";

let daemonBaseUrl = normalizeDaemonBaseUrl(process.env.ZOTIGOD_URL ?? defaultBaseUrl);

export class ZotigodRequestError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: string,
    readonly code?: string,
  ) {
    super(body || statusText || `zotigod request failed with ${status}`);
    this.name = "ZotigodRequestError";
  }
}

export function inputDeliveryFailure(error: unknown): "rejected" | "unknown" {
  // A timeout or server-side failure may follow durable admission.
  if (!(error instanceof ZotigodRequestError)) return "unknown";
  return inputDeliveryOutcome(error.status, error.code);
}

export function isMessageDuringActiveTurnError(error: unknown): boolean {
  return error instanceof ZotigodRequestError
    && error.status === 409
    && (error.code === "active_turn" || error.code === "conflict");
}

export class UnsupportedSessionEventsError extends Error {
  constructor() {
    super("zotigod does not support session event streams");
    this.name = "UnsupportedSessionEventsError";
  }
}

export class UnsupportedChannelsError extends Error {
  constructor(detail = "") {
    super(`Update zotigod to a version that supports Channels${detail ? `: ${detail}` : "."}`);
    this.name = "UnsupportedChannelsError";
  }
}

export function getDaemonConfig(): DaemonConfig {
  return { baseUrl: currentHost()?.baseUrl ?? daemonBaseUrl };
}

export function setDaemonBaseUrl(baseUrl: string): DaemonConfig {
  daemonBaseUrl = normalizeDaemonBaseUrl(baseUrl);
  configureLocalHostUrl(daemonBaseUrl);
  return getDaemonConfig();
}

export function health(signal?: AbortSignal): Promise<HealthResponse> {
  return requestJSON("/health", { signal }).then(parseHealthResponse);
}

export function jsonRequest(method: "POST" | "PUT", payload: Record<string, unknown>): RequestInit {
  return { method, body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } };
}

function normalizeDaemonBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error("zotigod URL is required");
  }

  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("zotigod URL must use http or https");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("zotigod URL must not include credentials, query, or fragment");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

export async function requestJSON(path: string, init: DaemonRequestInit = {}): Promise<unknown> {
  const response = await fetchDaemon(`${getDaemonConfig().baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  }).catch((error: unknown) => {
    if (!(error instanceof Error && error.name === "AbortError")) {
      console.warn("daemon_request_failed method=%s path=%s error_type=%s", init.method ?? "GET", path.split("?")[0], error instanceof Error ? error.name : typeof error);
    }
    throw error;
  });

  if (!response.ok) console.warn("daemon_http_error method=%s path=%s status=%d", init.method ?? "GET", path.split("?")[0], response.status);

  const body = await response.text();
  const trimmedBody = body.trim();
  let parsedBody: unknown;
  if (trimmedBody !== "") {
    try {
      parsedBody = JSON.parse(trimmedBody) as unknown;
    } catch {
      if (!response.ok) {
        throw new ZotigodRequestError(
          response.status,
          response.statusText,
          `The configured daemon at ${daemonBaseUrl} returned ${response.status} ${response.statusText} for ${path}. Verify that this address points to zotigod.`,
        );
      }
      throw new Error(`zotigod returned invalid JSON for ${path}`);
    }
  }

  if (!response.ok) {
    const error = parseApiError(parsedBody);
    throw new ZotigodRequestError(response.status, response.statusText, error.message || trimmedBody, error.code);
  }
  if (trimmedBody === "") {
    return undefined;
  }

  return unwrapApiResponse(parsedBody, path);
}

function unwrapApiResponse(value: unknown, path: string): unknown {
  const record = expectRecord(value, `zotigod response for ${path}`);
  const code = record.code;
  if (code === undefined) {
    return value;
  }
  if (code !== "ok") {
    const message = expectOptionalString(record.message, `zotigod response for ${path} message`);
    throw new Error(message || `zotigod returned ${String(code)} for ${path}`);
  }
  return record.data;
}

function parseApiError(value: unknown): { code?: string; message: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { message: "" };
  }
  const record = value as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : undefined,
    message: typeof record.message === "string" ? record.message : "",
  };
}

function parseHealthResponse(value: unknown): HealthResponse {
  const record = expectRecord(value, "health response");
  const response = {
    status: expectString(record.status, "health response status"),
    protocol_version: expectString(record.protocol_version, "health response protocol_version"),
  };
  if (response.status !== "ok" || response.protocol_version !== "1") {
    throw new Error("zotigod health response is incompatible");
  }
  return response;
}
