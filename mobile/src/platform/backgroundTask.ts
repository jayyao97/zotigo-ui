/**
 * Runs `work` and, on iOS, asks the system to keep the app running until it
 * settles even if the user leaves the app meanwhile. Elsewhere (web preview,
 * tests) it just runs `work`. The iOS variant is `backgroundTask.ios.ts`.
 */
export function finishInBackground<T>(_name: string, work: () => Promise<T>): Promise<T> {
  return work();
}
