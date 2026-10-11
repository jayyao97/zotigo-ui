import { DaemonClient, type Connection } from "../../src/core/client";
import { fixtureFetch } from "./fixtures";
export function createDaemon(connection: Connection) {
  return new DaemonClient(connection, fixtureFetch);
}
