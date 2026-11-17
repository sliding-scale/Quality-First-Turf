import { flushSync } from "react-dom";

/* The New Request flow's step change (D-086): the same slide as the customer form (forms/lib/step-transition.ts), done with the browser's
   View Transitions. The direction is on <html> while it runs, and removed after, so no other part of the CRM sees it. The keyframes are in
   app/intake-flow.css. Browsers without View Transitions change step at once. */

let active: { skipTransition: () => void } | null = null;

export function transitionStep(from: string, to: string, update: () => void, order: readonly string[]) {
  if (from === to || typeof document === "undefined" || typeof document.startViewTransition !== "function") {
    update();
    return;
  }
  document.documentElement.dataset.stepDir = order.indexOf(to) >= order.indexOf(from) ? "forward" : "back";
  active?.skipTransition();
  const transition = document.startViewTransition(() => {
    flushSync(update);
  });
  active = transition;
  transition.finished.finally(() => {
    if (active === transition) {
      active = null;
      delete document.documentElement.dataset.stepDir;
    }
  });
}
