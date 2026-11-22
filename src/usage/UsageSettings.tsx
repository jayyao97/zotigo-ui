import { useCallback, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Hash, RefreshCw } from "lucide-react";
import { useClient } from "../ClientContext";
import { useLocale } from "../i18n";
import { t } from "../../shared/i18n/index";
import { cacheHitRate, type UsageActivity, type UsageChannelFilter, type UsageSession, type UsageSessionPage, type UsageTotals } from "../../shared/usage";
import {
  addDays, addTotals, availableTimeZones, cumulativeTotals, daysBetween, emptyTotals, formatDayLabel, formatLongDate, formatMonth, formatPercent, formatTokens,
  heatmapCells, heatmapRange, heatmapWeekTotals, heatmapWeeks, intensityLevels, isValidTimeZone, monthColumns, systemTimeZone, todayIn, weekStartDay,
  type HeatmapCell,
} from "./usageModel";
import { useUsageQuery } from "./useUsageData";

export const usageTimeZoneStorageKey = "zotigo:usage-time-zone";
const sessionPageSize = 20;
const maxSessionRows = 200;

type Period =
  | { kind: "recent"; days: 1 | 7 | 30 | 90 }
  | { kind: "custom"; from: string; to: string }
  | { kind: "selection"; from: string; to: string };
type HeatmapView = "daily" | "weekly" | "cumulative";

function storedTimeZone(): string {
  try {
    const value = localStorage.getItem(usageTimeZoneStorageKey);
    if (value && isValidTimeZone(value)) return value;
  } catch { /* Fall back to the system zone. */ }
  return systemTimeZone();
}

function periodRange(period: Period, today: string, earliest: string): { from: string; to: string } {
  if (period.kind === "recent") return { from: addDays(today, 1 - period.days), to: today };
  const from = period.from < earliest ? earliest : period.from;
  const to = period.to > today ? today : period.to;
  return { from, to: to < from ? from : to };
}

