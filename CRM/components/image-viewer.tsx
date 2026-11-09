"use client";

/* A photo viewer for a quote (D-056): click a photo on the quote and it opens large over the page. Arrow keys or the side buttons move
   between the quote's photos, Escape or the background closes it, and "Open in new tab" shows the original file on its own. */

import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon } from "./icon";

export type ViewerImage = { url: string; caption: string };

const EXIT_MS = 160; // keep in step with viewer-out in globals.css

export function ImageViewer({ images, start, onClose }: { images: ViewerImage[]; start: number; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const [leaving, setLeaving] = useState(false);
  const many = images.length > 1;
  const current = images[index];

  const close = () => setLeaving(true);
  const go = (step: number) => setIndex((i) => (i + step + images.length) % images.length);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLeaving(true);
      else if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + images.length) % images.length);
      else if (e.key === "ArrowRight") setIndex((i) => (i + 1) % images.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [images.length]);

  return (
    <div className={`viewer-back${leaving ? " leaving" : ""}`} role="dialog" aria-modal="true" aria-label={current.caption || "Photo"} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="viewer-bar">
        <span className="viewer-caption">{current.caption}{many && <span className="muted"> · {index + 1} of {images.length}</span>}</span>
        <a className="viewer-btn" href={current.url} target="_blank" rel="noreferrer">
          <Icon name="export" size={20} /> <span className="lbl">Open in new tab</span>
        </a>
        <button type="button" className="viewer-btn icon" aria-label="Close" onClick={close}><Icon name="x" size={24} /></button>
      </div>
      {many && (
        <button type="button" className="viewer-nav prev" aria-label="Previous photo" onClick={() => go(-1)}><Icon name="chevleft" size={28} /></button>
      )}
      <div className="viewer-stage" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
        {/* A signed storage address, so Next's image optimiser is not used. */}
        <Image key={current.url} src={current.url} alt={current.caption} width={1600} height={1200} unoptimized />
      </div>
      {many && (
        <button type="button" className="viewer-nav next" aria-label="Next photo" onClick={() => go(1)}><Icon name="chevright" size={28} /></button>
      )}
    </div>
  );
}
