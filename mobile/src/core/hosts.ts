import { normalizeAddress, type Host, type Connection } from "./client";
export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
const registryKey = "zotigo.mobile.hosts.v1";
export class HostStore {
  private queue = Promise.resolve();
  constructor(
    private storage: Storage,
    private secrets: Storage,
  ) {}
  async list(): Promise<Host[]> {
    const raw = await this.storage.get(registryKey);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (
      !Array.isArray(value) ||
      value.some(
        (h) =>
          !h ||
          typeof h.id !== "string" ||
          !/^[a-zA-Z0-9-]+$/.test(h.id) ||
          typeof h.name !== "string" ||
          typeof h.baseUrl !== "string",
      )
    )
      throw new Error("Saved device list is invalid.");
    return value.map((h) => ({
      id: h.id,
      name: h.name,
      baseUrl: normalizeAddress(h.baseUrl),
    }));
  }
  savedToken(id: string) {
    return this.secrets.get("host." + id);
  }
  async connection(host: Host): Promise<Connection> {
    const token = await this.secrets.get("host." + host.id);
    if (token === null)
      throw new Error(
        "Device credentials are missing. Edit the device to save them again.",
      );
    return { ...host, token };
  }
  save(host: Host, token: string) {
    return this.serial(async () => {
      if (!/^[a-zA-Z0-9-]+$/.test(host.id))
        throw new Error("Invalid device ID.");
      if (!host.name.trim()) throw new Error("Device name is required.");
      const next = {
        id: host.id,
        name: host.name.trim(),
        baseUrl: normalizeAddress(host.baseUrl),
      };
      const hosts = await this.list();
      const existing = hosts.find((h) => h.id === next.id);
      if (existing && existing.baseUrl !== next.baseUrl)
        throw new Error("Use a new device ID for a different address.");
      const key = "host." + next.id;
      const previous = await this.secrets.get(key);
      await this.secrets.set(key, token.trim());
      try {
        await this.storage.set(
          registryKey,
          JSON.stringify(
            existing
              ? hosts.map((h) => (h.id === next.id ? next : h))
              : [...hosts, next],
          ),
        );
      } catch (error) {
        if (previous === null) await this.secrets.remove(key);
        else await this.secrets.set(key, previous);
        throw error;
      }
    });
  }
  remove(id: string) {
    return this.serial(async () => {
      await this.storage.set(
        registryKey,
        JSON.stringify((await this.list()).filter((h) => h.id !== id)),
      );
      await this.secrets.remove("host." + id);
    });
  }
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const task = this.queue.then(run);
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
}
