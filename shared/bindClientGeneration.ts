import type { ClientApi } from "./clientTypes";

// Async UI work may outlive its host, including attachment decoding before RPC.
export function bindClientGeneration(api: ClientApi, isCurrent: () => boolean): ClientApi {
  return new Proxy(api, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (!isCurrent()) {
          // Unmount cleanup must not cancel the newly selected host's stream.
          if ((key === "unsubscribeSessionEvents" || key === "unsubscribeFileEvents")) return Promise.resolve();
          if ((key === "onSessionEvent" || key === "onFileEvent")) return () => {};
          throw new Error("Host changed. Retry this action on the selected host.");
        }
        return Reflect.apply(value, target, args);
      };
    },
  });
}
