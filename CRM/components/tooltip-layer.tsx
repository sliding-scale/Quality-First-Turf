"use client";

/* Tooltips, drawn the way Jobber draws them: a dark bubble with a small arrow that floats over the page, a quarter of a second after the
   pointer rests on a control (at once for keyboard focus). Any element with data-tip="words" gets one. One bubble lives on the body, so no
   table, scroll box or dialog can clip it, it flips below when there is no room above, and it also works on a disabled button (which
   gets no events of its own). On a touch screen a tap on a disabled control shows why it is disabled. */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const SHOW_MS = 250;
const TOUCH_MS = 2800;
const GAP = 10; // bubble to control, including the arrow

const find = (t: EventTarget | null) => {
  const el = t instanceof Element ? t.closest<HTMLElement>("[data-tip]") : null;
  // The New request flow draws its own tip (intake.css).
  return el && el.dataset.tip && !el.closest(".nrf") ? el : null;
};
/** The disabled control under a point, found by its box: it takes no events and often has pointer-events off. */
const offAt = (x: number, y: number) =>
  [...document.querySelectorAll<HTMLElement>('[data-tip]:disabled, [data-tip][aria-disabled="true"]')].find((el) => {
    const r = el.getBoundingClientRect();
    return !el.closest(".nrf") && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }) ?? null;

export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; anchor: HTMLElement } | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let want: HTMLElement | null = null;
    const hide = () => { window.clearTimeout(timer); want = null; setTip(null); };
    const show = (el: HTMLElement, delay: number, stay = 0) => {
      window.clearTimeout(timer);
      want = el;
      timer = window.setTimeout(() => {
        if (!el.isConnected) return;
        setTip({ text: el.dataset.tip!, anchor: el });
        if (stay) timer = window.setTimeout(hide, stay);
      }, delay);
    };
    // A disabled button gets no events of its own, so the pointer's position is looked up instead of trusting the event's target.
    let frame = 0;
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch" || frame) return;
      const { clientX: x, clientY: y, target } = e;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = find(target) ?? offAt(x, y);
        if (el === want) return;
        hide();
        if (el) show(el, SHOW_MS);
      });
    };
    const down = (e: PointerEvent) => {
      hide();
      if (e.pointerType !== "touch") return;
      // A disabled control takes no events, so look at what is under the finger by position instead.
      const el = offAt(e.clientX, e.clientY);
      if (el) show(el, 0, TOUCH_MS);
    };
    const focus = (e: FocusEvent) => {
      const el = find(e.target);
      if (el && (e.target as HTMLElement).matches(":focus-visible")) show(el, 0);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    const gone = () => hide();
    document.addEventListener("pointermove", over);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", gone);
    document.addEventListener("keydown", key);
    document.addEventListener("scroll", gone, true);
    window.addEventListener("resize", gone);
    document.documentElement.addEventListener("mouseleave", gone);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointermove", over);
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", gone);
      document.removeEventListener("keydown", key);
      document.removeEventListener("scroll", gone, true);
      window.removeEventListener("resize", gone);
      document.documentElement.removeEventListener("mouseleave", gone);
    };
  }, []);

  return tip ? createPortal(<Bubble key={tip.text} text={tip.text} anchor={tip.anchor} />, document.body) : null;
}

function Bubble({ text, anchor }: { text: string; anchor: HTMLElement }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const b = box.current;
    if (!b) return;
    const r = anchor.getBoundingClientRect();
    const w = b.offsetWidth;
    const h = b.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const centre = r.left + r.width / 2;
    const left = Math.max(8, Math.min(centre - w / 2, vw - w - 8));
    const below = r.top - h - GAP < 8 && window.innerHeight - r.bottom > h + GAP;
    b.style.left = `${left}px`;
    b.style.top = `${below ? r.bottom + GAP : r.top - h - GAP}px`;
    b.style.setProperty("--ax", `${Math.max(12, Math.min(centre - left, w - 12))}px`);
    b.dataset.side = below ? "below" : "above";
  }, [anchor, text]);
  // The control says what it is described by, so a screen reader reads the words with it.
  useEffect(() => {
    const id = "qf-tooltip";
    const was = anchor.getAttribute("aria-describedby");
    anchor.setAttribute("aria-describedby", was ? `${was} ${id}` : id);
    return () => { if (was) anchor.setAttribute("aria-describedby", was); else anchor.removeAttribute("aria-describedby"); };
  }, [anchor]);
  return <div ref={box} id="qf-tooltip" className="tooltip" role="tooltip">{text}</div>;
}
