"use client";

/* Settings → Disclaimers (D-075): the business's library of saved disclaimers that a quote can attach (the quote builder's Contract /
   Disclaimer section lists them with tick boxes). Admins and the Office team add, change and delete them; the starter wording is added
   the first time this opens. A quote keeps a copy of what it attached, so nothing here changes a quote that was already made. */

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MAX_TEXT, MAX_TITLE, checkDisclaimer } from "@/convex/crm/lib/disclaimers";
import { useWorkspace } from "@/lib/clients";
import { clock, failure } from "@/lib/pipeline";
import { PipelineModal } from "./pipeline-dialogs";
import { DisclaimersSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Item = { id: Id<"disclaimers">; title: string; text: string; updatedAt: number; updatedByName: string };

const when = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function DisclaimersPage() {
  const staff = useStaff();
  const ws = useWorkspace();
  const businessId = ws.state === "ready" ? ws.business._id : undefined;
  const library = useQuery(api.crm.disclaimers.list, businessId ? { businessId } : "skip");
  const seed = useMutation(api.crm.disclaimers.ensureDefaults);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const seeding = useRef(false);
  const canManage = staff.isAdmin || staff.roles.includes("office");

  // The starter disclaimers are added once, the first time someone who can change them opens this.
  useEffect(() => {
    if (!businessId || !library || library.seeded || !canManage || seeding.current) return;
    seeding.current = true;
    void seed({ businessId, now: Date.now() }).catch(() => { seeding.current = false; });
  }, [businessId, library, canManage, seed]);

  if (!canManage) {
    return (
      <div className="empty-state">
        <h2>Only Admins and the Office team can manage disclaimers</h2>
        <p>You can still attach saved disclaimers to a quote from its Contract / Disclaimer section.</p>
        <Link className="btn primary" href="/home">Back to home</Link>
      </div>
    );
  }
  if (ws.state === "loading" || !businessId || library === undefined) return <DisclaimersSkeleton />;

  return (
    <div className="fade-in dc">
      <div className="page-head">
        <h1>Disclaimers</h1>
        <button type="button" className="btn primary" onClick={() => setEditing("new")}>New Disclaimer</button>
      </div>
      <p className="au-lead">Saved wording a quote can attach, such as payment terms, warranty or site conditions. On a quote, open Contract / Disclaimer and tick the ones to include. The contract text box there stays for anything typed by hand. A quote keeps a copy of what it attached, so changing one here does not change quotes already made.</p>

      {library.items.length === 0 ? (
        <div className="card dc-empty">{library.seeded ? "There are no disclaimers yet. Add the first one." : "Adding the starter disclaimers…"}</div>
      ) : (
        <ul className="dc-list">
          {library.items.map((d) => (
            <li key={d.id} className="card dc-item">
              <div className="dc-body">
                <h3>{d.title}</h3>
                <p>{d.text}</p>
                <small>Updated {when(d.updatedAt)} by {d.updatedByName}</small>
              </div>
              <div className="dc-actions">
                <button type="button" className="btn" onClick={() => setEditing(d)}>Edit</button>
                <button type="button" className="btn danger" onClick={() => setDeleting(d)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <DisclaimerForm businessId={businessId} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteDisclaimer item={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function DisclaimerForm({ businessId, item, onClose }: { businessId: Id<"businesses">; item: Item | null; onClose: () => void }) {
  const { toast } = useUI();
  const save = useMutation(api.crm.disclaimers.save);
  const [title, setTitle] = useState(item?.title ?? "");
  const [text, setText] = useState(item?.text ?? "");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const problem = checkDisclaimer({ title, text });
  const badTitle = tried && !title.trim();
  const badText = tried && !text.trim();

  async function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    setTried(true);
    if (problem) {
      document.getElementById(!title.trim() ? "dc-title" : "dc-text")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save({ businessId, ...(item ? { id: item.id } : {}), title, text, now: clock() });
      toast(item ? "Disclaimer saved." : "Disclaimer added.");
      close();
    } catch (err) {
      setError(failure(err, "That could not be saved. Try again."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title={item ? "Edit disclaimer" : "New disclaimer"} onClose={onClose} busy={busy} className="au-modal">
      {(close) => (
        <form onSubmit={(e) => void submit(e, close)} noValidate>
          <div className={`field${badTitle ? " bad" : ""}`}>
            <label htmlFor="dc-title">Title</label>
            <input id="dc-title" aria-invalid={badTitle} maxLength={MAX_TITLE} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <span className="err">Give the disclaimer a title.</span>
          </div>
          <div className={`field${badText ? " bad" : ""}`}>
            <label htmlFor="dc-text">Wording</label>
            <textarea id="dc-text" aria-invalid={badText} rows={9} maxLength={MAX_TEXT} value={text} onChange={(e) => setText(e.target.value)} />
            <span className="err">Write the disclaimer&apos;s wording.</span>
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      )}
    </PipelineModal>
  );
}

function DeleteDisclaimer({ item, onClose }: { item: Item; onClose: () => void }) {
  const { toast } = useUI();
  const remove = useMutation(api.crm.disclaimers.remove);
  const [busy, setBusy] = useState(false);
  return (
    <PipelineModal title="Delete this disclaimer?" onClose={onClose} busy={busy}>
      {(close) => (
        <div>
          <p className="modal-note">&ldquo;{item.title}&rdquo; is removed from the library. Quotes that already attached it keep their copy. This cannot be undone.</p>
          <div className="modal-foot">
            <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                remove({ id: item.id }).then(() => { toast("Disclaimer deleted."); close(); }).catch((e) => { toast(failure(e, "That could not be deleted.")); setBusy(false); });
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </PipelineModal>
  );
}
