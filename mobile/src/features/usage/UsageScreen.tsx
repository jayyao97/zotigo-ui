import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ChartColumn from "lucide-react-native/icons/chart-column";
import Cpu from "lucide-react-native/icons/cpu";
import Globe from "lucide-react-native/icons/globe";
import Hash from "lucide-react-native/icons/hash";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { t } from "@zotigo/shared/i18n/index";
import { cacheHitRate, type UsageActivity, type UsageChannelFilter, type UsageSessionPage } from "@zotigo/shared/usage";
import {
  addDays, addTotals, emptyTotals, formatLongDate, formatPercent, formatTokens, heatmapRange, isValidTimeZone,
  loadTimeZoneOptions, systemTimeZone, timeZoneOption, todayIn, weekStartDay, type TimeZoneOption,
} from "@zotigo/shared/usageModel";
import type { Routes } from "../../navigation";
import { useDaemon } from "../../platform/context";
import { useLocale } from "../../platform/i18n";
import { storage } from "../../platform/storage";
import { usageActivity, usageSessions } from "../../core/usage";
import { BottomSheet, ChoiceRow } from "../../components/BottomSheet";
import { SettingsPage } from "../../components/SettingsLayout";
import { EmptyState, IconButton, ListGroup, ListRow, Notice, Section, colors, styles } from "../../components/ui";
import { ActivityChart, ModelList, SelectionChip, SessionRanking, Segmented, StatGrid, TimeZoneSheet, daysInPeriod, periodLabel, type HeatmapView, type Range } from "./UsageParts";
import { useUsageQuery } from "./useUsageQuery";

// Shared with Desktop's key name, but stored per app (AsyncStorage).
export const usageTimeZoneStorageKey = "zotigo:usage-time-zone";
const sessionPageSize = 20;
const maxSessionRows = 200;

type Period = { kind: "recent"; days: 1 | 7 | 30 | 90 } | { kind: "selection"; from: string; to: string };

function periodRange(period: Period, today: string, earliest: string): Range {
  if (period.kind === "recent") return { from: addDays(today, 1 - period.days), to: today };
  const from = period.from < earliest ? earliest : period.from;
  const to = period.to > today ? today : period.to;
  return { from, to: to < from ? from : to };
}

/**
 * Token usage of the current device, from the same daemon endpoints Desktop
 * uses. Layout follows Desktop's three parts (filters, the year, period
 * details) in one column; the year chart scrolls sideways.
 */
