"use client";

/* The confirm pop-up for deleting a quote (D-056), in the same style as deleting clients and team members: it lists what goes with the
   quote and Delete stays off until every item is ticked. The server deletes the quote, its lines, its notes and their stored files
   (convex/crm/quotes.ts, `remove`), for good. */

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Checkbox } from "./checkbox";
import { Icon } from "./icon";

const EXIT_MS = 160; // keep in step with modal-out in globals.css

export function DeleteQuoteDialog({ id, number, title, onClose, onDeleted }: { id: Id<"quotes">; number: number; title: string; onClose: () => void; onDeleted: () => void }) {
  const remove = useMutation(api.crm.quotes.remove);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = () => setLeaving(true);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setLeaving(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy]);

  const items = [
    { key: "quote", label: "The quote and all of its line items are deleted" },
    { key: "files", label: "Its notes, photos and attached files (such as the signed copy) are deleted" },
  ];
  const allTicked = items.every((i) => ticked.has(i.key));

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await remove({ id });
      onDeleted();
    } catch (e) {
      setError(e instanceof ConvexError && typeof e.data === "string" ? e.data : "Could not delete the quote. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className={`modal-back${leaving ? " leaving" : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Delete quote #${number}`}>
        <div className="modal-head">
          <h2>Delete quote #{number}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close} disabled={busy}><Icon name="x" size={22} /></button>
        </div>
        <p className="modal-lead">{title}. This will:</p>
        <div className="modal-list">
          {items.map((i) => (
            <label key={i.key} className="modal-item">
              <Checkbox
                state={ticked.has(i.key)}
                label={i.label}
                onChange={() => setTicked((s) => { const n = new Set(s); if (!n.delete(i.key)) n.add(i.key); return n; })}
              />
              <span>{i.label}</span>
            </label>
          ))}
        </div>
        <p className="modal-note">Tick each one to confirm. This cannot be undone.</p>
        {error && <p className="modal-error" role="alert">{error}</p>}
        <div className="modal-foot">
          <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
          <button type="button" className="btn danger" disabled={!allTicked || busy} onClick={() => void submit()}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
