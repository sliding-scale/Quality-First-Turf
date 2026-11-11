"use client";

/* The confirm pop-up for deleting clients (D-054), like Jobber's: it names the client, lists what goes with them, and Delete stays
   off until the person has ticked every item. The server deletes exactly what it counted (convex/crm/clients.ts, `remove`). */

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Checkbox } from "./checkbox";
import { Icon } from "./icon";
import { Sk } from "./skeletons";

const EXIT_MS = 160; // keep in step with modal-out in globals.css

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function DeleteClientsDialog({ ids, onClose, onDeleted }: { ids: Id<"clients">[]; onClose: () => void; onDeleted: (count: number) => void }) {
  const preview = useQuery(api.crm.clients.deletePreview, { ids });
  const remove = useMutation(api.crm.clients.remove);
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

  const items = preview
    ? [
        preview.projects > 0 ? { key: "projects", label: plural(preview.projects, "project") } : null,
        preview.quotes > 0 ? { key: "quotes", label: plural(preview.quotes, "quote") } : null,
        preview.notes > 0 ? { key: "notes", label: plural(preview.notes, "note") } : null,
        preview.emails > 500 ? { key: "emails", label: "more than 500 saved emails" } : preview.emails > 0 ? { key: "emails", label: plural(preview.emails, "saved email") } : null,
      ].filter((x): x is { key: string; label: string } => x !== null)
    : [];
  const allTicked = items.every((i) => ticked.has(i.key));
  const title = preview ? (preview.names.length === 1 ? `Delete ${preview.names[0]}` : `Delete ${plural(preview.names.length, "client")}`) : "Delete";

  async function submit() {
    setBusy(true);
    setError("");
    try {
      onDeleted(await remove({ ids }));
      setLeaving(true);
    } catch (e) {
      setError(e instanceof ConvexError && typeof e.data === "string" ? e.data : "Could not delete. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className={`modal-back${leaving ? " leaving" : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} aria-busy={preview === undefined}>
        <div className="modal-head">
          {preview ? <h2>{title}</h2> : <Sk w="60%" h={26} />}
          <button type="button" className="icon-btn" aria-label="Close" onClick={close} disabled={busy}><Icon name="x" size={22} /></button>
        </div>

        {preview === undefined ? (
          <div style={{ marginTop: 22 }}>
            <Sk w="40%" h={16} />
            <Sk w="55%" h={20} style={{ marginTop: 18 }} />
            <Sk w="35%" h={20} style={{ marginTop: 16 }} />
          </div>
        ) : (
          <>
            {items.length > 0 ? (
              <>
                <p className="modal-lead">This will also delete:</p>
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
              </>
            ) : (
              <p className="modal-lead">Nothing else is attached. This cannot be undone.</p>
            )}
            {error && <p className="modal-error" role="alert">{error}</p>}
            <div className="modal-foot">
              <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
              <button type="button" className="btn danger" disabled={!allTicked || busy} onClick={() => void submit()}>
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
