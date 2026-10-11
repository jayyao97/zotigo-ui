import { fetch } from "expo/fetch";
import { DaemonClient, type Connection, type Fetch } from "../core/client";
export function createDaemon(connection: Connection) {
  return new DaemonClient(connection, fetch as Fetch);
}
