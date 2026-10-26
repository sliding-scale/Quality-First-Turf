"use client";

import { ReactNode, useLayoutEffect, useRef } from "react";

const desktopQuery = "(any-hover: hover) and (any-pointer: fine)";

/**
 * Keeps the desktop confirmation composition on one screen.
 * Browser zoom shrinks the CSS viewport, so the sheet is laid out at the
 * spacious size and scaled to the window. Phones keep the stacked layout.
 */
export function ViewportFit({
  children,
  className,
  minLayoutWidth,
  minViewportWidth = 640,
}: {
  children: ReactNode;
  className: string;
  minLayoutWidth: number;
  minViewportWidth?: number;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const sheet = sheetRef.current;
    if (!frame || !sheet) return;

    let fitting = false;

    const fit = () => {
      if (fitting) return;
      fitting = true;
      const desktop =
        window.matchMedia(desktopQuery).matches && window.innerWidth >= minViewportWidth;
      if (!desktop) {
        sheet.style.width = "";
        sheet.style.transform = "";
        fitting = false;
        return;
      }

      const availableW = frame.clientWidth;
      const availableH = frame.clientHeight;
      if (availableW < 1 || availableH < 1) {
        fitting = false;
        return;
      }

      sheet.style.transform = "none";
      sheet.style.width = `${Math.max(availableW, minLayoutWidth)}px`;
      let naturalH = sheet.scrollHeight;
      if (naturalH < 1) {
        fitting = false;
        return;
      }

      let scale = Math.min(1, (availableH - 1) / naturalH);
      sheet.style.width = `${Math.round(availableW / scale)}px`;
      naturalH = sheet.scrollHeight;
      scale = Math.min(1, (availableH - 1) / naturalH);
      const nextWidth = `${Math.round(availableW / scale)}px`;
      const nextTransform = scale > 0.999 ? "none" : `scale(${scale.toFixed(4)})`;
      if (sheet.style.width !== nextWidth) sheet.style.width = nextWidth;
      sheet.style.transformOrigin = "top left";
      if (sheet.style.transform !== nextTransform) sheet.style.transform = nextTransform;
      fitting = false;
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    observer.observe(sheet);
    window.addEventListener("resize", fit);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", fit);
    document.fonts?.ready.then(fit).catch(() => undefined);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      viewport?.removeEventListener("resize", fit);
    };
  }, [minLayoutWidth, minViewportWidth]);

  return (
    <div className={className} ref={frameRef}>
      <div className={`${className}__sheet`} ref={sheetRef}>
        {children}
      </div>
    </div>
  );
}

export function ConfirmationFit({ children }: { children: ReactNode }) {
  return (
    <ViewportFit className="confirmation-fit" minLayoutWidth={1280} minViewportWidth={640}>
      {children}
    </ViewportFit>
  );
}