export function UsageScreen() {
  const locale = useLocale();
  const client = useDaemon();
  const navigation = useNavigation<NativeStackNavigationProp<Routes>>();
  const [zone, setZone] = useState<string | null>(null);
  const timeZone = zone ?? systemTimeZone();
  const [zoneOptions, setZoneOptions] = useState<TimeZoneOption[] | null>(null);
  const [model, setModel] = useState("");
  const [channel, setChannel] = useState<UsageChannelFilter>("all");
  const [view, setView] = useState<HeatmapView>("daily");
  const [period, setPeriod] = useState<Period>({ kind: "recent", days: 7 });
  // Clearing a chart selection returns to the period chosen before it.
  const [periodBefore, setPeriodBefore] = useState<Period>({ kind: "recent", days: 7 });
  const [revision, setRevision] = useState(0);
  const [pages, setPages] = useState(1);
  const [sheet, setSheet] = useState<"model" | "channel" | "zone" | null>(null);
  const [knownModels] = useState(() => new Set<string>());

  useEffect(() => {
    let alive = true;
    void storage.get(usageTimeZoneStorageKey).then((value) => {
      if (alive && value && isValidTimeZone(value)) setZone(value);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (sheet !== "zone" || zoneOptions) return;
    let alive = true;
    void loadTimeZoneOptions(locale).then((options) => { if (alive) setZoneOptions(options); });
    return () => { alive = false; };
  }, [sheet, zoneOptions, locale]);

  const today = todayIn(timeZone);
  const range = useMemo(() => heatmapRange(today, weekStartDay(locale)), [today, locale]);
  const selected = periodRange(period, today, range.from);
  const filters = { timeZone, model: model || undefined, channel };
  const request = client.request.bind(client);
  const host = client.connection.id;
  const year = useUsageQuery<UsageActivity>(`${host}|activity|${JSON.stringify({ ...filters, ...range })}`, () => usageActivity(request, { ...filters, ...range }), revision);
  const periodData = useUsageQuery<UsageActivity>(`${host}|activity|${JSON.stringify({ ...filters, ...selected })}`, () => usageActivity(request, { ...filters, ...selected }), revision);
  const limit = Math.min(maxSessionRows, pages * sessionPageSize);
  const sessions = useUsageQuery<UsageSessionPage>(`${host}|sessions|${JSON.stringify({ ...filters, ...selected, limit })}`, () => usageSessions(request, { ...filters, ...selected, limit }), revision);

  const yearData = year.result?.supported ? year.result.data : undefined;
  const periodActivity = periodData.result?.supported ? periodData.result.data : undefined;
  for (const entry of yearData?.byModel ?? []) if (entry.model) knownModels.add(entry.model);
  const models = [...knownModels].sort();
  const unsupported = year.result?.supported === false;
  const loading = year.loading || periodData.loading || sessions.loading;
  const error = year.error || periodData.error || sessions.error;
  const trackingFrom = yearData?.trackingSince ? todayIn(timeZone, new Date(yearData.trackingSince)) : null;
  const zoneLabel = zone === null ? t("usage.zone.system") : timeZoneOption(zone, locale).city;
  const channelLabel = { all: t("usage.channelAll"), only: t("usage.channelOnly"), exclude: t("usage.channelExclude") }[channel];

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (unsupported ? null : <IconButton icon={RefreshCw} label={t("usage.refresh")} hint={t("usage.refreshHelp")} disabled={loading} onPress={refresh} />),
    });
  }, [navigation, unsupported, loading, refresh, locale]);

  const changePeriod = (next: Period) => { setPeriod(next); setPages(1); };
  const select = (from: string, to: string) => {
    if (period.kind === "selection" && period.from === from && period.to === to) { changePeriod(periodBefore); return; }
    if (period.kind !== "selection") setPeriodBefore(period);
    changePeriod({ kind: "selection", from, to });
  };
  const chooseZone = (value: string | null) => {
    setZone(value); setPages(1);
    void (value === null ? storage.remove(usageTimeZoneStorageKey) : storage.set(usageTimeZoneStorageKey, value)).catch(() => {});
  };

  if (unsupported)
    return <SettingsPage><EmptyState icon={ChartColumn} title={t("usage.title")} message={t("usage.unsupported", { host: client.connection.name })} /></SettingsPage>;

  const label = periodLabel(period, selected, locale);
  const days = daysInPeriod(selected, trackingFrom);
  const rate = periodActivity ? cacheHitRate(periodActivity.days.reduce(addTotals, emptyTotals())) : null;
  const tokens = (value?: number) => (value === undefined ? "—" : formatTokens(value, locale));
  const nothingYet = yearData && yearData.trackingSince === null && !model && channel === "all";

  return (
    <SettingsPage>
      <View style={{ gap: 2 }}>
        <Text style={styles.muted}>
          {t("usage.hostLine", { host: client.connection.name })}
          {trackingFrom ? ` · ${t("usage.trackingSince", { date: formatLongDate(trackingFrom, locale) })}` : ""}
        </Text>
      </View>
      <ListGroup>
        <ListRow icon={Cpu} title={t("usage.model")} value={model || t("usage.allModels")} onPress={() => setSheet("model")} />
        <ListRow icon={Hash} title={t("usage.channel")} value={channelLabel} onPress={() => setSheet("channel")} />
        <ListRow icon={Globe} title={t("usage.timeZone")} value={zoneLabel} onPress={() => setSheet("zone")} />
      </ListGroup>
      <Notice text={error} error />

      {nothingYet ? (
        <EmptyState icon={ChartColumn} title={t("usage.title")} message={t("usage.empty")} />
      ) : (
        <>
          <StatGrid stats={[
            { label: t("usage.allTime"), value: tokens(yearData?.allTime.total), detail: yearData ? t("usage.turns", { count: yearData.allTime.turns }) : undefined },
            { label: t("usage.peakDay"), value: yearData?.peakDay ? formatTokens(yearData.peakDay.total, locale) : "—", detail: yearData?.peakDay ? formatLongDate(yearData.peakDay.date, locale) : undefined },
            { label: t("usage.currentStreak"), value: yearData ? t("usage.days", { count: yearData.currentStreakDays }) : "—" },
            { label: t("usage.longestStreak"), value: yearData ? t("usage.days", { count: yearData.longestStreakDays }) : "—" },
          ]} />

          <Section title={t("usage.activity")} footer={t("mobileUi.usageChartHint")}>
            <Segmented
              label={t("usage.view")}
              value={view}
              onChange={setView}
              choices={(["daily", "weekly", "cumulative"] as const).map((value) => ({ value, label: t(`usage.view.${value}`) }))}
            />
            <ActivityChart data={yearData} range={range} trackingFrom={trackingFrom} view={view} selected={period.kind === "selection" ? selected : null} onSelect={select} />
          </Section>

          <Section title={t("usage.periodDetails")}>
            {period.kind === "selection" ? (
              <SelectionChip range={selected} data={periodActivity} onClear={() => changePeriod(periodBefore)} />
            ) : (
              <Segmented
                label={t("usage.period")}
                value={String(period.days) as "1" | "7" | "30" | "90"}
                onChange={(value) => changePeriod({ kind: "recent", days: Number(value) as 1 | 7 | 30 | 90 })}
                choices={[
                  { value: "1", label: t("usage.period.today") },
                  ...([7, 30, 90] as const).map((count) => ({ value: String(count) as "7" | "30" | "90", label: t("usage.days", { count }) })),
                ]}
              />
            )}
            <StatGrid stats={[
              { label: t("usage.total"), value: tokens(periodActivity?.range.total), detail: periodActivity ? `${label} · ${t("usage.turns", { count: periodActivity.range.turns })}` : label },
              { label: t("usage.dailyAverage"), value: periodActivity ? formatTokens(Math.round(periodActivity.range.total / days), locale) : "—", detail: t("usage.days", { count: days }) },
              { label: t("usage.cacheHitRate"), value: formatPercent(rate), detail: rate === null && periodActivity ? t("usage.noCacheReads") : t("usage.cacheHitRateNote") },
              { label: t("usage.output"), value: tokens(periodActivity?.range.output), detail: periodActivity ? t("usage.inputDetail", { input: formatTokens(periodActivity.range.input, locale) }) : undefined },
            ]} />
          </Section>

          <Section title={t("usage.byModel")}>
            <ModelList data={periodActivity} />
          </Section>

          <Section title={t("usage.sessionRanking")}>
            <SessionRanking
              page={sessions.result?.supported ? sessions.result.data : undefined}
              periodTotal={periodActivity?.range.total}
              loading={sessions.loading}
              canLoadMore={Boolean(sessions.result?.supported && sessions.result.data.nextCursor) && limit < maxSessionRows}
              onLoadMore={() => setPages((value) => value + 1)}
              onOpen={(session) => navigation.navigate("Conversation", { id: session.sessionId, title: session.title || t("usage.untitledSession") })}
            />
          </Section>
        </>
      )}

      <BottomSheet visible={sheet === "model"} title={t("usage.model")} onClose={() => setSheet(null)}>
        <ChoiceRow title={t("usage.allModels")} selected={model === ""} onPress={() => { setModel(""); setPages(1); setSheet(null); }} />
        {models.map((name) => (
          <ChoiceRow key={name} title={name} selected={model === name} onPress={() => { setModel(name); setPages(1); setSheet(null); }} />
        ))}
      </BottomSheet>
      <BottomSheet visible={sheet === "channel"} title={t("usage.channel")} onClose={() => setSheet(null)}>
        {(["all", "only", "exclude"] as const).map((value) => (
          <ChoiceRow key={value} title={{ all: t("usage.channelAll"), only: t("usage.channelOnly"), exclude: t("usage.channelExclude") }[value]} selected={channel === value}
            onPress={() => { setChannel(value); setPages(1); setSheet(null); }} />
        ))}
      </BottomSheet>
      <TimeZoneSheet visible={sheet === "zone"} value={zone} system={systemTimeZone()} options={zoneOptions} onChoose={chooseZone} onClose={() => setSheet(null)} />
      {!yearData && loading && <Text style={[styles.muted, { textAlign: "center", color: colors.faint }]}>{t("usage.loading")}</Text>}
    </SettingsPage>
  );
}
