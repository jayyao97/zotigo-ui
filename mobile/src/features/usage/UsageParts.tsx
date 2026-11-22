import { useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import X from "lucide-react-native/icons/x";
import { t } from "@zotigo/shared/i18n/index";
import { cacheHitRate, type UsageActivity, type UsageSession, type UsageSessionPage, type UsageTotals } from "@zotigo/shared/usage";
import {
  addDays, addTotals, cumulativeTotals, daysBetween, emptyTotals, formatDayLabel, formatLongDate, formatMonth, formatPercent,
  formatTokens, heatmapCells, heatmapWeekTotals, intensityLevels, matchesTimeZone, monthColumns, timeZoneOption,
  type HeatmapCell, type TimeZoneOption,
} from "@zotigo/shared/usageModel";
import { useLocale } from "../../platform/i18n";
import { BottomSheet, ChoiceRow } from "../../components/BottomSheet";
import { colors, ListGroup, ListRow, radius, space, styles, type } from "../../components/ui";

export type HeatmapView = "daily" | "weekly" | "cumulative";
export type Range = { from: string; to: string };

/** Equal-width choices in one pill; the active one is filled. */
export function Segmented<T extends string>({ value, choices, onChange, label }: {
  value: T | null;
  choices: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.md, padding: 3 }}>
      {choices.map((choice) => {
        const active = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(choice.value)}
            style={{ flex: 1, minHeight: 34, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: active ? colors.selected : "transparent" }}
          >
            <Text numberOfLines={1} style={{ color: active ? colors.text : colors.muted, ...type.footnote, fontWeight: "600" }}>{choice.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface Stat { label: string; value: string; detail?: string }
/** Two columns of figures. */
export function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {stats.map((stat) => (
        <View key={stat.label} style={{ flexBasis: "48%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: 2 }}>
          <Text numberOfLines={1} style={styles.muted}>{stat.label}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "600" }}>{stat.value}</Text>
          {!!stat.detail && <Text numberOfLines={2} style={{ color: colors.faint, ...type.caption }}>{stat.detail}</Text>}
        </View>
      ))}
    </View>
  );
}

// Heatmap geometry, matching Desktop's: 53 week columns of 14pt.
const pitch = 14;
const cellSize = 11;
const gutter = 30;
const header = 18;
const weeksShown = 53;
const chartWidth = gutter + weeksShown * pitch;
// Four steps of the accent over the empty-cell colour.
const levelOpacity = [0, 0.3, 0.52, 0.76, 1];

/**
 * The year of activity. It is wider than a phone, so it scrolls sideways and
 * opens at the current week. A tap on a day or week selects it as the period;
 * the selection is described below the chart instead of in a hover tooltip.
 */
export function ActivityChart({ data, range, trackingFrom, view, selected, onSelect }: {
  data?: UsageActivity;
  range: Range;
  trackingFrom: string | null;
  view: HeatmapView;
  selected: Range | null;
  onSelect: (from: string, to: string) => void;
}) {
  const locale = useLocale();
  const scroll = useRef<ScrollView>(null);
  const cells = useMemo(() => heatmapCells(data?.days ?? [], range), [data, range]);
  const weeks = useMemo(() => heatmapWeekTotals(cells), [cells]);
  const untracked = (to: string) => trackingFrom !== null && to < trackingFrom;
  const inSelection = (from: string, to: string) => selected !== null && from <= selected.to && to >= selected.from;
  const months = monthColumns(cells).map((month) => ({ column: month.column, label: formatMonth(month.date, locale) }));
  const dailyLevel = intensityLevels(cells.filter((cell) => !cell.future).map((cell) => cell.total));
  const weeklyLevel = intensityLevels(weeks.map((week) => week.total));
  const weekdayRows = cells[0] && new Date(`${cells[0].date}T00:00:00Z`).getUTCDay() === 1 ? [0, 2, 4] : [1, 3, 5];
  const weekday = (row: number) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short" }).format(Date.parse(`${cells[row]?.date ?? range.from}T00:00:00Z`));
  const monthAxis = months.map((month) => (
    <SvgText key={month.column} x={gutter + month.column * pitch} y={11} fill={colors.faint} fontSize={10}>{month.label}</SvgText>
  ));
  const fill = (level: number) => (level === 0 ? colors.elevated : colors.accentStrong);
  const cell = (key: string, x: number, y: number, level: number, from: string, to: string, label: string) => {
    const chosen = inSelection(from, to);
    return (
      <Rect
        key={key} x={x} y={y} width={cellSize} height={cellSize} rx={2}
        fill={fill(level)} fillOpacity={level === 0 ? 1 : levelOpacity[level]}
        opacity={untracked(to) ? 0.35 : 1}
        stroke={chosen ? colors.text : "none"} strokeWidth={chosen ? 1.5 : 0}
        onPress={() => onSelect(from, to)}
        accessibilityLabel={label}
      />
    );
  };

  // Each chart is drawn in Desktop's coordinates; the left gutter (weekday
  // and value labels) is drawn separately so it stays put while the weeks
  // scroll sideways.
  let axis: ReactNode[] = [];
  let body: ReactNode;
  let height: number;
  if (view === "daily") {
    height = header + 7 * pitch;
    axis = weekdayRows.map((row) => <SvgText key={row} x={0} y={header + row * pitch + 9} fill={colors.faint} fontSize={10}>{weekday(row)}</SvgText>);
    body = cells.filter((item) => !item.future).map((item) =>
      cell(item.date, gutter + item.column * pitch, header + item.row * pitch, dailyLevel(item.total), item.date, item.date, formatLongDate(item.date, locale)));
  } else if (view === "weekly") {
    height = header + 3 * pitch;
    body = weeks.map((week) =>
      cell(week.start, gutter + week.column * pitch, header + pitch, weeklyLevel(week.total), week.start, week.end,
        `${formatDayLabel(week.start, locale)} – ${formatDayLabel(week.end, locale)}`));
  } else {
    const points = cumulativeTotals(cells);
    const maximum = Math.max(1, points.at(-1)?.total ?? 0);
    const plot = 7 * pitch;
    height = header + plot;
    const x = (date: string) => gutter + (daysBetween(range.from, date) + 0.5) * pitch / 7;
    const y = (value: number) => header + plot - (value / maximum) * (plot - 4);
    const path = points.map((point, index) => `${index ? "L" : "M"}${x(point.date).toFixed(1)},${y(point.total).toFixed(1)}`).join("");
    axis = [<SvgText key="max" x={0} y={header + 8} fill={colors.faint} fontSize={10}>{formatTokens(maximum, locale)}</SvgText>];
    body = (
      <>
        <Line x1={gutter} x2={chartWidth} y1={header + plot} y2={header + plot} stroke={colors.border} strokeWidth={1} />
        {points.length > 0 && (
          <Path d={`${path}L${x(points.at(-1)!.date).toFixed(1)},${header + plot}L${x(points[0].date).toFixed(1)},${header + plot}Z`} fill={colors.accentStrong} fillOpacity={0.14} />
        )}
        {points.length > 0 && <Path d={path} fill="none" stroke={colors.accent} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />}
      </>
    );
  }
  const trend = hitRateTrend(cells, weeks, view, range);
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: space.md, gap: space.sm }}>
      <View style={{ flexDirection: "row", paddingLeft: space.md }}>
        <View style={{ gap: space.md }}>
          <Svg width={gutter} height={height}>{axis}</Svg>
          <View style={{ height: trendLabel }} />
          <Svg width={gutter} height={trend.height}>{trend.axis}</Svg>
        </View>
        <ScrollView
          ref={scroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: space.md }}
          // Open at the current week, where the recent activity is.
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        >
          <View style={{ gap: space.md }}>
            <Svg width={chartWidth - gutter} height={height}><G x={-gutter}>{monthAxis}{body}</G></Svg>
            <View style={{ height: trendLabel }} />
            <Svg width={chartWidth - gutter} height={trend.height}><G x={-gutter}>{trend.body}</G></Svg>
          </View>
        </ScrollView>
        {/* The trend's title sits over both columns, outside the scroll. */}
        <View pointerEvents="none" style={{ position: "absolute", left: space.md, right: space.md, top: height + space.md, height: trendLabel, flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text numberOfLines={1} style={{ color: colors.muted, ...type.caption, flexShrink: 0 }}>{t("usage.hitRateTrend")}</Text>
          <Text numberOfLines={1} style={{ color: colors.faint, ...type.caption, flexShrink: 1 }}>{t("usage.cacheHitRateNote")}</Text>
        </View>
      </View>
      {view !== "cumulative" && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, paddingHorizontal: space.md }}>
          <Text style={{ color: colors.faint, ...type.caption, marginRight: 4 }}>{t("usage.less")}</Text>
          {levelOpacity.map((opacity, level) => (
            <View key={level} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: fill(level), opacity: level === 0 ? 1 : opacity }} />
          ))}
          <Text style={{ color: colors.faint, ...type.caption, marginLeft: 4 }}>{t("usage.more")}</Text>
        </View>
      )}
    </View>
  );
}

