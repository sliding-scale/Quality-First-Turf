"use client";

/* New Request, laid out like Jobber's form: a title, the client, the date it was requested (today), the salesperson (the person making it,
   to start with), the service details and an internal note. Saving makes a project in the Sales pipeline at New Request, through
   crm/requests:create. Jobber's images, on-site assessment and line items are not here: the visit is booked from the Schedule and the
   price comes with the quote. Nothing is flagged red until Save is pressed (D-035). */

import Link from "next/link";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useWorkspace, type BusinessDoc } from "@/lib/clients";
import { quoteDate } from "@/lib/format";
import { useClientSearch } from "@/lib/quotes";
import { failure, usePeople } from "@/lib/requests";
import { EmptyBackend } from "./empty-backend";
import { Icon } from "./icon";
import { NewClientDialog } from "./new-client-dialog";
import { NoteEditor, useUploadPending, type PendingFile } from "./note-editor";
import { NewRequestSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

export function NewRequestPage() {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <NewRequestSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Form business={workspace.business} />;
}

function Form({ business }: { business: BusinessDoc }) {
  const router = useRouter();
  const { toast } = useUI();
  const staff = useStaff();
  const people = usePeople(business._id);
  const create = useMutation(api.crm.requests.create);

  const [title, setTitle] = useState("");
  const [client, setClient] = useState<{ id: Id<"clients">; name: string } | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [salesperson, setSalesperson] = useState<string | null>(null); // null until the person changes it: then the signed-in user
  const [details, setDetails] = useState("");
  const [note, setNote] = useState("");
  const [addingClient, setAddingClient] = useState(false);
  const [noteFiles, setNoteFiles] = useState<PendingFile[]>([]);
  const upload = useUploadPending();
  const [bad, setBad] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const found = useClientSearch(business._id, clientQuery);

  const dirty = !!(title || client || details || note || noteFiles.length);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!staff.canEdit) {
    return (
      <div className="empty-state">
        <h2>You can view requests, not make them</h2>
        <p>Your role does not allow changes.</p>
        <Link className="btn primary" href="/requests">Back to requests</Link>
      </div>
    );
  }

  const clear = (k: string) => setBad((b) => { const n = new Set(b); n.delete(k); return n; });
  const chosen = salesperson ?? (people?.some((p) => p.id === staff._id) ? staff._id : "");

  async function save() {
    const missing = new Set<string>();
    if (!title.trim()) missing.add("title");
    if (!client) missing.add("client");
    setBad(missing);
    if (missing.size) {
      document.getElementById(missing.has("title") ? "rf-title" : "rf-client")?.focus();
      return;
    }
    setBusy(true);
    try {
      const id = await create({
        businessId: business._id,
        clientId: client!.id,
        title,
        salespersonId: chosen ? (chosen as Id<"users">) : undefined,
        details,
        note,
        noteFiles: await upload(noteFiles),
      });
      toast("Request saved.");
      router.push(`/requests/${id}`);
    } catch (e) {
      toast(failure(e, "The request could not be saved."));
      setBusy(false);
    }
  }

  return (
    <div className="fade-in rf">
      <div className="page-head"><h1><Icon name="inbox" size={26} /> New Request</h1></div>

      <section className="qb-card qb-head">
        <div className={`field${bad.has("title") ? " bad" : ""}`}>
          <label htmlFor="rf-title">Title</label>
          <input id="rf-title" aria-invalid={bad.has("title")} maxLength={200} value={title} onChange={(e) => { setTitle(e.target.value); clear("title"); }} />
          <span className="err">Give the request a title.</span>
        </div>
        <div className="qb-headgrid">
          <div className="qb-left">
            <div className={`field${bad.has("client") ? " bad" : ""}`}>
              <label htmlFor="rf-client">Client</label>
              {client ? (
                <div className="sc-picked">
                  <span>{client.name}</span>
                  <button type="button" className="icon-btn" aria-label="Choose a different client" onClick={() => setClient(null)}><Icon name="x" size={18} /></button>
                </div>
              ) : (
                <>
                  <input id="rf-client" aria-invalid={bad.has("client")} placeholder="Select a client" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} autoComplete="off" />
                  {clientQuery.trim() && found && (
                    <div className="sc-results" role="listbox">
                      {found.rows.length === 0 && <div className="menu-empty">No clients match</div>}
                      {found.rows.map((c) => (
                        <button key={c._id} type="button" role="option" aria-selected={false} onClick={() => { setClient({ id: c._id, name: c.name }); setClientQuery(""); clear("client"); }}>
                          <b>{c.name}</b> <span>{[c.street1, c.city].filter(Boolean).join(", ")}</span>
                        </button>
                      ))}
                      <button type="button" className="sc-newclient" onClick={() => setAddingClient(true)}><Icon name="plus" size={16} /> New client{clientQuery.trim() ? ` "${clientQuery.trim()}"` : ""}</button>
                    </div>
                  )}
                  {!(clientQuery.trim() && found) && <button type="button" className="btn link sc-newclient-link" onClick={() => setAddingClient(true)}><Icon name="plus" size={16} /> New client</button>}
                  <span className="err">Pick the client this request is for.</span>
                </>
              )}
            </div>
          </div>
          <dl className="qb-meta">
            <div><dt>Requested on</dt><dd>{quoteDate(Date.now())}</dd></div>
            <div>
              <dt>Salesperson</dt>
              <dd>
                <div className="field">
                  <select aria-label="Salesperson" value={chosen} disabled={people === undefined} onChange={(e) => setSalesperson(e.target.value)}>
                    <option value="">Unassigned</option>
                    {people?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="qb-card">
        <h2>Overview</h2>
        <div className="field">
          <label htmlFor="rf-details">Service details</label>
          <NoteEditor id="rf-details" noFiles rows={7} placeholder="Please provide as much information as you can" value={details} onChange={setDetails} files={[]} onFiles={() => undefined} />
        </div>
      </section>

      <section className="qb-card">
        <h2>Notes</h2>
        <div className="field">
          <label htmlFor="rf-note">Internal note</label>
          <NoteEditor id="rf-note" rows={7} value={note} onChange={setNote} files={noteFiles} onFiles={setNoteFiles} />
        </div>
      </section>

      <div className="qb-bar">
        <button type="button" className="btn" disabled={busy} onClick={() => router.push("/requests")}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>Save Request</button>
      </div>
      {addingClient && (
        <NewClientDialog
          businessId={business._id}
          typed={clientQuery}
          onClose={() => setAddingClient(false)}
          onCreated={(c) => { setClient(c); setClientQuery(""); clear("client"); toast("Client saved."); }}
        />
      )}
    </div>
  );
}
