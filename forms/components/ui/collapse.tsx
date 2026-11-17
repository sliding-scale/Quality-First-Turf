"use client";

import { type ReactNode, useEffect, useState } from "react";

/** How long a section takes to open or close. The same number is in the .collapse rules in globals.css. */
const DURATION_MS = 700;

/**
 * Opens and closes a section with a slide instead of letting it pop in and out. Wrap the section's own element in it and pass
 * whether it should be open. A closing section stays on the page until the slide ends, then goes (or, with `lazy={false}`, stays
 * mounted but hidden and unreachable by keyboard, so whatever is inside keeps its own state).
 */
export function Collapse({ open, lazy = true, children }: { open: boolean; lazy?: boolean; children: ReactNode }) {
  const [present, setPresent] = useState(open); // the section is on the page
  const [ready, setReady] = useState(open); // it has been painted closed once, so it can slide open
  const [fullyOpen, setFullyOpen] = useState(open); // the slide has finished, so nothing inside needs clipping any more
  if (open && !present) setPresent(true);

  useEffect(() => {
    if (open) {
      // Two frames: the closed state has to be painted once, or the browser has nothing to slide from.
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setReady(true));
      });
      const done = setTimeout(() => setFullyOpen(true), DURATION_MS + 50);
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
        clearTimeout(done);
      };
    }
    const gone = setTimeout(() => {
      setPresent(false);
      setReady(false);
      setFullyOpen(false);
    }, DURATION_MS);
    return () => clearTimeout(gone);
  }, [open]);

  const shown = open && ready;
  const settled = open && fullyOpen;

  if (lazy && !present) return null;
  return (
    <div className={`collapse${shown ? " is-open" : ""}${settled ? " is-settled" : ""}`} inert={!open}>
      <div className="collapse__inner">{children}</div>
    </div>
  );
}
