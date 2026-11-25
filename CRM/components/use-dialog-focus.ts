"use client";

import { useEffect, useRef, useState } from "react";

/* Keyboard and screen-reader behaviour every dialog shares (audit 2026-11-23): focus moves into the dialog when it opens (unless a field inside
   already took it), Tab and Shift+Tab stay inside it, and focus goes back to what opened it. Put the returned ref on the element with
   role="dialog". `trap` is off for a dialog that leaves the page behind it usable (the Schedule's form). `focusFirstField` false focuses the dialog itself. */
export function useDialogFocus(trap = true, focusFirstField = true) {
  const box = useRef<HTMLDivElement>(null);
  // Read while rendering the first time, before a field inside takes focus: this is what opened the dialog.
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  useEffect(() => {
    const dialog = box.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      // A small popup that only shows details starts with the popup itself focused, so no field in it looks selected.
      const first = !focusFirstField ? null : dialog.querySelector<HTMLElement>("input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled)") ?? dialog.querySelector<HTMLElement>("button:not(:disabled)");
      (first ?? dialog).focus({ preventScroll: true });
    }
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog || !trap) return;
      const items = [...dialog.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && at <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && at === items.length - 1) { e.preventDefault(); items[0].focus(); }
    };
    document.addEventListener("keydown", onTab);
    return () => {
      document.removeEventListener("keydown", onTab);
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [trap, opener, focusFirstField]);
  return box;
}
