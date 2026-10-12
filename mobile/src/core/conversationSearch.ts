import type { DisplayItem, SessionSearchHit } from "@zotigo/shared/zotigod";
export function messageText(item?: DisplayItem): string {
  return (
    item?.content
      ?.filter((part) => ["text", "reasoning"].includes(part.type))
      .map((part) => part.text ?? "")
      .join("\n") ||
    item?.command?.text ||
    ""
  );
}
export function localSearch(
  items: DisplayItem[],
  query: string,
): SessionSearchHit[] {
  const term = query.trim().toLocaleLowerCase();
  return term
    ? items
        .filter((item) => messageText(item).toLocaleLowerCase().includes(term))
        .map(({ id, sequence }) => ({ id, sequence }))
    : [];
}
export function mergeHits(
  local: SessionSearchHit[],
  remote: SessionSearchHit[],
): SessionSearchHit[] {
  return [
    ...new Map([...remote, ...local].map((hit) => [hit.id, hit])).values(),
  ].sort((a, b) => b.sequence - a.sequence);
}
