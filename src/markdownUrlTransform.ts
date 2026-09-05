import { defaultUrlTransform } from "react-markdown";

export function markdownUrlTransform(url: string, key: string): string {
  if (key === "href" && /^file:/i.test(url)) return url;
  return defaultUrlTransform(url);
}
