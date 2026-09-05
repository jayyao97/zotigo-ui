import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

import {
  changeSessionApprovalPolicy,
  createSession,
  health,
  listSessionItems,
  setDaemonBaseUrl,
  submitSessionApproval,
} from "../backend/zotigod";

let server: http.Server;
const requestBodies: unknown[] = [];

before(async () => {
  server = http.createServer(async (request, response) => {
    const body = await readJSONBody(request);
    if (body !== undefined) {
      requestBodies.push(body);
    }

    if (request.method === "POST" && request.url === "/sessions") {
      writeJSON(response, 200, {
        code: "ok",
        message: "",
        data: session("bypass_permissions"),
      });
      return;
    }
    if (request.method === "PUT" && request.url === "/sessions/session-1/approval-policy") {
      writeJSON(response, 202, {
        code: "ok",
        message: "",
        data: {
          approval_policy: "auto",
          status: "pending",
          command_id: "command-1",
        },
      });
      return;
    }
    if (request.method === "GET" && request.url === "/sessions/session-1/items?limit=50") {
      writeJSON(response, 200, {
        code: "ok",
        message: "",
        data: {
          items: [
            {
              id: "item-1",
              sequence: 1,
              type: "approval_policy_changed",
              approval_policy: {
                command_id: "command-1",
                from: "bypass_permissions",
                to: "auto",
              },
              created_at: new Date(0).toISOString(),
            },
            {
              id: "approval-item-1",
              sequence: 2,
              type: "approval_request",
              approval: {
                id: "approval-1",
                turn_id: "turn-1",
                pending: [{
                  tool_call_id: "call-1",
                  tool_name: "shell",
                  arguments: '{"command":"rm file"}',
                  reason: "destructive command",
                  risk_level: "high",
                  requires_snapshot: true,
                }],
              },
              created_at: new Date(1).toISOString(),
            },
          ],
          next_cursor: "1",
          prev_cursor: "",
          has_more: false,
        },
      });
      return;
    }
    if (request.method === "POST" && request.url === "/sessions/session-1/approvals/approval-1") {
      writeJSON(response, 200, {
        code: "ok",
        message: "",
        data: {
          id: "approval-1",
          session_id: "session-1",
          turn_id: "turn-1",
          status: "resolved",
          pending: [{ tool_call_id: "call-1", tool_name: "shell", arguments: '{"command":"rm file"}' }],
          decisions: [{ tool_call_id: "call-1", approved: true }],
          created_at: new Date(0).toISOString(),
          resolved_at: new Date(1).toISOString(),
        },
      });
      return;
    }
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(404, { "Content-Type": "text/html" });
      response.end("<!DOCTYPE html><title>Error response</title><h1>Not Found</h1>");
      return;
    }
    writeJSON(response, 404, { code: "not_found", message: "not found" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  setDaemonBaseUrl(`http://127.0.0.1:${address.port}`);
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("creates sessions with an explicit approval policy", async () => {
  const created = await createSession({
    workingDirectory: "/tmp/project",
    profile: "test-profile",
    approvalPolicy: "bypass_permissions",
  });

  assert.equal(created.approval_policy, "bypass_permissions");
  assert.deepEqual(requestBodies.shift(), {
    working_directory: "/tmp/project",
    profile: "test-profile",
    approval_policy: "bypass_permissions",
  });
});

test("changes a session approval policy and accepts pending responses", async () => {
  const result = await changeSessionApprovalPolicy("session-1", "auto");

  assert.deepEqual(result, {
    approval_policy: "auto",
    status: "pending",
    command_id: "command-1",
  });
  assert.deepEqual(requestBodies.shift(), { approval_policy: "auto" });
});

test("parses approval policy completion items", async () => {
  const response = await listSessionItems("session-1", { limit: 50 });

  assert.equal(response.items[0].type, "approval_policy_changed");
  assert.deepEqual(response.items[0].approval_policy, {
    command_id: "command-1",
    from: "bypass_permissions",
    to: "auto",
  });
  assert.deepEqual(response.items[1].approval?.pending?.[0], {
    tool_call_id: "call-1",
    tool_name: "shell",
    arguments: '{"command":"rm file"}',
    description: undefined,
    reason: "destructive command",
    risk_level: "high",
    source: undefined,
    requires_snapshot: true,
  });
});

test("submits and parses approval decisions", async () => {
  const result = await submitSessionApproval("session-1", "approval-1", [
    { tool_call_id: "call-1", approved: true },
  ]);

  assert.equal(result.status, "resolved");
  assert.deepEqual(result.decisions, [{
    tool_call_id: "call-1",
    approved: true,
    reason: undefined,
    modified_args: undefined,
  }]);
  assert.deepEqual(requestBodies.shift(), {
    decisions: [{ tool_call_id: "call-1", approved: true }],
  });
});

test("does not expose an HTML error page when the configured port belongs to another service", async () => {
  await assert.rejects(
    health(),
    (error: unknown) => error instanceof Error
      && /Verify that this address points to zotigod/.test(error.message)
      && !error.message.includes("<!DOCTYPE"),
  );
});

function session(approvalPolicy: "auto" | "bypass_permissions") {
  return {
    id: "session-1",
    state: "created",
    live: true,
    approval_policy: approvalPolicy,
    created_at: new Date(0).toISOString(),
  };
}

async function readJSONBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function writeJSON(response: http.ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}
