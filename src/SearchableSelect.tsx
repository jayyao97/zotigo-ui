import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, MoreHorizontal, Search } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
  /** Secondary text, such as a path or kind. */
  detail?: string;
  icon?: ReactNode;
  /** Extra text the search matches, such as a remote URL. */
  keywords?: string[];
  /** Heading of the group the option starts or continues; options of a group are adjacent. */
  group?: string;
  /**
   * Nesting under the option above, such as a Session under its Workspace.
   * Browsing shows the tree instead of the detail; a search shows matches flat
   * with their detail, since a match may appear without its parent.
   */
  depth?: number;
}

/**
 * A select whose list carries its own search field, for choices long enough
 * that a native select is hard to scan. Keyboard and screen reader behavior
 * follows the combobox pattern: the field keeps focus and arrows move the
 * active option.
 */
/** A row of the open list: an option, or the row that reveals an option's hidden children. */
type Row = SearchableOption & { more?: { parent: string; hidden: number } };

export function SearchableSelect({ value, options, placeholder, searchPlaceholder, emptyText, ariaLabel, disabled = false, nestedLimit, moreText, onChange }: {
  value: string;
  options: SearchableOption[];
  /**
   * Browsing shows this many nested options under each parent, then a row that
   * reveals the rest; a search always shows every match. The current choice
   * stays visible.
   */
  nestedLimit?: number;
  moreText?: (hidden: number) => string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Keyboard moves and opening scroll the active row into view; hovering does not.
  const followActive = useRef(true);
  const selected = options.find(option => option.value === value);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Ids follow the option, not its position, so the active descendant changes,
  // and is announced, when revealing options puts another one in that place.
  const optionIds = useRef(new Map<string, string>());
  const optionId = (optionValue: string) => {
    let id = optionIds.current.get(optionValue);
    if (!id) { id = `${listId}-${optionIds.current.size}`; optionIds.current.set(optionValue, id); }
    return id;
  };
  const rows = useMemo<Row[]>(() => {
    const search = query.trim().toLocaleLowerCase();
    if (search) return options.filter(option => [option.label, option.detail ?? "", ...(option.keywords ?? [])].some(text => text.toLocaleLowerCase().includes(search)));
    if (nestedLimit === undefined) return options;
    const result: Row[] = [];
    let parent: SearchableOption | undefined;
    let shown = 0;
    let hidden = 0;
    const closeParent = () => {
      if (parent && hidden) result.push({ value: `\u0000more:${parent.value}`, label: moreText?.(hidden) ?? `+${hidden}`, group: parent.group, depth: 1, more: { parent: parent.value, hidden } });
    };
    for (const option of options) {
      if (!option.depth) { closeParent(); parent = option; shown = 0; hidden = 0; result.push(option); continue; }
      if (parent && !expanded.has(parent.value) && shown >= nestedLimit && option.value !== value) { hidden++; continue; }
      shown++;
      result.push(option);
    }
    closeParent();
    return result;
  }, [options, query, nestedLimit, moreText, expanded, value]);
  const selectedIndex = rows.findIndex(option => option.value === value);
  // A reload can shorten the list while it is open.
  useEffect(() => { if (active >= rows.length) setActive(Math.max(0, rows.length - 1)); }, [active, rows.length]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);
  // Open at the current choice; a new query starts from the first match.
  useEffect(() => { if (open) { followActive.current = true; setActive(query ? 0 : Math.max(0, selectedIndex)); } }, [open, query]);
  // Each opening starts collapsed again.
  useEffect(() => { if (!open) setExpanded(new Set()); }, [open]);
  useEffect(() => {
    if (open && followActive.current) list.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  // Dialogs scroll their content, so the menu is fixed to the viewport next to the trigger
  // and opens upward when there is more room above.
  const [placement, setPlacement] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    let last = "";
    const place = (event?: Event) => {
      // Scrolling the options themselves does not move the trigger.
      if (event?.target instanceof Node && list.current?.contains(event.target)) return;
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      // On touch screens the keyboard shrinks the visual viewport, not the layout one.
      const viewportBottom = window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight;
      const below = viewportBottom - rect.bottom - 12;
      const above = rect.top - 12;
      const up = below < 240 && above > below;
      const next: CSSProperties = { left: rect.left, width: rect.width, maxHeight: Math.max(160, Math.min(360, (up ? above : below) - 6)),
        ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) };
      const key = JSON.stringify(next);
      if (key !== last) { last = key; setPlacement(next); }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [open]);

  const close = (focus = true) => { setOpen(false); if (focus) trigger.current?.focus(); };
  const choose = (next: string) => { onChange(next); close(); };
  // The reveal row keeps the list open and moves to the first option it shows.
  const revealedFrom = useRef<Set<string> | null>(null);
  const pick = (row: Row) => {
    const more = row.more;
    if (!more) { choose(row.value); return; }
    revealedFrom.current = new Set(rows.map(shown => shown.value));
    setExpanded(current => new Set(current).add(more.parent));
  };
  useEffect(() => {
    const before = revealedFrom.current;
    if (!before) return;
    revealedFrom.current = null;
    const first = rows.findIndex(row => !before.has(row.value));
    if (first >= 0) { followActive.current = true; setActive(first); }
  }, [rows]);

  return <div className="searchable-select" ref={root}>
    <button ref={trigger} type="button" className="searchable-select-trigger" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
      aria-label={selected ? `${ariaLabel}: ${selected.label}` : ariaLabel}
      onClick={() => { setQuery(""); setOpen(next => !next); }}
      onKeyDown={event => { if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); setQuery(""); setOpen(true); } }}>
      {selected?.icon}
      <span className={selected ? undefined : "is-placeholder"}>{selected?.label ?? placeholder}</span>
      {selected?.detail && <small>{selected.detail}</small>}
      <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
    </button>
    {open && <div className="searchable-select-menu" style={placement}>
      <label className="searchable-select-search">
        <Search size={14} strokeWidth={1.8} aria-hidden="true" />
        <input autoFocus value={query} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
          role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={rows[active] ? optionId(rows[active].value) : undefined}
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
              if (rows[active]) pick(rows[active]);
            } else if (event.key === "Tab") close(false);
          }} />
      </label>
      <div className="searchable-select-options" id={listId} role="listbox" aria-label={ariaLabel} ref={list}>
        {rows.map((option, index) => {
          const tree = !query.trim() && option.group !== undefined;
          const depth = tree ? option.depth ?? 0 : 0;
          const detail = tree ? undefined : option.detail;
          return <Fragment key={option.value}>
            {option.group !== undefined && option.group !== rows[index - 1]?.group && <div className="searchable-select-group" role="presentation">{option.group}</div>}
            <div id={optionId(option.value)} data-row={index} role="option"
              aria-selected={option.value === value} aria-label={detail || !option.detail ? undefined : `${option.label}, ${option.detail}`}
              className={[index === active ? "is-active" : "", option.more ? "searchable-select-more" : ""].filter(Boolean).join(" ") || undefined}
              style={depth ? { paddingLeft: 8 + depth * 18 } : undefined}
              onPointerMove={() => { if (active !== index) { followActive.current = false; setActive(index); } }} onPointerDown={event => event.preventDefault()} onClick={() => pick(option)}>
              {/* Rows are a three-column grid; keep the icon column without an icon. */}
              {option.more ? <MoreHorizontal size={14} aria-hidden="true" /> : option.icon ?? <span aria-hidden="true" />}
              <span className="searchable-select-option-main">
                <strong>{option.label}</strong>
                {detail && <small>{detail}</small>}
              </span>
              <span className="searchable-select-check">{option.value === value && <Check size={14} strokeWidth={2} />}</span>
            </div>
          </Fragment>;
        })}
        {rows.length === 0 && <p>{emptyText}</p>}
      </div>
    </div>}
  </div>;
}