const trendLabel = 18;

function hitRateTrend(cells: HeatmapCell[], weeks: ReturnType<typeof heatmapWeekTotals>, view: HeatmapView, range: Range) {
  const plot = 64;
  const top = 8;
  const points = view === "weekly"
    ? weeks.map((week) => ({ x: gutter + week.column * pitch + cellSize / 2, totals: week as UsageTotals }))
    : cells.filter((cell) => !cell.future).map((cell) => ({ x: gutter + (daysBetween(range.from, cell.date) + 0.5) * pitch / 7, totals: cell as UsageTotals }));
  // Rates usually sit near 100%; start the axis just below the lowest point.
  const rates = points.map((point) => cacheHitRate(point.totals)).filter((rate): rate is number => rate !== null);
  const lowest = rates.length ? Math.min(...rates) : 0;
  const floor = lowest >= 0.5 ? Math.max(0, Math.floor(lowest * 10) / 10 - 0.1) : 0;
  const y = (rate: number) => top + (1 - (rate - floor) / (1 - floor)) * plot;
  const segments: string[] = [];
  let current = "";
  for (const point of points) {
    const rate = cacheHitRate(point.totals);
    if (rate === null) { if (current) segments.push(current); current = ""; continue; }
    current += `${current ? "L" : "M"}${point.x.toFixed(1)},${y(rate).toFixed(1)}`;
  }
  if (current) segments.push(current);
  const none = { cacheRead: 0, cacheInput: 0 };
  const isolated = points.filter((point, index) =>
    cacheHitRate(point.totals) !== null && cacheHitRate(points[index - 1]?.totals ?? none) === null && cacheHitRate(points[index + 1]?.totals ?? none) === null);
  const marks = [floor, (floor + 1) / 2, 1];
  return {
    height: plot + top * 2,
    axis: marks.map((rate) => <SvgText key={rate} x={0} y={y(rate) + 3} fill={colors.faint} fontSize={10}>{`${Math.round(rate * 100)}%`}</SvgText>),
    body: (
      <>
        {marks.map((rate) => <Line key={rate} x1={gutter} x2={chartWidth} y1={y(rate)} y2={y(rate)} stroke={colors.border} strokeWidth={1} />)}
        {segments.map((segment) => <Path key={segment.slice(0, 24)} d={segment} fill="none" stroke={colors.accent} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />)}
        {isolated.map((point) => <Circle key={point.x} cx={point.x} cy={y(cacheHitRate(point.totals)!)} r={1.8} fill={colors.accent} />)}
      </>
    ),
  };
}