export function UsageSettings({ hostId, hostName, onOpenSession }: { hostId: string; hostName: string; onOpenSession?: (id: string) => void }) {
  const locale = useLocale();
  const { api } = useClient();
  const zones = useMemo(availableTimeZones, []);
  const [timeZone, setTimeZoneState] = useState(storedTimeZone);
  const [zoneDraft, setZoneDraft] = useState(timeZone);
  const [model, setModel] = useState("");
  const [channel, setChannel] = useState<UsageChannelFilter>("all");
  const [view, setView] = useState<HeatmapView>("daily");
  const [period, setPeriod] = useState<Period>({ kind: "recent", days: 7 });
  const [revision, setRevision] = useState(0);
  const [sessionPages, setSessionPages] = useState(1);
  const knownModels = useRef(new Set<string>());

  const today = todayIn(timeZone);
  const weekStart = weekStartDay(locale);
  const range = useMemo(() => heatmapRange(today, weekStart), [today, weekStart]);
  const selected = periodRange(period, today, range.from);
  const filters = { timeZone, model: model || undefined, channel };

  const yearKey = `activity|${JSON.stringify({ ...filters, ...range })}`;
  const year = useUsageQuery<UsageActivity>(hostId, yearKey, () => api.getUsageActivity({ ...filters, ...range }), revision);
  const periodKey = `activity|${JSON.stringify({ ...filters, ...selected })}`;
  const periodActivity = useUsageQuery<UsageActivity>(hostId, periodKey, () => api.getUsageActivity({ ...filters, ...selected }), revision);
  const limit = Math.min(maxSessionRows, sessionPages * sessionPageSize);
  const sessionsKey = `sessions|${JSON.stringify({ ...filters, ...selected, limit })}`;
  const sessions = useUsageQuery<UsageSessionPage>(hostId, sessionsKey, () => api.getUsageSessions({ ...filters, ...selected, limit }), revision);

  const yearData = year.result?.supported ? year.result.data : undefined;
  const periodData = periodActivity.result?.supported ? periodActivity.result.data : undefined;
  for (const entry of yearData?.byModel ?? []) if (entry.model) knownModels.current.add(entry.model);
  const models = [...knownModels.current].sort();
  const unsupported = year.result?.supported === false;
  const loading = year.loading || periodActivity.loading || sessions.loading;
  const error = year.error || periodActivity.error || sessions.error;

  const changeTimeZone = (value: string) => {
    if (!isValidTimeZone(value)) { setZoneDraft(timeZone); return; }
    setTimeZoneState(value); setZoneDraft(value); setSessionPages(1);
    try { localStorage.setItem(usageTimeZoneStorageKey, value); } catch { /* In-memory preference still works. */ }
  };
  const changePeriod = (next: Period) => { setPeriod(next); setSessionPages(1); };
  const selectRange = (from: string, to: string) => {
    if (period.kind === "selection" && period.from === from && period.to === to) changePeriod({ kind: "recent", days: 7 });
    else changePeriod({ kind: "selection", from, to });
  };

  return <section className="usage-settings" aria-labelledby="usage-heading">
    <header className="usage-header">
      <div>
        <h1 id="usage-heading">{t("usage.title")}</h1>
        <p>{t("usage.hostLine", { host: hostName })}{yearData?.trackingSince ? ` · ${t("usage.trackingSince", { date: formatLongDate(todayIn(timeZone, new Date(yearData.trackingSince)), locale) })}` : ""}</p>
      </div>
      <div className="usage-header-actions">
        <label className="usage-zone">
          <span>{t("usage.timeZone")}</span>
          <input list="usage-time-zones" aria-label={t("usage.timeZone")} value={zoneDraft} spellCheck={false}
            onChange={event => {
              setZoneDraft(event.target.value);
              // Choosing a suggestion applies at once; typing applies on Enter or blur.
              if ((event.nativeEvent as InputEvent).inputType === "insertReplacementText") changeTimeZone(event.target.value);
            }}
            onBlur={() => changeTimeZone(zoneDraft)}
            onKeyDown={event => { if (event.key === "Enter") changeTimeZone(zoneDraft); if (event.key === "Escape") { event.stopPropagation(); setZoneDraft(timeZone); } }} />
          <datalist id="usage-time-zones">{zones.map(zone => <option key={zone} value={zone} />)}</datalist>
        </label>
        <button type="button" className="settings-secondary-button" onClick={() => setRevision(value => value + 1)} disabled={loading} aria-label={t("usage.refresh")} title={t("usage.refresh")}>
          <RefreshCw size={15} className={loading ? "usage-spin" : undefined} />{t("usage.refresh")}
        </button>
      </div>
    </header>

    {unsupported ? <div className="settings-card usage-empty" role="status">{t("usage.unsupported", { host: hostName })}</div> : <>
      {error && <p className="usage-error" role="alert">{error}</p>}
      <div className="usage-filters">
        <label><span>{t("usage.model")}</span>
          <select value={model} onChange={event => { setModel(event.target.value); setSessionPages(1); }}>
            <option value="">{t("usage.allModels")}</option>
            {models.map(name => <option key={name} value={name}>{name}</option>)}
            {model && !models.includes(model) && <option value={model}>{model}</option>}
          </select>
        </label>
        <label><span>{t("usage.channel")}</span>
          <select value={channel} onChange={event => { setChannel(event.target.value as UsageChannelFilter); setSessionPages(1); }}>
            <option value="all">{t("usage.channelAll")}</option>
            <option value="only">{t("usage.channelOnly")}</option>
            <option value="exclude">{t("usage.channelExclude")}</option>
          </select>
        </label>
      </div>

      {yearData && yearData.trackingSince === null && !model && channel === "all"
        ? <div className="settings-card usage-empty">{t("usage.empty")}</div>
        : <>
          <Overview year={yearData} period={periodData} selected={selected} periodLabel={periodText(period, selected, locale)} />
          <section className="usage-section" aria-labelledby="usage-activity-heading">
            <div className="usage-section-heading">
              <h2 id="usage-activity-heading">{t("usage.activity")}</h2>
              <div className="usage-segmented" role="group" aria-label={t("usage.view")}>
                {(["daily", "weekly", "cumulative"] as const).map(value => <button key={value} type="button" aria-pressed={view === value} className={view === value ? "is-active" : ""} onClick={() => setView(value)}>{t(`usage.view.${value}`)}</button>)}
              </div>
            </div>
            <div className="settings-card usage-chart-card">
              <ActivityCharts data={yearData} range={range} view={view} selected={period.kind === "selection" ? selected : null} onSelect={selectRange} />
            </div>
          </section>
          <ModelTable data={periodData} label={periodText(period, selected, locale)} />
          <SessionRanking
            period={period} selected={selected} earliest={range.from} today={today} onPeriod={changePeriod}
            page={sessions.result?.supported ? sessions.result.data : undefined} periodTotal={periodData?.range.total}
            canLoadMore={Boolean(sessions.result?.supported && sessions.result.data.nextCursor) && limit < maxSessionRows}
            onLoadMore={() => setSessionPages(value => value + 1)} loading={sessions.loading} onOpenSession={onOpenSession}
          />
        </>}
    </>}
  </section>;
}

