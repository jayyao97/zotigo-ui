import { requireOptionalNativeModule } from "expo";

const native = requireOptionalNativeModule<{
  begin(name: string): number;
  end(id: number): void;
}>("ZotigoBackgroundTask");

/**
 * Runs `work` and asks iOS to keep the app running until it settles, so a
 * send started just before the user leaves the app still reaches the daemon.
 * iOS grants about 30 seconds; if that runs out the request may still be cut
 * off and the send shows as unconfirmed, with a manual retry as before.
 */
export async function finishInBackground<T>(name: string, work: () => Promise<T>): Promise<T> {
  const id = native?.begin(name) ?? 0;
  try {
    return await work();
  } finally {
    if (id) native?.end(id);
  }
}