/** What a tap on the chart selected, with its own figures and a way to clear it. */
export function SelectionChip({ range, data, onClear }: { range: Range; data?: UsageActivity; onClear: () => void }) {
  const locale = useLocale();
  const label = range.from === range.to ? formatLongDate(range.from, locale) : `${formatDayLabel(range.from, locale)} – ${formatDayLabel(range.to, locale)}`;
  const figures = data ? `${t("usage.tooltipTokens", { tokens: formatTokens(data.range.total, locale) })} · ${t("usage.tooltipHitRate", { rate: formatPercent(cacheHitRate(data.days.reduce(addTotals, emptyTotals()))) })}` : "";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: space.xs, paddingLeft: space.md, paddingRight: 2, minHeight: 36, borderRadius: radius.pill, backgroundColor: colors.selected }}>
      <Text numberOfLines={1} style={{ color: colors.text, ...type.footnote, fontWeight: "600", flexShrink: 1 }}>{label}{figures ? <Text style={{ color: colors.muted, fontWeight: "400" }}>{`  ${figures}`}</Text> : null}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t("usage.period.clearSelection")} onPress={onClear} hitSlop={8} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
        <X size={15} color={colors.muted} />
      </Pressable>
    </View>
  );
}

export function ModelList({ data }: { data?: UsageActivity }) {
  const locale = useLocale();
  if (!data) return null;
  return (
    <ListGroup>
      {data.byModel.length === 0
        ? <ListRow title={t("usage.noUsageInPeriod")} />
        : data.byModel.map((entry) => (
          <ListRow
            key={`${entry.model}\u0000${entry.runtime}`}
            title={`${entry.model || t("usage.unknownModel")}${entry.runtime === "codex" ? ` · ${t("app.codex")}` : ""}`}
            subtitle={`${t("usage.input")} ${formatTokens(entry.input, locale)} · ${t("usage.cacheRead")} ${formatTokens(entry.cacheRead, locale)} · ${t("usage.output")} ${formatTokens(entry.output, locale)} · ${t("usage.hitShort", { rate: formatPercent(cacheHitRate(entry)) })}`}
            value={formatTokens(entry.total, locale)}
          />
        ))}
    </ListGroup>
  );
}