function periodText(period: Period, selected: { from: string; to: string }, locale: ReturnType<typeof useLocale>): string {
  if (period.kind === "recent") return period.days === 1 ? t("usage.period.today") : t("usage.period.recent", { count: period.days });
  if (selected.from === selected.to) return formatLongDate(selected.from, locale);
  return `${formatLongDate(selected.from, locale)} – ${formatLongDate(selected.to, locale)}`;
}

function Overview({ year, period, selected, periodLabel }: { year?: UsageActivity; period?: UsageActivity; selected: { from: string; to: string }; periodLabel: string }) {
  const locale = useLocale();
  const tokens = (value?: number) => value === undefined ? "—" : formatTokens(value, locale);
  // Sum the heatmap's days so the card applies the same cache rule as the trend.
  const rate = year ? cacheHitRate((year.days ?? []).filter(day => day.date >= selected.from && day.date <= selected.to).reduce(addTotals, emptyTotals())) : null;
  const cards: Array<{ label: string; value: string; detail?: string; title?: string }> = [
    { label: t("usage.allTime"), value: tokens(year?.allTime.total), detail: year ? t("usage.turns", { count: year.allTime.turns }) : undefined },
    { label: t("usage.selectedPeriod"), value: tokens(period?.range.total), detail: periodLabel },
    { label: t("usage.peakDay"), value: year?.peakDay ? formatTokens(year.peakDay.total, locale) : "—", detail: year?.peakDay ? formatLongDate(year.peakDay.date, locale) : undefined },
    { label: t("usage.cacheHitRate"), value: formatPercent(rate), detail: t("usage.cacheHitRateNote"), title: rate === null ? t("usage.noCacheReads") : undefined },
    { label: t("usage.currentStreak"), value: year ? t("usage.days", { count: year.currentStreakDays }) : "—" },
    { label: t("usage.longestStreak"), value: year ? t("usage.days", { count: year.longestStreakDays }) : "—" },
  ];
  return <div className="usage-overview">
    {cards.map(card => <div key={card.label} className="usage-stat" title={card.title}>
      <span>{card.label}</span><strong>{card.value}</strong>{card.detail && <small>{card.detail}</small>}
    </div>)}
  </div>;
}

const pitch = 14;
const cellSize = 11;
const gutter = 30;
const chartWidth = gutter + heatmapWeeks * pitch;
const header = 18;

interface Tooltip { x: number; y: number; lines: string[] }

