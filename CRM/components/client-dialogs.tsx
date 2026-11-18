"use client";

/* The two pop-ups on a client's row in the Clients list (like Jobber's): Edit tags, and Send email. Plus the tag picker both the
   tag filter and the Edit tags pop-up use. */

import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CLIENT_TAGS } from "@/convex/crm/lib/stages";
import { failure } from "@/lib/pipeline";
import { Checkbox } from "./checkbox";
import { Icon } from "./icon";
import { useUI } from "./ui-provider";

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

/** Jobber's Send email pop-up, and it sends (D-077): the message goes to the client from the office mailbox through Zoho, with a copy to the
 *  person sending it when asked, and files attached (up to 19 MB in all, as in Jobber). */
const MAX_ATTACH_BYTES = 19 * 1024 * 1024;
const MAX_ATTACH_FILES = 10;
const mb = (n: number) => (n / 1024 / 1024).toFixed(2);

export function SendEmailDialog({ client, onClose, preset }: { client: { id: Id<"clients">; name: string; email: string }; onClose: () => void; preset?: { subject: string; body: string } }) {
  const { toast } = useUI();
  const send = useAction(api.crm.clientEmail.send);
  const makeUrl = useMutation(api.crm.noteFiles.generateUploadUrl);
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [to, setTo] = useState(client.email ? [client.email] : []);
  const [subject, setSubject] = useState(preset?.subject ?? "");
  const [body, setBody] = useState(preset?.body ?? "");
  const [copy, setCopy] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const missing = { to: to.length === 0, subject: !subject.trim(), body: !body.trim() };
  const attached = files.reduce((n, f) => n + f.size, 0);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    let total = attached;
    for (const f of Array.from(list)) {
      if (next.length >= MAX_ATTACH_FILES) { setError(`You can attach up to ${MAX_ATTACH_FILES} files.`); break; }
      if (total + f.size > MAX_ATTACH_BYTES) { setError(`${f.name} would go over the 19 MB limit, so it was not added.`); continue; }
      next.push(f);
      total += f.size;
      setError("");
    }
    setFiles(next);
    if (picker.current) picker.current.value = "";
  }

  async function submit(close: () => void) {
    setTried(true);
    if (missing.to || missing.subject || missing.body) return;
    setBusy(true);
    setError("");
    try {
      // Each file goes to storage first; the send checks them again, mails them and clears them out.
      const stored: { storageId: Id<"_storage">; name: string }[] = [];
      for (const f of files) {
        const url = await makeUrl({});
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": f.type || "application/octet-stream" }, body: f });
        if (!res.ok) throw new Error("A file could not be uploaded.");
        stored.push({ storageId: ((await res.json()) as { storageId: Id<"_storage"> }).storageId, name: f.name });
      }
      await send({ clientId: client.id, to, subject, body, copyMe: copy, ...(stored.length ? { attachments: stored } : {}) });
      toast(`Email sent to ${to.join(", ")}.`);
      close();
    } catch (e) {
      setError(failure(e, "The email could not be sent. Try again."));
      setBusy(false);
    }
  }

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
                    <button type="button" aria-label={`Remove ${a}`} disabled={busy} onClick={() => setTo(to.filter((x) => x !== a))}><Icon name="x" size={14} /></button>
                  </span>
                ))}
                {to.length === 0 && <span className="cd-hint" style={tried ? { color: "#b3261e" } : undefined}>{client.email ? "Add back the address to send to." : "This client has no email address. Add one on their page first."}</span>}
              </div>
              <input className="cd-input" placeholder="Subject" aria-label="Subject" aria-invalid={tried && missing.subject} maxLength={200} value={subject} disabled={busy} onChange={(e) => setSubject(e.target.value)} />
              <textarea className="cd-input cd-message" placeholder="Message" aria-label="Message" aria-invalid={tried && missing.body} value={body} disabled={busy} onChange={(e) => setBody(e.target.value)} />
              {tried && (missing.subject || missing.body) && <p className="modal-error" role="alert">{missing.subject ? "Write a subject." : "Write a message."}</p>}
              <label className="modal-item">
                <Checkbox state={copy} label="Send me a copy" onChange={() => setCopy((c) => !c)} />
                <span>Send me a copy</span>
              </label>
            </div>
            <div className="cd-mail-side">
              <b>Attachments</b>
              <div className="cd-drop">
                <input ref={picker} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
                <button type="button" className="btn small" disabled={busy} onClick={() => picker.current?.click()}>Select</button>
                <span>Select files to attach to the email</span>
              </div>
              {files.length > 0 && (
                <ul className="cd-files">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`}>
                      <span title={f.name}>{f.name}</span>
                      <small>{mb(f.size)} MB</small>
                      <button type="button" aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => setFiles(files.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
              <span className="cd-hint">You&apos;ve attached {mb(attached)} MB of the 19.00 MB limit.</span>
              <div className="cd-meter"><span style={{ width: `${Math.min(100, (attached / MAX_ATTACH_BYTES) * 100)}%` }} /></div>
            </div>
          </div>
          {error && <p className="modal-error" role="alert">{error}</p>}
          <div className="modal-foot">
            <button type="button" className="btn plain" onClick={close} disabled={busy}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy || to.length === 0} onClick={() => void submit(close)}>{busy ? "Sending…" : "Send Email"}</button>
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
