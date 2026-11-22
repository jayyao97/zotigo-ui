import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Globe, Search } from "lucide-react";
import { useLocale } from "../i18n";
import { t } from "../../shared/i18n/index";
import { loadTimeZoneOptions, matchesTimeZone, systemTimeZone, timeZoneOption, type TimeZoneOption } from "../../shared/usageModel";

/** null follows the system zone. */
export type TimeZoneChoice = string | null;

/**
 * Chooses the zone that defines usage days. Users pick from the zones the
 * runtime knows, searchable by city, localized name or UTC offset, so an
 * invalid name cannot be entered.
 */
export function TimeZonePicker({ value, onChange }: { value: TimeZoneChoice; onChange: (value: TimeZoneChoice) => void }) {
  const locale = useLocale();
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Keyboard moves and opening scroll the active row into view; hovering does not.
  const followActive = useRef(true);
  const system = systemTimeZone();
  const effective = value ?? system;
  const current = useMemo(() => timeZoneOption(effective, locale), [effective, locale]);
  const systemOption = useMemo(() => timeZoneOption(system, locale), [system, locale]);
  const utcOption = useMemo(() => timeZoneOption("UTC", locale), [locale]);
  const [loaded, setLoaded] = useState<{ locale: string; options: TimeZoneOption[] } | null>(null);
  const allOptions = loaded?.locale === locale ? loaded.options : null;

  // Build the list in the background when idle, and at once when opened.
  useEffect(() => {
    let active = true;
    const load = () => { void loadTimeZoneOptions(locale).then(options => { if (active) setLoaded({ locale, options }); }); };
    if (open) load();
    const idle = open ? undefined : window.setTimeout(load, 1500);
    return () => { active = false; window.clearTimeout(idle); };
  }, [locale, open]);

  const options = useMemo(() => {
    if (!open) return [];
    // UTC is always offered, even while the rest is loading.
    const all = allOptions ?? [utcOption];
    // ICU may list only a legacy spelling (Asia/Katmandu) of a current zone.
    const withCurrent = value && !all.some(option => option.id === value) ? [current, ...all] : all;
    return withCurrent.filter(option => matchesTimeZone(option, query));
  }, [open, allOptions, utcOption, query, value, current]);
  // While searching, a zone query means that zone, so "follow system" only
  // shows when the query matches its own label.
  const showSystem = !query.trim() || t("usage.zone.system").toLowerCase().includes(query.trim().toLowerCase());
  // Row 0 is "follow system" when shown; zones follow.
  const rows: Array<{ key: string; choice: TimeZoneChoice; option: TimeZoneOption }> = useMemo(() => [
    ...(showSystem ? [{ key: "system", choice: null, option: systemOption }] : []),
    ...options.map(option => ({ key: option.id, choice: option.id, option })),
  ], [showSystem, systemOption, options]);
  const selectedIndex = rows.findIndex(row => row.choice === value);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);
  // Open at the current choice; a new query starts from the first match.
  useEffect(() => { if (open) { followActive.current = true; setActive(query ? 0 : Math.max(0, selectedIndex)); } }, [open, query, allOptions === null]);
  useEffect(() => {
    if (open && followActive.current) list.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  const close = (focus = true) => { setOpen(false); if (focus) trigger.current?.focus(); };
  const choose = (choice: TimeZoneChoice) => { onChange(choice); close(); };

  return <div className="usage-zone-picker" ref={root}>
    <button ref={trigger} type="button" className="usage-filter-button" aria-haspopup="listbox" aria-expanded={open}
      aria-label={`${t("usage.timeZone")}: ${value === null ? t("usage.zone.system") : current.id}, ${current.offsetLabel}`}
      title={current.name ? `${current.id} · ${current.name}` : current.id}
      onClick={() => { setQuery(""); setOpen(next => !next); }}>
      <Globe size={14} strokeWidth={1.8} />
      <span>{value === null ? t("usage.zone.system") : current.city}</span>
      <small>{current.offsetLabel}</small>
      <ChevronDown size={13} strokeWidth={1.8} />
    </button>
    {open && <div className="usage-zone-menu">
      <label className="usage-zone-search">
        <Search size={14} strokeWidth={1.8} />
        <input autoFocus value={query} placeholder={t("usage.zone.search")} aria-label={t("usage.zone.search")}
          role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            // Enter and Escape belong to the input method while composing.
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
            else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (rows.length) { followActive.current = true; setActive(index => (index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length); }
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (rows[active]) choose(rows[active].choice);
            } else if (event.key === "Tab") close(false);
          }} />
      </label>
      <div className="usage-zone-options" id={listId} role="listbox" aria-label={t("usage.timeZone")} ref={list}>
        {rows.map((row, index) => <div key={row.key} id={`${listId}-${index}`} data-row={index} role="option"
          aria-selected={row.choice === value} className={[row.choice === null ? "is-system" : "", index === active ? "is-active" : ""].filter(Boolean).join(" ") || undefined}
          onPointerMove={() => { if (active !== index) { followActive.current = false; setActive(index); } }} onPointerDown={event => event.preventDefault()} onClick={() => choose(row.choice)}>
          <span className="usage-zone-option-main">
            <strong>{row.choice === null ? t("usage.zone.system") : row.option.city}</strong>
            <small>{[row.option.id, row.option.id === "UTC" ? t("usage.zone.utcName") : row.option.name].filter(Boolean).join(" · ")}</small>
          </span>
          <span className="usage-zone-offset">{row.option.offsetLabel}</span>
          <span className="usage-zone-check">{row.choice === value && <Check size={14} strokeWidth={2} />}</span>
        </div>)}
        {allOptions === null ? <p className="usage-zone-loading">{t("usage.zone.loading")}</p>
          : rows.length === 0 && <p>{t("usage.zone.noMatch")}</p>}
      </div>
    </div>}
  </div>;
}
