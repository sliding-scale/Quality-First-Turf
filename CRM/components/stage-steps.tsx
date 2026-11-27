"use client";

/* Where a project is in its pipeline, at the top of the project page (D-135): the stages in order on one line, each a numbered dot joined to
   the next, ticked once passed, with its name under it. It only shows the stage; moving one is done on the board. On a narrow screen the line
   slides sideways on its own and opens on the current stage. */

import { useEffect, useRef } from "react";
import { Icon } from "./icon";

const LOST = "Closed Lost";
const WON = "Closed Won";

export function StageSteps({ stages, stage, label }: { stages: readonly string[]; stage: string; label: string }) {
  // Won and Lost are the two ways Sales ends, not one step after the other, so only the one that applies is on the line.
  const lost = stage === LOST;
  const shown = stages.filter((s) => (lost ? s !== WON : s !== LOST));
  const at = shown.indexOf(stage);
  const line = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const box = line.current;
    const now = box?.querySelector<HTMLElement>("[aria-current='step']");
    if (box && now) box.scrollLeft = now.offsetLeft - (box.clientWidth - now.offsetWidth) / 2;
  }, [stage]);

  return (
    <ol className="op-steps" aria-label={label} ref={line}>
      {shown.map((s, i) => {
        // A lost project does not say how far it got, so nothing before it is ticked.
        const state = i === at ? (lost ? "now lost" : "now") : i < at && !lost ? "done" : "next";
        return (
          <li key={s} className={state} aria-current={i === at ? "step" : undefined}>
            <span className="op-dot" aria-hidden="true">{state === "done" ? <Icon name="check" size={16} /> : state === "now lost" ? <Icon name="x" size={16} /> : i + 1}</span>
            <span className="op-steplabel">{s}{state === "done" && <span className="sr"> (done)</span>}</span>
          </li>
        );
      })}
    </ol>
  );
}
