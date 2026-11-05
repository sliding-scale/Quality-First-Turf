"use client";

/* Content for the filter popovers (D-041): a searchable list, and a date range picker.
   Open them with useUI().popover(anchor, (close) => <FilterMenu ... close={close} />, { className: "filter" }). */

import { useEffect, useRef, useState } from "react";
import { RANGE_OPTIONS, type DateRange, type RangeKey } from "@/lib/dates";
import { Icon } from "./icon";

export type FilterOption = { label: string; dot?: string; count?: number };

/** A search box above a scrolling list. The selected option gets a tick; options may have a coloured dot and a count. */
export function FilterMenu({ placeholder, options, selected, onSelect, close }: {
  placeholder: string;
  options: FilterOption[];
  selected: string;
  onSelect: (label: string) => void;
  close: () => void;
}) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <>
      <input ref={input} className="menu-search" type="search" placeholder={placeholder} aria-label={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="menu-list" role="listbox" aria-label={placeholder}>
        {shown.length ? (
          shown.map((o) => (
            <button
              key={o.label}
              type="button"
              role="option"
              aria-selected={o.label === selected}
              className="opt"
              onClick={() => {
                close();
                onSelect(o.label);
              }}
            >
              {o.dot && <span className="dot" style={{ background: o.dot }} />}
              <span>{o.label}{o.count !== undefined && ` (${o.count})`}</span>
              {o.label === selected && <Icon name="check" size={22} className="tick" />}
            </button>
          ))
        ) : (
          <div className="menu-empty">No matches</div>
        )}
      </div>
    </>
  );
}

/** "Date range" field with the list of ranges. Custom range opens two date fields and an Apply button. */
export function DateRangeMenu({ value, onChange, close }: { value: DateRange; onChange: (r: DateRange) => void; close: () => void }) {
  const [key, setKey] = useState<RangeKey>(value.key);
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const [tried, setTried] = useState(false);

  const label = RANGE_OPTIONS.find((o) => o.key === key)?.label ?? "All";
  // Red only after Apply is pressed (D-035).
  const problem = !from && !to ? "Choose a start date, an end date, or both." : from && to && from > to ? "The start date must be on or before the end date." : "";
  const bad = tried && !!problem;

  function pick(k: RangeKey) {
    if (k === "custom") {
      setKey("custom");
      return;
    }
    close();
    onChange({ key: k });
  }

  function apply() {
    setTried(true);
    if (problem) return;
    close();
    onChange({ key: "custom", from, to });
  }

  return (
    <>
      <div className="dr-field">
        <div>
          <span className="dr-label">Date range</span>
          <span className="dr-value">{label}</span>
        </div>
        <Icon name="chevdown" size={22} />
      </div>
      <div className="dr-list" role="listbox" aria-label="Date range">
        {RANGE_OPTIONS.map((o) => (
          <button key={o.key} type="button" role="option" aria-selected={o.key === key} className={`dr-opt${o.key === key ? " on" : ""}`} onClick={() => pick(o.key)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className={`dr-custom${key === "custom" ? " open" : ""}`} aria-hidden={key !== "custom"}>
        <div>
          <div className="frow" style={{ ["--n" as string]: 2 }}>
            <div className={`field${bad ? " bad" : ""}`}>
              <label htmlFor="dr-from">From</label>
              <input id="dr-from" type="date" value={from} max={to || undefined} tabIndex={key === "custom" ? 0 : -1} aria-invalid={bad} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className={`field${bad ? " bad" : ""}`}>
              <label htmlFor="dr-to">To</label>
              <input id="dr-to" type="date" value={to} min={from || undefined} tabIndex={key === "custom" ? 0 : -1} aria-invalid={bad} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="dr-err" role={bad ? "alert" : undefined}>{bad ? problem : ""}</div>
          <button type="button" className="btn primary dr-apply" tabIndex={key === "custom" ? 0 : -1} onClick={apply}>Apply</button>
        </div>
      </div>
    </>
  );
}
