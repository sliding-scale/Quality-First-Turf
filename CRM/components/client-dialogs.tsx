"use client";

/* The two pop-ups on a client's row in the Clients list (like Jobber's): Edit tags, and Send email. Plus the tag picker both the
   tag filter and the Edit tags pop-up use. */

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CLIENT_TAGS } from "@/convex/crm/lib/stages";
import { Checkbox } from "./checkbox";
import { Icon } from "./icon";

const EXIT_MS = 160; // keep in step with modal-out in globals.css

/** Search box, "N selected / Clear" line and the tag list with ticks. Used inside a menu (the filter) or under a button (the pop-up). */
export function TagPicker({ selected, onChange }: { selected: string[]; onChange: (tags: string[]) => void }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const q = query.trim().toLowerCase();
  const shown = CLIENT_TAGS.filter((t) => t.toLowerCase().includes(q));
  const toggle = (t: string) => onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);
  return (
    <>
      <input ref={input} className="menu-search" type="search" placeholder="Search tags" aria-label="Search tags" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="tagpick-count">
        <span>{selected.length} selected</span>
        <button type="button" className="linkbtn" onClick={() => onChange([])} disabled={selected.length === 0}>Clear</button>
      </div>
      <div className="menu-list tagpick-list" role="listbox" aria-label="Tags" aria-multiselectable="true">
        {shown.length ? (
          shown.map((t) => (
            <button key={t} type="button" role="option" aria-selected={selected.includes(t)} className="opt" onClick={() => toggle(t)}>
              <span>{t}</span>
              {selected.includes(t) && <Icon name="check" size={22} className="tick" />}
            </button>
          ))
        ) : (
          <div className="menu-empty">No matches</div>
        )}
      </div>
    </>
  );
}

/** Shared frame: the dark backdrop, the white box, the close button, the exit animation and Escape. */
function Modal({ title, wide, onClose, busy, children }: { title: string; wide?: boolean; onClose: () => void; busy?: boolean; children: (close: () => void) => React.ReactNode }) {
  const [leaving, setLeaving] = useState(false);
  const close = () => setLeaving(true);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onClose, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy && !document.querySelector(".tagpick-pop")) setLeaving(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy]);
  return (
    <div className={`modal-back${leaving ? " leaving" : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
      <div className="modal cd-modal" style={{ maxWidth: wide ? 800 : 490 }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close} disabled={busy}><Icon name="x" size={22} /></button>
        </div>
        {children(close)}
      </div>
    </div>
  );
}

export function EditTagsDialog({ client, onClose, onSaved }: { client: { _id: Id<"clients">; name: string; tags?: string[] }; onClose: () => void; onSaved: () => void }) {
  const setTags = useMutation(api.crm.clients.setTags);
  const [tags, setLocal] = useState<string[]>(client.tags ?? []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pop = useRef<HTMLDivElement>(null);

  // A click anywhere outside the open list closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (pop.current && !pop.current.contains(t) && !t.closest(".cd-select")) setOpen(false);
    };
    // Escape closes the list first, then (a second press) the pop-up.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTimeout(() => setOpen(false), 0);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <Modal title={`Edit tags for ${client.name}`} onClose={onClose} busy={busy}>
      {(close) => (
        <>
          <div className="cd-tags">
            <div className="cd-select-wrap">
              <button type="button" className="chip outline cd-select" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                Select tags <Icon name="plus" size={16} />
              </button>
              {open && (
                <div className="menu filter tagpick-pop" ref={pop}>
                  <TagPicker selected={tags} onChange={setLocal} />
                </div>
              )}
            </div>
            {tags.map((t) => (
              <span className="chip cd-chip" key={t}>
                {t}
                <button type="button" aria-label={`Remove ${t}`} onClick={() => setLocal(tags.filter((x) => x !== t))}><Icon name="x" size={14} /></button>
              </span>
            ))}
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await setTags({ id: client._id, tags });
                  onSaved();
                  close();
                } catch (e) {
                  setError(e instanceof ConvexError && typeof e.data === "string" ? e.data : "The tags could not be saved. Try again.");
                  setBusy(false);
                }
              }}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Jobber's Send email pop-up. Sending needs the email connection (Google Workspace, PRD 5.3), which is not built yet, so Send Email says so
 *  and keeps what was typed. */
export function SendEmailDialog({ client, onClose }: { client: { name: string; email: string }; onClose: () => void }) {
  const [to, setTo] = useState(client.email ? [client.email] : []);
  const [copy, setCopy] = useState(false);
  return (
    <Modal title={`Send email to ${client.name}`} wide onClose={onClose}>
      {(close) => (
        <>
          <div className="cd-mail">
            <div className="cd-mail-main">
              <div className="cd-to">
                <span className="cd-to-label">To</span>
                {to.map((a) => (
                  <span className="chip cd-chip" key={a}>
                    {a}
                    <button type="button" aria-label={`Remove ${a}`} onClick={() => setTo(to.filter((x) => x !== a))}><Icon name="x" size={14} /></button>
                  </span>
                ))}
              </div>
              <input className="cd-input" placeholder="Subject" aria-label="Subject" />
              <textarea className="cd-input cd-message" placeholder="Message" aria-label="Message" />
              <p className="cd-hint">Your client will see a button to view the schedule and location of their upcoming appointments in their Client Hub</p>
              <label className="modal-item">
                <Checkbox state={copy} label="Send me a copy" onChange={() => setCopy((c) => !c)} />
                <span>Send me a copy</span>
              </label>
            </div>
            <div className="cd-mail-side">
              <b>Attachments</b>
              <div className="cd-drop">
                <button type="button" className="btn small" disabled>Select</button>
                <span>Select or drag files here to upload</span>
              </div>
              <span className="cd-hint">You&apos;ve attached 0.00 MB of the 19.00 MB limit.</span>
              <div className="cd-meter"><span /></div>
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close}>Cancel</button>
            <button type="button" className="btn primary" disabled>Send Email</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** The tag filter's menu. A menu opened through `popover` is drawn once, so it keeps its own ticks and reports each change. */
export function TagFilter({ initial, onChange }: { initial: string[]; onChange: (tags: string[]) => void }) {
  const [selected, setSelected] = useState(initial);
  return <TagPicker selected={selected} onChange={(t) => { setSelected(t); onChange(t); }} />;
}
