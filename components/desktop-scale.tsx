"use client";

import { ReactNode, useLayoutEffect, useRef } from "react";

/** Desktop layouts are designed at this width. */
const designWidth = 1280;
/** Below this the window is treated as a phone-sized layout and is not scaled. */
const minScaledWidth = 640;

/**
 * Browser zoom shrinks the CSS viewport, which would flip a desktop window into
 * the tablet or phone layout. On mouse-driven devices the whole page is instead
 * laid out at the design width and scaled to the window, so every zoom level
 * shows the same layout. Touch devices keep the normal responsive layout.
 *
 * `--app-h` is the viewport height in the scaled coordinate space; use it
 * wherever `100dvh` would be wrong inside the scaled page.
 */
export function DesktopScale({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const pointer = window.matchMedia("(pointer: fine)");

    const apply = () => {
      const width = root.clientWidth;
      const scale =
        pointer.matches && width >= minScaledWidth && width < designWidth ? width / designWidth : 1;
      if (scale === 1) {
        element.style.removeProperty("zoom");
        root.style.removeProperty("--app-h");
        return;
      }
      element.style.zoom = String(scale);
      root.style.setProperty("--app-h", `${window.innerHeight / scale}px`);
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(root);
    window.addEventListener("resize", apply);
    pointer.addEventListener("change", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
      pointer.removeEventListener("change", apply);
    };
  }, []);

  return <div ref={ref}>{children}</div>;
}
