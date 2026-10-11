import test from "node:test";
import assert from "node:assert/strict";
import type { DisplayItem, SessionItemsResponse } from "@zotigo/shared/zotigod";
import { DaemonClient } from "../src/core/client";
import { Timeline, type TimelineSnapshot } from "../src/core/timeline";

const connection = {
  id: "a",
  name: "Home",
  baseUrl: "https://home.test",
  token: "secret",
};
const session = { id: "s", state: "running", live: true, created_at: "" };
const item = (
  sequence: number,
  type: DisplayItem["type"] = "assistant_message",
): DisplayItem => ({
  id: `i${sequence}`,
  sequence,
  type,
  created_at: "",
  content: [{ type: "text", text: "Saved" }],
});
const page = (
  items: DisplayItem[],
  prev_cursor = "",
): SessionItemsResponse => ({
  items,
  prev_cursor,
  next_cursor: "",
  has_more: !!prev_cursor,
});
const json = (data: unknown) => Response.json({ code: "ok", data });
function streamBody() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    response: () =>
      new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
    emit: (type: string, data: unknown) =>
      controller.enqueue(
        new TextEncoder().encode(
          `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`,
        ),
      ),
    close: () => {
      if (!cancelled) controller.close();
    },
    cancelled: () => cancelled,
  };
}
function waitFor(
  timeline: Timeline,
  predicate: (state: TimelineSnapshot) => boolean,
) {
  if (predicate(timeline.snapshot())) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error("Timeline condition timed out"));
    }, 2500);
    const off = timeline.subscribe(() => {
      if (predicate(timeline.snapshot())) {
        clearTimeout(timer);
        off();
        resolve();
      }
    });
  });
}

test("Timeline.start resumes from durable cursor and clears uncommitted preview on reconnect", async () => {
  const first = streamBody(),
    second = streamBody();
  const cursors: string[] = [];
  const client = new DaemonClient(connection, async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/items")) return json(page([item(10)]));
    if (parsed.pathname.endsWith("/events")) {
      cursors.push(parsed.searchParams.get("after")!);
      return cursors.length === 1 ? first.response() : second.response();
    }
    return json(session);
  });
  const timeline = new Timeline(client, "s");
  const running = timeline.start();
  try {
    await waitFor(timeline, (s) => s.status === "connected");
    first.emit("item", item(11));
    first.emit("delta", {
      item_id: "unfinished",
      role: "assistant",
      part_type: "text",
      delta: "Temporary preview",
    });
    await waitFor(timeline, (s) => s.previews.length === 1);
    first.close();
    await waitFor(
      timeline,
      (s) => s.status === "connected" && cursors.length === 2,
    );
    assert.deepEqual(cursors, ["10", "11"]);
    assert.equal(timeline.snapshot().previews.length, 0);
    assert.deepEqual(
      timeline.snapshot().items.map((i) => i.sequence),
      [10, 11],
    );
  } finally {
    timeline.stop();
    second.close();
    await running;
  }
});

test("Timeline.stop cancels a pending reader and finishes without waiting for another server event", async () => {
  const stream = streamBody();
  let requestSignal: AbortSignal | undefined;
  const client = new DaemonClient(connection, async (url, init) => {
    if (url.includes("/items?")) return json(page([item(1)]));
    if (url.includes("/events?")) {
      requestSignal = init?.signal ?? undefined;
      return stream.response();
    }
    return json(session);
  });
  const timeline = new Timeline(client, "s");
  const running = timeline.start();
  await waitFor(timeline, (s) => s.status === "connected");
  // Let start() enter reader.read() before stopping. The mock deliberately leaves the body
  // open on request abort, as native transports can deliver abort separately from body closure.
  await new Promise<void>((resolve) => setImmediate(resolve));
  timeline.stop();
  const finished = await Promise.race([
    running.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 150)),
  ]);
  const cancelled = stream.cancelled();
  if (!cancelled) stream.close();
  await running;
  assert.equal(requestSignal?.aborted, true);
  assert.equal(finished, true, "stop must release a pending reader");
  assert.equal(cancelled, true);
  assert.equal(timeline.snapshot().status, "offline");
});

