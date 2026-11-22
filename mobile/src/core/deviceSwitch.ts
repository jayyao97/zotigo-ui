import type { Connection, DaemonClient, Host } from "./client";

/** The device gave no answer in time: asleep, off, or on another network. */
export class DeviceUnreachable extends Error {
  constructor() {
    super("The device did not respond.");
  }
}

/**
 * Resolves once the daemon answers. The wait is bounded here rather than by the
 * request, so a transport that never settles an aborted request cannot hold the
 * caller. The caller disposes the client when this rejects.
 */
export async function reach(client: DaemonClient, timeout = 10000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.health(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DeviceUnreachable()), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export interface SwitchState {
  connecting?: Host;
  failed?: { host: Host; error: unknown };
}

/**
 * One connection attempt at a time, and the newest choice always wins: picking
 * another device abandons the attempt in flight instead of waiting for it, so
 * an unreachable device can never block the way back to a reachable one.
 */
export class DeviceSwitch {
  state: SwitchState = {};
  private attempt = 0;
  private pending: DaemonClient | null = null;
  constructor(
    private deps: {
      connection(host: Host): Promise<Connection>;
      create(connection: Connection): DaemonClient;
      /** Records the device to reconnect to on the next launch. */
      remember(id: string): Promise<void>;
      timeout?: number;
    },
    private notify: (state: SwitchState) => void,
  ) {}
  async select(host: Host, onConnect: (client: DaemonClient) => void): Promise<void> {
    const attempt = this.begin({ connecting: host });
    let client: DaemonClient | undefined;
    try {
      const connection = await this.deps.connection(host);
      if (attempt !== this.attempt) return;
      client = this.pending = this.deps.create(connection);
      await reach(client, this.deps.timeout);
      // An abandoned attempt's client was already disposed by `begin`.
      if (attempt !== this.attempt) return;
      await this.deps.remember(host.id);
      if (attempt !== this.attempt) return;
      this.pending = null;
      this.set({});
      onConnect(client);
    } catch (error) {
      if (attempt !== this.attempt) return;
      client?.dispose();
      this.pending = null;
      this.set({ failed: { host, error } });
    }
  }
  /** Abandons the attempt in flight, if any, and clears a reported failure. */
  cancel() {
    this.begin({});
  }
  private begin(state: SwitchState) {
    this.attempt++;
    this.pending?.dispose();
    this.pending = null;
    this.set(state);
    return this.attempt;
  }
  private set(state: SwitchState) {
    this.state = state;
    this.notify(state);
  }
}
