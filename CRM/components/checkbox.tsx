"use client";

import { Icon } from "./icon";

/** A square tick box for lists (Jobber style): empty, ticked, or "mixed" (a dash, when only some rows are ticked). Clicking it never
 *  opens the row it sits in. */
export function Checkbox({ state, label, onChange, disabled, rowBox }: { state: boolean | "mixed"; label: string; onChange: () => void; disabled?: boolean; rowBox?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state}
      aria-label={label}
      className={rowBox ? "cb row-cb" : "cb"}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      {state === true && <Icon name="check" size={14} />}
    </button>
  );
}