function ActivityCharts({ data, range, view, selected, onSelect }: {
  data?: UsageActivity; range: { from: string; to: string }; view: HeatmapView;
  selected: { from: string; to: string } | null; onSelect: (from: string, to: string) => void;
}) {
  const locale = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const cells = useMemo(() => heatmapCells(data?.days ?? [], range), [data, range]);
  const weeks = useMemo(() => heatmapWeekTotals(cells), [cells]);
  const pastCells = useMemo(() => cells.filter(cell => !cell.future), [cells]);
  const show = useCallback((event: ReactMouseEvent, lines: string[]) => {
    const bounds = container.current?.getBoundingClientRect();
    if (bounds) setTooltip({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, lines });
  }, []);
  // Cells use a roving tab stop: Tab enters at one cell and arrow keys move.
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const cellButton = (index: number, count: number, step: { horizontal: number; vertical: number }, lines: string[], selectedNow: boolean, select: () => void) => ({
    role: "button", "aria-label": lines.join(", "), "aria-pressed": selectedNow, "data-index": index,
    tabIndex: index === (focusIndex ?? count - 1) ? 0 : -1,
    onFocus: (event: ReactFocusEvent<SVGRectElement>) => {
      setFocusIndex(index);
      const bounds = container.current?.getBoundingClientRect();
      const cell = event.currentTarget.getBoundingClientRect();
      if (bounds) setTooltip({ x: cell.left + cell.width / 2 - bounds.left, y: cell.top - bounds.top, lines });
    },
    onBlur: () => setTooltip(null),
    onKeyDown: (event: ReactKeyboardEvent<SVGRectElement>) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); return; }
      const move = { ArrowLeft: -step.horizontal, ArrowRight: step.horizontal, ArrowUp: -step.vertical, ArrowDown: step.vertical }[event.key];
      if (!move) return;
      event.preventDefault();
      const next = Math.max(0, Math.min(count - 1, index + move));
      container.current?.querySelector<SVGRectElement>(`.usage-heatmap [data-index="${next}"]`)?.focus();
    },
  });
  const describe = (label: string, totals: UsageTotals) => [
    label,
    t("usage.tooltipTokens", { tokens: formatTokens(totals.total, locale) }),
    totals.total > 0 ? t("usage.tooltipHitRate", { rate: formatPercent(cacheHitRate(totals)) }) : "",
  ].filter(Boolean);

  const months = monthColumns(cells).map(month => ({ column: month.column, label: formatMonth(month.date, locale) }));
  const inSelection = (from: string, to: string) => selected !== null && from <= selected.to && to >= selected.from;
  const dailyLevel = intensityLevels(cells.filter(cell => !cell.future).map(cell => cell.total));
  const weeklyLevel = intensityLevels(weeks.map(week => week.total));
  // Label Monday, Wednesday and Friday whichever day starts the week.
  const weekdayLabels = (cells[0] && new Date(`${cells[0].date}T00:00:00Z`).getUTCDay() === 1 ? [0, 2, 4] : [1, 3, 5]).map(row => ({ row, label: new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short" }).format(Date.parse(`${cells[row]?.date ?? range.from}T00:00:00Z`)) }));

  const monthAxis = months.map(month => <text key={month.column} className="usage-axis" x={gutter + month.column * pitch} y={11}>{month.label}</text>);

  let chart;
  if (view === "daily") {
    chart = <svg className="usage-heatmap" viewBox={`0 0 ${chartWidth} ${header + 7 * pitch}`} role="group" aria-label={t("usage.heatmapLabel")}>
      {monthAxis}
      {weekdayLabels.map(({ row, label }) => <text key={row} className="usage-axis" x={0} y={header + row * pitch + 9}>{label}</text>)}
      {pastCells.map((cell, index) => <rect key={cell.date} {...cellButton(index, pastCells.length, { horizontal: 7, vertical: 1 }, describe(formatLongDate(cell.date, locale), cell), inSelection(cell.date, cell.date), () => onSelect(cell.date, cell.date))} x={gutter + cell.column * pitch} y={header + cell.row * pitch} width={cellSize} height={cellSize} rx={2.5}
        className={`usage-cell level-${dailyLevel(cell.total)}${inSelection(cell.date, cell.date) ? " is-selected" : ""}`}
        onMouseMove={event => show(event, describe(formatLongDate(cell.date, locale), cell))} onMouseLeave={() => setTooltip(null)}
        onClick={() => onSelect(cell.date, cell.date)} />)}
    </svg>;
  } else if (view === "weekly") {
    chart = <svg className="usage-heatmap" viewBox={`0 0 ${chartWidth} ${header + 3 * pitch}`} role="group" aria-label={t("usage.heatmapLabel")}>
      {monthAxis}
      {weeks.map((week, index) => <rect key={week.start} {...cellButton(index, weeks.length, { horizontal: 1, vertical: 0 }, describe(`${formatDayLabel(week.start, locale)} – ${formatDayLabel(week.end, locale)}`, week), inSelection(week.start, week.end), () => onSelect(week.start, week.end))} x={gutter + week.column * pitch} y={header} width={cellSize} height={3 * pitch - 3} rx={2.5}
        className={`usage-cell level-${weeklyLevel(week.total)}${inSelection(week.start, week.end) ? " is-selected" : ""}`}
        onMouseMove={event => show(event, describe(`${formatDayLabel(week.start, locale)} – ${formatDayLabel(week.end, locale)}`, week))} onMouseLeave={() => setTooltip(null)}
        onClick={() => onSelect(week.start, week.end)} />)}
    </svg>;
  } else {
    const points = cumulativeTotals(cells);
    const maximum = Math.max(1, points.at(-1)?.total ?? 0);
    const height = 7 * pitch;
    const x = (date: string) => gutter + (daysBetween(range.from, date) + 0.5) * pitch / 7;
    const y = (value: number) => header + height - (value / maximum) * (height - 4);
    const path = points.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(1)},${y(point.total).toFixed(1)}`).join("");
    chart = <svg className="usage-heatmap" viewBox={`0 0 ${chartWidth} ${header + height}`} role="img" aria-label={t("usage.activity")}
      onMouseLeave={() => setTooltip(null)}
      onMouseMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const index = Math.round(((event.clientX - bounds.left) / bounds.width * chartWidth - gutter) / pitch * 7 - 0.5);
        const point = points[Math.max(0, Math.min(points.length - 1, index))];
        if (point) show(event, [formatLongDate(point.date, locale), t("usage.tooltipCumulative", { tokens: formatTokens(point.total, locale) })]);
      }}>
      {monthAxis}
      <text className="usage-axis" x={0} y={header + 8}>{formatTokens(maximum, locale)}</text>
      <line className="usage-grid" x1={gutter} x2={chartWidth} y1={header + height} y2={header + height} />
      {points.length > 0 && <path className="usage-cumulative-area" d={`${path}L${x(points.at(-1)!.date).toFixed(1)},${header + height}L${x(points[0].date).toFixed(1)},${header + height}Z`} />}
      {points.length > 0 && <path className="usage-line" d={path} />}
    </svg>;
  }

  return <div className="usage-charts" ref={container}>
    {chart}
    {view !== "cumulative" && <div className="usage-legend" aria-hidden="true">
      <span>{t("usage.less")}</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`usage-cell-swatch level-${level}`} />)}<span>{t("usage.more")}</span>
    </div>}
    <HitRateTrend cells={cells} weeks={weeks} view={view} range={range} show={show} hide={() => setTooltip(null)} />
    {tooltip && <div className="usage-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="tooltip">{tooltip.lines.map(line => <div key={line}>{line}</div>)}</div>}
  </div>;
}

function HitRateTrend({ cells, weeks, view, range, show, hide }: {
  cells: HeatmapCell[]; weeks: ReturnType<typeof heatmapWeekTotals>; view: HeatmapView; range: { from: string; to: string };
  show: (event: ReactMouseEvent, lines: string[]) => void; hide: () => void;
}) {
  const locale = useLocale();
  const height = 64;
  const top = 8;
  // Points share the heatmap's horizontal axis; days without computable input break the line.
  const points = view === "weekly"
    ? weeks.map(week => ({ x: gutter + week.column * pitch + cellSize / 2, label: `${formatDayLabel(week.start, locale)} – ${formatDayLabel(week.end, locale)}`, totals: week as UsageTotals }))
    : cells.filter(cell => !cell.future).map(cell => ({ x: gutter + (daysBetween(range.from, cell.date) + 0.5) * pitch / 7, label: formatLongDate(cell.date, locale), totals: cell as UsageTotals }));
  const y = (rate: number) => top + (1 - rate) * height;
  const segments: string[] = [];
  let current = "";
  for (const point of points) {
    const rate = cacheHitRate(point.totals);
    if (rate === null) { if (current) segments.push(current); current = ""; continue; }
    current += `${current ? "L" : "M"}${point.x.toFixed(1)},${y(rate).toFixed(1)}`;
  }
  if (current) segments.push(current);
  const isolated = points.filter((point, index) => {
    if (cacheHitRate(point.totals) === null) return false;
    return cacheHitRate(points[index - 1]?.totals ?? { cacheRead: 0, cacheInput: 0 }) === null && cacheHitRate(points[index + 1]?.totals ?? { cacheRead: 0, cacheInput: 0 }) === null;
  });
  return <div className="usage-trend">
    <div className="usage-trend-heading"><span>{t("usage.hitRateTrend")}</span><small>{t("usage.cacheHitRateNote")}</small></div>
    <svg viewBox={`0 0 ${chartWidth} ${height + top * 2}`} role="img" aria-label={t("usage.hitRateTrend")} onMouseLeave={hide}
      onMouseMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const position = (event.clientX - bounds.left) / bounds.width * chartWidth;
        let nearest = points[0];
        for (const point of points) if (Math.abs(point.x - position) < Math.abs((nearest?.x ?? Infinity) - position)) nearest = point;
        if (!nearest) return;
        const rate = cacheHitRate(nearest.totals);
        show(event, rate === null ? [nearest.label, t("usage.noCacheReads")] : [nearest.label, t("usage.tooltipHitRate", { rate: formatPercent(rate) }),
          t("usage.tooltipCacheDetail", { read: formatTokens(nearest.totals.cacheRead, locale), input: formatTokens(nearest.totals.cacheInput, locale) })]);
      }}>
      {[0, 0.5, 1].map(rate => <g key={rate}>
        <line className="usage-grid" x1={gutter} x2={chartWidth} y1={y(rate)} y2={y(rate)} />
        <text className="usage-axis" x={0} y={y(rate) + 3}>{`${rate * 100}%`}</text>
      </g>)}
      {segments.map(segment => <path key={segment.slice(0, 24)} className="usage-line" d={segment} />)}
      {isolated.map(point => <circle key={point.x} className="usage-point" cx={point.x} cy={y(cacheHitRate(point.totals)!)} r={1.8} />)}
    </svg>
  </div>;
}

function ModelTable({ data, label }: { data?: UsageActivity; label: string }) {
  const locale = useLocale();
  if (!data) return null;
  const showWrite = data.byModel.some(entry => entry.cacheWrite > 0);
  return <section className="usage-section" aria-labelledby="usage-models-heading">
    <div className="usage-section-heading"><h2 id="usage-models-heading">{t("usage.byModel")}</h2><small>{label}</small></div>
    <div className="settings-card usage-table-card">
      {data.byModel.length === 0 ? <p className="usage-muted">{t("usage.noUsageInPeriod")}</p> :
        <table className="usage-table">
          <thead><tr>
            <th>{t("usage.model")}</th><th>{t("usage.total")}</th><th>{t("usage.input")}</th><th>{t("usage.cacheRead")}</th>
            {showWrite && <th>{t("usage.cacheWrite")}</th>}<th>{t("usage.output")}</th><th>{t("usage.hitRate")}</th>
          </tr></thead>
          <tbody>{data.byModel.map(entry => {
            const rate = cacheHitRate(entry);
            return <tr key={`${entry.model}\u0000${entry.runtime}`}>
              <td><span className="usage-model-name">{entry.model || t("usage.unknownModel")}</span>{entry.runtime === "codex" && <span className="usage-tag">{t("app.codex")}</span>}</td>
              <td>{formatTokens(entry.total, locale)}</td><td>{formatTokens(entry.input, locale)}</td><td>{formatTokens(entry.cacheRead, locale)}</td>
              {showWrite && <td>{formatTokens(entry.cacheWrite, locale)}</td>}<td>{formatTokens(entry.output, locale)}</td>
              <td title={rate === null ? t("usage.noCacheReads") : undefined}>{formatPercent(rate)}</td>
            </tr>;
          })}</tbody>
        </table>}
    </div>
  </section>;
}

function SessionRanking({ period, selected, earliest, today, onPeriod, page, periodTotal, canLoadMore, onLoadMore, loading, onOpenSession }: {
  period: Period; selected: { from: string; to: string }; earliest: string; today: string; onPeriod: (period: Period) => void;
  page?: UsageSessionPage; periodTotal?: number; canLoadMore: boolean; onLoadMore: () => void; loading: boolean; onOpenSession?: (id: string) => void;
}) {
  const locale = useLocale();
  const value = period.kind === "recent" ? String(period.days) : period.kind;
  return <section className="usage-section" aria-labelledby="usage-sessions-heading">
    <div className="usage-section-heading">
      <h2 id="usage-sessions-heading">{t("usage.sessionRanking")}</h2>
      <div className="usage-period">
        <select aria-label={t("usage.period")} value={value} onChange={event => {
          const next = event.target.value;
          if (next === "custom") onPeriod({ kind: "custom", from: selected.from, to: selected.to });
          else if (next !== "selection") onPeriod({ kind: "recent", days: Number(next) as 1 | 7 | 30 | 90 });
        }}>
          <option value="1">{t("usage.period.today")}</option>
          {([7, 30, 90] as const).map(days => <option key={days} value={days}>{t("usage.period.recent", { count: days })}</option>)}
          <option value="custom">{t("usage.period.custom")}</option>
          {period.kind === "selection" && <option value="selection">{t("usage.period.selection")}</option>}
        </select>
        {period.kind === "custom" && <>
          <input type="date" aria-label={t("usage.period.from")} min={earliest} max={today} value={period.from} onChange={event => event.target.value && onPeriod({ ...period, from: event.target.value })} />
          <span>–</span>
          <input type="date" aria-label={t("usage.period.to")} min={earliest} max={today} value={period.to} onChange={event => event.target.value && onPeriod({ ...period, to: event.target.value })} />
        </>}
      </div>
    </div>
    <div className="settings-card usage-ranking">
      {!page ? <p className="usage-muted">{loading ? t("usage.loading") : ""}</p>
        : page.sessions.length === 0 ? <p className="usage-muted">{t("usage.noUsageInPeriod")}</p>
          : <ol>{page.sessions.map((session, index) => <SessionRow key={session.sessionId} rank={index + 1} session={session} periodTotal={periodTotal} locale={locale} onOpenSession={onOpenSession} />)}</ol>}
      {canLoadMore && <button type="button" className="usage-load-more" onClick={onLoadMore} disabled={loading}>{t("usage.loadMore")}</button>}
    </div>
  </section>;
}

function SessionRow({ rank, session, periodTotal, locale, onOpenSession }: { rank: number; session: UsageSession; periodTotal?: number; locale: ReturnType<typeof useLocale>; onOpenSession?: (id: string) => void }) {
  const rate = cacheHitRate(session);
  const title = session.availability === "deleted" ? t("usage.deletedSession") : session.title || t("usage.untitledSession");
  const openable = session.availability === "available" && Boolean(onOpenSession);
  const share = periodTotal ? Math.round(session.total / periodTotal * 100) : null;
  const content = <>
    <span className="usage-rank">{rank}</span>
    <span className="usage-session-main">
      <span className={`usage-session-title${session.availability === "deleted" ? " is-muted" : ""}`}>{title}</span>
      <small>{session.models.map(name => name || t("usage.unknownModel")).join(" · ")}</small>
    </span>
    {session.channelTurns * 2 > session.turns && <span className="usage-tag" title={t("usage.channelTurns", { count: session.channelTurns })}><Hash size={11} />{t("usage.channelTag")}</span>}
    {session.availability === "archived" && <span className="usage-tag">{t("usage.archived")}</span>}
    <span className="usage-session-numbers">
      <strong>{formatTokens(session.total, locale)}</strong>
      <small>{share !== null ? `${share}% · ` : ""}<span title={rate === null ? t("usage.noCacheReads") : undefined}>{t("usage.hitShort", { rate: formatPercent(rate) })}</span></small>
    </span>
  </>;
  return <li>{openable
    ? <button type="button" className="usage-session-row" onClick={() => onOpenSession!(session.sessionId)} title={t("usage.openSession")}>{content}</button>
    : <div className="usage-session-row is-static" title={session.availability === "archived" ? t("usage.archivedHelp") : session.availability === "unavailable" ? t("usage.unavailableHelp") : undefined}>{content}</div>}
  </li>;
}
