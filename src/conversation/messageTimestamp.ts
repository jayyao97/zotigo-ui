// Keep recent timestamps compact; old messages include a date so a weekday
// cannot be mistaken for the current week. All times use the viewer's timezone.
export function messageTimestamp(value?: string, now = new Date(), locale?: string): { label: string; full: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const recent = date <= now && now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000;
  return {
    label: date.toLocaleString(locale, recent
      ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    full: date.toLocaleString(locale, { year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }),
  };
}
