import { flushSync } from "react-dom";
import type { DiscoveryStep } from "@/lib/discovery-draft";

const discoveryOrder: DiscoveryStep[] = ["property", "services", "details", "confirmation"];

let active: { skipTransition: () => void } | null = null;

export function scrollToStart() {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  root.style.scrollBehavior = previous;
}

export function transitionStep(
  from: string,
  to: string,
  update: () => void,
  order: readonly string[] = discoveryOrder,
) {
  if (from === to || typeof document === "undefined" || typeof document.startViewTransition !== "function") {
    update();
    return;
  }
  const direction = order.indexOf(to) >= order.indexOf(from) ? "forward" : "back";
  document.documentElement.dataset.stepDir = direction;
  active?.skipTransition();
  const transition = document.startViewTransition(() => {
    flushSync(update);
  });
  active = transition;
  transition.finished.finally(() => {
    if (active === transition) active = null;
  });
}
