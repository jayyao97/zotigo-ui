import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DesktopState } from "../shared/clientTypes";
import type { ZotigoSession } from "../shared/zotigod";
import { localDateKey, recentConversationGroups, type RecentConversation, type RecentConversationGroup } from "../shared/recentConversations";
import { t } from "../shared/i18n";
import { useLocale } from "./i18n";

export function RecentSessions({ state, sessions, renderItem, onSearch }: {
  state: DesktopState; sessions: ZotigoSession[]; renderItem(entry: RecentConversation): ReactNode; onSearch(): void;
}) {
  const locale = useLocale();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const groups = useMemo(() => recentConversationGroups(state, sessions, now), [state, sessions, now]);
  const today = localDateKey(now);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const heading = (group: RecentConversationGroup) => group.key === "unread" ? t("app.unread") : group.key === today ? t("recentSessions.today") : group.key === localDateKey(yesterday.getTime()) ? t("recentSessions.yesterday") : new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", weekday: "short" }).format(group.date);
  return <div className="recent-session-navigation" aria-label={t("recentSessions.title")}>
    {groups.map(group => <RecentGroup key={group.key} group={group} title={heading(group)} renderItem={renderItem} />)}
    {!groups.length && <p className="sidebar-empty">{t("recentSessions.empty")}</p>}
    <button type="button" className="recent-session-search" onClick={onSearch}>{t("recentSessions.searchOlder")}</button>
  </div>;
}

function RecentGroup({ group, title, renderItem }: { group: RecentConversationGroup; title: string; renderItem(entry: RecentConversation): ReactNode }) {
  const [limit, setLimit] = useState(20);
  return <section className="recent-session-group sidebar-section" aria-label={title}>
    <h3>{title}</h3>
    <div className="sidebar-session-list">{group.entries.slice(0, limit).map(renderItem)}</div>
    {group.entries.length > limit && <button type="button" className="recent-session-more" onClick={() => setLimit(current => current + 20)}>{t("conversationTimeline.showMore")}</button>}
  </section>;
}
