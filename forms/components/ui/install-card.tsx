"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { toggleRadio } from "@/components/ui/inputs";

/**
 * One installation type as a card: a tick box and name on top, a chevron that opens or
 * closes the card, and the questions for that type inside. Every service that lists
 * installation types should use this so they look and behave the same.
 *
 * `single` makes the cards behave as a choice of one (selecting another clears this one);
 * otherwise several can be on at once. The chevron is always shown: on a card that is not
 * selected yet it selects and opens it.
 */
export function InstallCard({
  title,
  detail,
  checked,
  expanded,
  panelId,
  single = false,
  name,
  onSelect,
  onFold,
  children,
}: {
  title: string;
  detail?: string;
  checked: boolean;
  expanded: boolean;
  panelId: string;
  single?: boolean;
  name?: string;
  /** Ticks the card (or, for a card that is already on, un-ticks it). */
  onSelect: () => void;
  /** Opens or closes the card's questions without changing the selection. */
  onFold: () => void;
  children?: ReactNode;
}) {
  const open = checked && expanded;
  return (
    <div className={checked ? "demo-type is-on" : "demo-type"}>
      <div className="demo-type__head">
        <label className="demo-type__choice">
          <input
            type={single ? "radio" : "checkbox"}
            name={single ? name : undefined}
            {...(single ? toggleRadio(checked, onSelect, onSelect) : { checked, onChange: onSelect })}
          />
          <span className="demo-mark" aria-hidden="true" />
          <span className="demo-type__copy">
            <span className="demo-type__name">{title}</span>
            {detail ? <span className="demo-type__detail">{detail}</span> : null}
          </span>
        </label>
        <button
          type="button"
          className="demo-type__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={checked ? onFold : onSelect}
        >
          {open ? (
            <ChevronUp strokeWidth={2.25} aria-hidden="true" />
          ) : (
            <ChevronDown strokeWidth={2.25} aria-hidden="true" />
          )}
          <span className="visually-hidden">{open ? `Hide ${title} details` : `Show ${title} details`}</span>
        </button>
      </div>
      {open ? (
        <div className="demo-type__body grass-card-body" id={panelId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