export function SessionRanking({ page, periodTotal, loading, canLoadMore, onLoadMore, onOpen }: {
  page?: UsageSessionPage;
  periodTotal?: number;
  loading: boolean;
  canLoadMore: boolean;
  onLoadMore: () => void;
  onOpen: (session: UsageSession) => void;
}) {
  const locale = useLocale();
  if (!page) return <Text style={styles.muted}>{loading ? t("usage.loading") : ""}</Text>;
  return (
    <ListGroup>
      {page.sessions.length === 0 && <ListRow title={t("usage.noUsageInPeriod")} />}
      {page.sessions.map((session, index) => {
        const title = session.availability === "deleted" ? t("usage.deletedSession") : session.title || t("usage.untitledSession");
        const share = periodTotal ? Math.round((session.total / periodTotal) * 100) : null;
        const tags = [
          session.channelTurns * 2 > session.turns ? t("usage.channelTag") : "",
          session.availability === "archived" ? t("usage.archived") : "",
          session.availability === "unavailable" ? t("usage.unavailableHelp") : "",
        ].filter(Boolean);
        return (
          <ListRow
            key={session.sessionId}
            title={`${index + 1}. ${title}`}
            subtitle={[session.models.map((name) => name || t("usage.unknownModel")).join(" · "), ...tags].filter(Boolean).join(" · ")}
            value={`${formatTokens(session.total, locale)}${share !== null ? ` · ${share}%` : ""}`}
            onPress={session.availability === "available" ? () => onOpen(session) : undefined}
            accessibilityLabel={`${title}, ${formatTokens(session.total, locale)}`}
          />
        );
      })}
      {canLoadMore && <ListRow title={loading ? t("usage.loading") : t("usage.loadMore")} disabled={loading} onPress={onLoadMore} chevron={false} />}
    </ListGroup>
  );
}

/** Follow the system zone (null) or pick one, searchable by city, name or offset. */
export function TimeZoneSheet({ visible, value, system, options, onChoose, onClose }: {
  visible: boolean;
  value: string | null;
  system: string;
  options: TimeZoneOption[] | null;
  onChoose: (value: string | null) => void;
  onClose: () => void;
}) {
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const systemOption = useMemo(() => timeZoneOption(system, locale), [system, locale]);
  const all = options ?? [timeZoneOption("UTC", locale)];
  const current = value && !all.some((option) => option.id === value) ? [timeZoneOption(value, locale), ...all] : all;
  const matches = current.filter((option) => matchesTimeZone(option, query)).slice(0, 200);
  const describe = (option: TimeZoneOption) => [option.offsetLabel, option.id === "UTC" ? t("usage.zone.utcName") : option.name || option.id].filter(Boolean).join(" · ");
  const close = () => { setQuery(""); onClose(); };
  return (
    <BottomSheet visible={visible} title={t("usage.timeZone")} onClose={close}>
      <TextInput
        accessibilityLabel={t("usage.zone.search")}
        placeholder={t("usage.zone.search")}
        placeholderTextColor={colors.faint}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { marginBottom: space.sm }]}
      />
      {!query.trim() && (
        <ChoiceRow title={t("usage.zone.system")} subtitle={`${systemOption.city} · ${systemOption.offsetLabel}`} selected={value === null} onPress={() => { onChoose(null); close(); }} />
      )}
      {matches.map((option) => (
        <ChoiceRow key={option.id} title={option.id === "UTC" ? "UTC" : option.city} subtitle={describe(option)} selected={value === option.id} onPress={() => { onChoose(option.id); close(); }} />
      ))}
      {!options && <Text style={[styles.muted, { padding: space.md }]}>{t("usage.zone.loading")}</Text>}
      {options && matches.length === 0 && <Text style={[styles.muted, { padding: space.md }]}>{t("usage.zone.noMatch")}</Text>}
    </BottomSheet>
  );
}

export function periodLabel(period: { kind: "recent"; days: number } | { kind: "selection" }, selected: Range, locale: ReturnType<typeof useLocale>) {
  if (period.kind === "recent") return period.days === 1 ? t("usage.period.today") : t("usage.period.recent", { count: period.days });
  if (selected.from === selected.to) return formatLongDate(selected.from, locale);
  return `${formatLongDate(selected.from, locale)} – ${formatLongDate(selected.to, locale)}`;
}

export function daysInPeriod(selected: Range, trackingFrom: string | null) {
  // Days before tracking started have no data; they would dilute the average.
  const first = trackingFrom && trackingFrom > selected.from ? trackingFrom : selected.from;
  return Math.max(1, daysBetween(first, selected.to) + 1);
}

export { addDays };