test("Timeline.start backfills beyond recent page to recover pending approval in the active turn", async () => {
  const stream = streamBody();
  const before: Array<string | null> = [];
  const started: DisplayItem = {
    ...item(1, "turn_started"),
    turn: { id: "turn-a" },
  };
  const approval: DisplayItem = {
    ...item(2, "approval_request"),
    approval: {
      id: "approval-a",
      turn_id: "turn-a",
      pending: [{ tool_call_id: "tool-a" }],
    },
  };
  const client = new DaemonClient(connection, async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/items")) {
      const cursor = parsed.searchParams.get("before");
      before.push(cursor);
      return json(
        cursor === null
          ? page([item(5), item(6)], "older")
          : cursor === "5"
            ? page([approval, item(3)], "earlier")
            : page([started]),
      );
    }
    if (parsed.pathname.endsWith("/events")) return stream.response();
    return json(session);
  });
  const timeline = new Timeline(client, "s");
  const running = timeline.start();
  try {
    await waitFor(timeline, (s) => s.status === "connected");
    assert.deepEqual(before, [null, "5", "2"]);
    assert.deepEqual([...timeline.pending().approvals], ["approval-a"]);
    assert.deepEqual(
      timeline.snapshot().items.map((i) => i.sequence),
      [1, 2, 3, 5, 6],
    );
  } finally {
    timeline.stop();
    stream.close();
    await running;
  }
});

test("pending older-page response is ignored after stop", async () => {
  const stream = streamBody();
  let resolveOlder!: (response: Response) => void;
  let requestedOlder!: () => void;
  const requested = new Promise<void>((resolve) => {
    requestedOlder = resolve;
  });
  const oldResponse = new Promise<Response>((resolve) => {
    resolveOlder = resolve;
  });
  const started: DisplayItem = {
    ...item(5, "turn_started"),
    turn: { id: "current-turn" },
  };
  const client = new DaemonClient(connection, async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/items")) {
      if (parsed.searchParams.has("before")) {
        requestedOlder();
        return oldResponse;
      }
      return json(page([started, item(6)], "older"));
    }
    if (parsed.pathname.endsWith("/events")) return stream.response();
    return json(session);
  });
  const timeline = new Timeline(client, "s");
  const running = timeline.start();
  await waitFor(timeline, (s) => s.status === "connected");
  const older = timeline.older();
  await requested;
  assert.equal(timeline.snapshot().loadingOlder, true);
  timeline.stop();
  resolveOlder(json(page([item(1), item(2)])));
  await older;
  stream.close();
  await running;
  assert.deepEqual(
    timeline.snapshot().items.map((i) => i.sequence),
    [5, 6],
  );
  assert.equal(timeline.snapshot().loadingOlder, false);
  assert.equal(timeline.snapshot().status, "offline");
});

test("session refresh failure releases an already opened event body", async () => {
  const stream = streamBody();
  let sessionReads = 0;
  const client = new DaemonClient(connection, async (url) => {
    if (url.includes("/items?")) return json(page([item(1)]));
    if (url.includes("/events?")) return stream.response();
    if (++sessionReads > 1)
      return Response.json(
        { code: "unauthorized", message: "Expired" },
        { status: 401 },
      );
    return json(session);
  });
  const timeline = new Timeline(client, "s");
  try {
    await timeline.start();
    assert.equal(timeline.snapshot().status, "offline");
    assert.equal(stream.cancelled(), true);
  } finally {
    timeline.stop();
    stream.close();
  }
});

test("late stream response from a stopped run cannot replace the current reader", async () => {
  const stale = streamBody(),
    current = streamBody();
  let releaseStale!: (response: Response) => void;
  let firstRequested!: () => void;
  const requested = new Promise<void>((resolve) => {
    firstRequested = resolve;
  });
  const lateResponse = new Promise<Response>((resolve) => {
    releaseStale = resolve;
  });
  let streams = 0;
  const client = new DaemonClient(connection, async (url) => {
    if (url.includes("/items?")) return json(page([item(1)]));
    if (url.includes("/events?")) {
      if (++streams === 1) {
        firstRequested();
        return lateResponse;
      }
      return current.response();
    }
    return json(session);
  });
  const timeline = new Timeline(client, "s");
  const oldRun = timeline.start();
  await requested;
  const currentRun = timeline.start();
  await waitFor(timeline, (s) => s.status === "connected" && streams === 2);
  releaseStale(stale.response());
  await oldRun;
  timeline.stop();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const cancelled = current.cancelled();
  if (!cancelled) current.close();
  await currentRun;
  assert.equal(stale.cancelled(), true);
  assert.equal(
    cancelled,
    true,
    "stop must cancel the new reader even after the stale response arrived",
  );
});
