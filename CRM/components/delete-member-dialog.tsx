"use client";

/* The confirm pop-up for deleting a team member (D-055, D-057), in the same style as deleting clients (D-054): it lists what happens and
   Delete stays off until every item is ticked. The backend does the work in Clerk first, then here, so the two stay in step
   (convex/crm/invitations.ts, `deleteMember`). The person is marked deleted, not erased: the row stays and they can be restored. */

import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Checkbox } from "./checkbox";
import { Icon } from "./icon";

const EXIT_MS = 160; // keep in step with modal-out in globals.css

export function DeleteMemberDialog({ user, onClose, onDeleted }: { user: Doc<"users">; onClose: () => void; onDeleted: (name: string) => void }) {
  const remove = useAction(api.crm.invitations.deleteMember);
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
    { key: "access", label: "They lose all access to the CRM and are marked Deleted on the team list" },
    user.tokenIdentifier
      ? { key: "login", label: "Their login is deleted in Clerk, so they can no longer sign in" }
      : { key: "login", label: "Any login they have in Clerk is deleted too" },
    ...(user.status === "invited" ? [{ key: "invite", label: "Their invitation link stops working" }] : []),
  ];
  const allTicked = items.every((i) => ticked.has(i.key));

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await remove({ id: user._id });
      onDeleted(user.name);
      setLeaving(true);
    } catch (e) {
      setError(e instanceof ConvexError && typeof e.data === "string" ? e.data : "Could not delete them. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className={`modal-back${leaving ? " leaving" : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Delete ${user.name}`}>
        <div className="modal-head">
          <h2>Delete {user.name}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close} disabled={busy}><Icon name="x" size={22} /></button>
        </div>
        <p className="modal-lead">This will:</p>
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
        <p className="modal-note">Tick each one to confirm. Their record is kept, and you can restore them later by sending a new invitation. To stop them logging in without deleting their login, use Turn off access instead.</p>
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
