import { getLocale } from "../../shared/i18n";
// Keep recent timestamps compact; old messages include a date so a weekday
// cannot be mistaken for the current week. All times use the viewer's timezone.
export function messageTimestamp(value?: string, now = new Date(), locale: string = getLocale()): { label: string; full: string } | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  // Compare local calendar dates, not elapsed hours: last Monday evening is
  // already a week old on Monday morning. UTC date ordinals also avoid DST.
  const calendarDay = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const daysAgo = (calendarDay(now) - calendarDay(date)) / (24 * 60 * 60 * 1000);
  const recent = date <= now && daysAgo >= 0 && daysAgo < 7;
  return {
    label: date.toLocaleString(locale, recent
      ? { weekday: "short", hour: "2-digit", minute: "2-digit" }
      : { year: date.getFullYear() === now.getFullYear() ? undefined : "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    full: date.toLocaleString(locale, { year: "numeric", month: "long", day: "numeric", weekday: "long", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }),
  };
}
