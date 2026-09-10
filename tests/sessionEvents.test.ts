import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

import {
  parseSessionEventFrame,
  setDaemonBaseUrl,
  streamSessionEvents,
  UnsupportedSessionEventsError,
} from "../backend/zotigod";
import type { SessionDisplayEvent } from "../shared/zotigod";

let server: http.Server;
let baseUrl = "";

before(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/sessions/held/events") {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(": heartbeat\n\n");
      return;
    }
    if (request.url === "/sessions/session-1/events?after=3") {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(": heartbeat\n\n");
      response.write('event: delta\ndata: {"item_id":"assistant-1","role":"assistant",');
      response.write('"part_type":"text","delta":"Hel"}\n\n');
      response.end(
        `event: item\nid: 4\ndata: ${JSON.stringify(displayItem("assistant-1", 4, "Hello"))}\n\n`,
      );
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
  setDaemonBaseUrl(baseUrl);
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("parses mixed delta and durable item events across chunks", async () => {
  const events: SessionDisplayEvent[] = [];
  let connected = false;

  await streamSessionEvents(
    "session-1",
    3,
    (event) => { events.push(event); },
    () => {
      connected = true;
    },
    new AbortController().signal,
  );

  assert.equal(connected, true);
  assert.deepEqual(events[0], {
    type: "delta",
    delta: { item_id: "assistant-1", role: "assistant", part_type: "text", delta: "Hel" },
  });
  assert.equal(events[1]?.type, "item");
  if (events[1]?.type === "item") {
    assert.equal(events[1].item.id, "assistant-1");
    assert.equal(events[1].item.sequence, 4);
    assert.equal(events[1].item.content?.[0]?.text, "Hello");
  }
});

test("reports old daemons without the events endpoint", async () => {
  await assert.rejects(
    streamSessionEvents(
      "missing",
      undefined,
      () => undefined,
      () => undefined,
      new AbortController().signal,
    ),
    UnsupportedSessionEventsError,
  );
});

test("aborts a connected event stream without waiting for more data", async () => {
  const controller = new AbortController();
  await assert.rejects(
    streamSessionEvents(
      "held",
      undefined,
      () => undefined,
      () => controller.abort(),
      controller.signal,
    ),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});

test("parses volatile shell progress with its tool call identity", () => {
  const event = parseSessionEventFrame({
    event: "delta",
    id: "",
    data: [JSON.stringify({
      item_id: "tool-progress:call-1",
      role: "assistant",
      part_type: "tool_progress",
      delta: "building...\n",
      tool_call_id: "call-1",
      tool_name: "shell",
    })],
  });
  assert.deepEqual(event, {
    type: "delta",
    delta: {
      item_id: "tool-progress:call-1",
      role: "assistant",
      part_type: "tool_progress",
      delta: "building...\n",
      tool_call_id: "call-1",
      tool_name: "shell",
    },
  });
});

test("parses volatile subagent progress with its parent spawn identity", () => {
  const event = parseSessionEventFrame({
    event: "delta",
    id: "",
    data: [JSON.stringify({
      item_id: "subagent-text-1",
      role: "assistant",
      part_type: "text",
      delta: "Reviewing",
      subagent: {
        tool_call_id: "spawn-1",
        name: "reviewer",
        agent_type: "general-purpose",
        status: "running",
      },
    })],
  });
  assert.equal(event?.type, "delta");
  if (event?.type === "delta") {
    assert.equal(event.delta.subagent?.tool_call_id, "spawn-1");
    assert.equal(event.delta.subagent?.status, "running");
  }
});

function displayItem(id: string, sequence: number, text: string) {
  return {
    id,
    sequence,
    type: "assistant_message" as const,
    role: "assistant",
    content: [{ type: "text", text }],
    created_at: new Date(0).toISOString(),
  };
}
