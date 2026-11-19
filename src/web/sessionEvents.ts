import type { SessionEventEnvelope } from "../../shared/clientTypes";
import { initialSessionEventReconnectDelayMs, maximumSessionEventReconnectDelayMs } from "../../shared/sessionEventReconnect";

// EventSource has only one Last-Event-ID. Reopen with a cursor for each body
// reader instead, so a busy conversation cannot advance another one's cursor.
export function createWebSessionEvents(
  connect: (targets: string) => EventSource,
  send: (event: SessionEventEnvelope) => void,
  checkLogin: () => void,
) {
  const targets = new Map<string | null, number | undefined>();
  let source: EventSource | null = null;
  let scheduled = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let delay = initialSessionEventReconnectDelayMs;

  function restart() {
    source?.close();
    source = null;
    if (scheduled || retry !== undefined || !targets.size) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!targets.size || retry !== undefined) return;
      // The daemon replays the full unfinished preview on each new reader.
      for (const id of targets.keys()) {
        if (id !== null) send({session_id: id, status: "reconnecting"});
      }
      const encoded = JSON.stringify([...targets].map(([id, after]) => ({id, after})));
      const connection = connect(encoded);
      source = connection;
      connection.onmessage = message => {
        if (source !== connection) return;
        const event = JSON.parse(message.data) as SessionEventEnvelope;
        const id = event.session_id;
        if (!targets.has(id)) return;
        delay = initialSessionEventReconnectDelayMs;
        if (event.event?.type === "item") targets.set(id, Math.max(targets.get(id) ?? 0, event.event.item.sequence));
        if (event.status === "unsupported") stop(id);
        send(event);
      };
      connection.onerror = () => {
        if (source !== connection) return;
        connection.close();
        source = null;
        retry = setTimeout(() => { retry = undefined; restart(); }, delay);
        delay = Math.min(delay * 2, maximumSessionEventReconnectDelayMs);
        for (const id of [...targets.keys()]) send({session_id: id, status: "reconnecting"});
        checkLogin();
      };
    });
  }

  function stop(id?: string | null) {
    if (id === undefined) targets.clear();
    else if (!targets.delete(id)) return;
    if (!targets.size) {
      clearTimeout(retry);
      retry = undefined;
      delay = initialSessionEventReconnectDelayMs;
    }
    restart();
  }

  return {
    start(id: string | null, after?: number) { targets.set(id, after); restart(); },
    stop,
  };
}
