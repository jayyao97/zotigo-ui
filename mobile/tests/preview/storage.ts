import { HostStore, type Storage } from "../../src/core/hosts";
export const fixtureHosts = [
  {
    id: "preview-home",
    name: "Home Mac Studio",
    baseUrl: "https://home.fixture.test",
  },
  {
    id: "preview-work",
    name: "Work Linux",
    baseUrl: "https://work.fixture.test",
  },
];
const data = new Map<string, string>([
  ["zotigo.mobile.lastHost", "preview-home"],
  ["zotigo.mobile.hosts.v1", JSON.stringify(fixtureHosts)],
]);
const credentials = new Map<string, string>(
  fixtureHosts.map((host) => ["host." + host.id, "fixture-token"]),
);
function adapter(values: Map<string, string>): Storage {
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    remove: async (key) => {
      values.delete(key);
    },
  };
}
// Deliberately memory-only. This does not add a browser fallback for production Keychain.
export const storage = adapter(data);
export const hosts = new HostStore(storage, adapter(credentials));
export function resetStorage() {
  data.clear();
  data.set("zotigo.mobile.hosts.v1", JSON.stringify(fixtureHosts));
  credentials.clear();
  for (const host of fixtureHosts)
    credentials.set("host." + host.id, "fixture-token");
}
