export function imageDownloadUrl(value: string, daemonBaseUrl: string): string {
  const url = new URL(value);
  if (url.origin !== new URL(daemonBaseUrl).origin || !/^\/sessions\/[^/]+\/images\/[^/]+$/.test(url.pathname)
    || url.username || url.password || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only session images from the configured daemon can be downloaded.");
  }
  return url.href;
}
