"use client";

/* A box to sign in with a finger, a pen or a mouse (D-063). Used by the client's quote page and by "Collect Signature" in the CRM. The
   page does not scroll while a finger is drawing in it. `onChange` gets the picture as a PNG, or null when the box is empty. */

import { useCallback, useEffect, useRef, useState } from "react";

export function SignaturePad({ onChange, label = "Sign here" }: { onChange: (png: Blob | null) => void; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  const reset = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#032b3a";
  }, []);

  useEffect(() => {
    reset();
  }, [reset]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01); // a dot for a tap
    ctx.stroke();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setEmpty(false);
    e.currentTarget.toBlob((b) => onChange(b), "image/png");
  }
  function clear() {
    reset();
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="sigpad">
      <div className="sigpad-box">
        <canvas ref={canvas} aria-label={label} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
        {empty && <span className="sigpad-hint" aria-hidden="true">{label}</span>}
      </div>
      <button type="button" className="sigpad-clear" onClick={clear} disabled={empty}>Clear</button>
    </div>
  );
}
