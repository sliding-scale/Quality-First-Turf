"use client";

/* One quote (D-056, PRD 3.6), laid out like Jobber's quote page: status and title, the client and a table of facts, then the quote as the
   customer reads it (introduction, products and services with optional extras, deposit, signature), with Notes in the
   right-hand column. D-063 made it live: the pencils open the builder, Send makes the client's secret link, Collect Signature and Record
   deposit work, and the activity list shows every step. Converting to a job and sending email or text from the CRM stay greyed (Jobs, and
   the Zoho connection). Everything on the page comes from the backend; the totals are worked out there from the lines. On a phone the
   columns stack, as Jobber's do. */

import Image from "next/image";
import Link from "next/link";
import { useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useWorkspace } from "@/lib/clients";
import { convertBlockReason } from "@/lib/convert-reason";
import { clock, failure } from "@/lib/pipeline";
import { QUOTE_DOT, QUOTE_PILL, useQuote } from "@/lib/quotes";
import { moneyCents, quoteDate, quoteDateTime } from "@/lib/format";
import { useStoredString, writeItem } from "@/lib/store";
import type { Section } from "@/lib/quote-sections";
import { DeleteQuoteDialog } from "./delete-quote-dialog";
import { Icon } from "./icon";
import { ImageViewer, type ViewerImage } from "./image-viewer";
import { SendEmailDialog } from "./client-dialogs";
import { ActivityDialog, DepositDialog, SendDialog, SignDialog, SignatureWarningDialog } from "./quote-dialogs";
import { NoteEditor, useUploadPending, type PendingFile } from "./note-editor";
import { QuoteSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useConvertToJob } from "./use-convert-to-job";
import { useUI, type MenuItem } from "./ui-provider";
import { NoteBody } from "./note-view";

export function QuotePage({ id }: { id: string }) {
  const quote = useQuote(id);
  if (quote === undefined) return <QuoteSkeleton />;
  if (quote === null) {
    return (
      <div className="empty-state">
        <h2>Quote not found</h2>
        <p>This quote does not exist, or it was removed.</p>
        <Link className="btn primary" href="/quotes">Back to quotes</Link>
      </div>
    );
  }
  return <QuoteView q={quote} />;
}

type Quote = NonNullable<ReturnType<typeof useQuote>>;

/** "1" while the Notes column is folded away. Remembered in this browser. */
const SIDE_KEY = "qft-quote-notes-closed";

/** One note in the right-hand column, with Jobber's pencil: the words turn into a box with Cancel and Save. The file on it stays. */
function QuoteNote({ n, canEdit, editingId, setEditingId }: { n: Quote["notes"][number]; canEdit: boolean; editingId: string | null; setEditingId: (id: string | null) => void }) {
  const { toast } = useUI();
  const edit = useMutation(api.crm.quoteDraft.editNote);
  const toggleLine = useMutation(api.crm.quoteDraft.toggleNoteLine);
  // Only one note is edited at a time: while one is open, the pencils on the others are off.
  const editing = editingId === n.id;
  const setEditing = (on: boolean) => setEditingId(on ? n.id : null);
  const [text, setText] = useState(n.text);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await edit({ noteId: n.id as Id<"quoteNotes">, text });
      setEditing(false);
      toast("Note saved.");
    } catch (e) {
      toast(failure(e, "The note could not be saved."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="qn-item">
      <div className="qn-who">
        <span className="qn-avatar" aria-hidden="true">{n.author.slice(0, 1).toUpperCase()}</span>
        <div>
          <b>{n.author}</b>
          <div className="muted">{quoteDateTime(n.createdAt)}</div>
        </div>
        {canEdit && !editing && <button type="button" className="icon-btn qn-pencil" aria-label="Edit note" disabled={editingId !== null} title={editingId !== null ? "Save or cancel the note you are editing first" : undefined} onClick={() => { setText(n.text); setEditing(true); }}><Icon name="pencil" size={20} /></button>}
      </div>
      {editing ? (
        <>
          <NoteEditor noFiles rows={5} value={text} onChange={setText} files={[]} onFiles={() => undefined} disabled={busy} />
          <div className="qn-bar">
            <button type="button" className="btn" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy || (!text.trim() && !n.attachmentUrl && n.files.length === 0)} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </>
      ) : (
        <NoteBody text={n.text} files={n.files} canEdit={canEdit} onToggle={(line) => void toggleLine({ noteId: n.id as Id<"quoteNotes">, line }).catch((e) => toast(failure(e, "The checkbox could not be changed.")))} />
      )}
      {n.attachmentUrl && (
        <a className="qn-file" href={n.attachmentUrl} target="_blank" rel="noreferrer" title={n.attachmentName ?? "Attachment"}>
          <Icon name="file" size={24} />
          <span>{n.attachmentName ?? "Attachment"}</span>
        </a>
      )}
    </div>
  );
}

function QuoteView({ q }: { q: Quote }) {
  const router = useRouter();
  const convertToJob = useConvertToJob();
  const { dropdown, toast } = useUI();
  const { canEdit } = useStaff();
  const workspace = useWorkspace();
  const businessName = workspace.state === "ready" ? (workspace.businesses.find((b) => b._id === q.businessId)?.name ?? workspace.business.name) : "";
  const addNote = useMutation(api.crm.quoteDraft.addNote);
  const uploadPending = useUploadPending();
  const [note, setNote] = useState("");
  const [noteFiles, setNoteFiles] = useState<PendingFile[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const params = useSearchParams();
  const [dialog, setDialog] = useState<null | "send" | "email" | "sign" | "deposit" | "activity" | "note">(() => (params.get("link") === "1" && q.shareToken ? "send" : null));
  const send = useMutation(api.crm.quoteFlow.send);
  const duplicate = useMutation(api.crm.quoteDraft.duplicate);
  const archive = useMutation(api.crm.quoteDraft.archive);
  // Every section has its pencil, as in Jobber. A quote that was approved asks first (its signature is removed to edit it); a declined or
  // archived one cannot be edited.
  const needsReopen = q.status === "Approved" || q.status === "Converted";
  const pencils = canEdit && q.status !== "Rejected" && q.status !== "Archived";
  const [editFor, setEditFor] = useState<null | Section>(null);
  const [noteEditing, setNoteEditing] = useState<string | null>(null);
  const openEdit = (section: Section) => (needsReopen ? setEditFor(section) : router.push(`/quotes/${q.id}/edit?section=${section}`));
  const pencil = (section: Section, label: string) =>
    pencils ? (
      <button type="button" className="icon-btn" aria-label={label} title={needsReopen ? `${label} (removes the signature)` : label} onClick={() => openEdit(section)}><Icon name="pencil" size={24} /></button>
    ) : canEdit ? (
      <button type="button" className="icon-btn" aria-label={label} title="A declined or archived quote cannot be edited" disabled><Icon name="pencil" size={24} /></button>
    ) : null;
  const fail = (e: unknown, fallback: string) => toast(failure(e, fallback));
  async function sendNow(then: "send" | "email" = "send") {
    try {
      await send({ id: q.id, now: clock() });
      setDialog(then);
    } catch (e) {
      fail(e, "The quote could not be sent.");
    }
  }
  // The quote's photos, in the order they appear on the page; clicking one opens the viewer on it.
  const photos: ViewerImage[] = [
    ...(q.introImageUrl ? [{ url: q.introImageUrl, caption: q.introHeading || "Introduction" }] : []),
    ...q.lines.flatMap((l) => (l.imageUrl ? [{ url: l.imageUrl, caption: l.name }] : [])),
    ...q.lines.flatMap((l) => l.visitPhotos.map((p) => ({ url: p.url, caption: l.name }))),
  ];
  const [viewing, setViewing] = useState<number | null>(null);
  const photoIndex = (url: string | null) => (url ? photos.findIndex((p) => p.url === url) : -1);
  const sideOpen = useStoredString(SIDE_KEY, "0") !== "1";
  const c = q.client;
  const address = [c.street1, c.street2].filter(Boolean);
  const cityLine = [c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  useEffect(() => {
    document.title = `Quote #${q.number} · Quality First Turf CRM`;
  }, [q.number]);

  const facts: [string, React.ReactNode][] = [
    ["Quote #", q.number],
    ["Salesperson", q.salesperson || "—"],
    ["Created", quoteDate(q.createdAt)],
    ...(q.approvedAt ? ([["Approved", quoteDate(q.approvedAt)]] as [string, React.ReactNode][]) : []),
    ...(q.convertedAt ? ([["Converted", quoteDate(q.convertedAt)]] as [string, React.ReactNode][]) : []),
    ...(q.sentAt ? ([["Sent", quoteDate(q.sentAt)]] as [string, React.ReactNode][]) : []),
    ...(q.viewedAt ? ([["Viewed", quoteDate(q.viewedAt)]] as [string, React.ReactNode][]) : []),
    ...(q.totals.depositCents > 0 ? ([["Required Deposit", moneyCents(q.totals.depositCents)]] as [string, React.ReactNode][]) : []),
    ...(q.revision > 0 ? ([["Revision", q.revision]] as [string, React.ReactNode][]) : []),
    ...(q.request ? ([["From Request", <Link key="r" href={`/clients/${q.request.clientId}`}>{quoteDate(q.request.requestedAt)}</Link>]] as [string, React.ReactNode][]) : []),
  ];

  // Jobber's More menu. Sending email or text from the CRM stays greyed (the Zoho connection). A role that can
  // only look gets only the items that do not change anything.
  const later = (label: string, icon: string, extra: object = {}): MenuItem => ({ label, icon, disabled: true, ...extra });
  const rule: MenuItem = { divider: true };
  const canSign = canEdit && (q.status === "Draft" || q.status === "Awaiting response" || q.status === "Changes requested");
  const moreItems: MenuItem[] = [
    ...(canEdit
      ? [
          { label: "Convert to Job", icon: "hammer", iconColor: "var(--green)", onSelect: () => { const why = convertBlockReason(q.status, !!q.request); if (why) toast(why); else void convertToJob(q.request?.id as Id<"opportunities"> | undefined); } } as MenuItem,
          rule,
          { heading: "Send as..." } as MenuItem,
          { label: q.shareToken ? "Client link" : "Create the client link", icon: "newtab", onSelect: () => (q.shareToken ? setDialog("send") : void sendNow()), disabled: !(q.shareToken || q.status === "Draft") } as MenuItem,
          { label: "Email", icon: "mail", disabled: !q.client.email || !(q.shareToken || q.status === "Draft"), onSelect: () => (q.shareToken ? setDialog("email") : void sendNow("email")) } as MenuItem,
          later("Send Text", "sms"),
          rule,
        ]
      : []),
    q.shareToken && q.status !== "Archived"
      ? ({ label: "Preview as Client", icon: "eye", onSelect: () => window.open(`/q/${q.shareToken}?preview=1`, "_blank", "noopener") } as MenuItem)
      : later("Preview as Client", "eye"),
    ...(canEdit ? [{ label: "Collect Signature", icon: "signature", disabled: !canSign, onSelect: () => setDialog("sign") } as MenuItem] : []),
    ...(canEdit && q.status === "Approved" && q.totals.depositOutstandingCents > 0 ? [{ label: "Record deposit", icon: "dollar", onSelect: () => setDialog("deposit") } as MenuItem] : []),
    { label: "Print or Save PDF", icon: "pdf", onSelect: () => window.print() },
    ...(canEdit && q.status !== "Archived" && q.status !== "Converted" ? [{ label: "Archive", icon: "stage", onSelect: () => void archive({ id: q.id }).then(() => toast("The quote is archived.")).catch((e) => fail(e, "The quote could not be archived.")) } as MenuItem] : []),
    ...(canEdit ? [{ label: "Delete", icon: "trash", danger: true, onSelect: () => setDeleting(true) } as MenuItem] : []),
  ];
  const clientItems: MenuItem[] = [
    { label: "View client", onSelect: () => router.push(`/clients/${c.id}`) },
    ...(canEdit ? [{ label: "Edit client", onSelect: () => router.push(`/clients/${c.id}/edit`) } as MenuItem] : []),
  ];

  return (
    <div className="quote-shell fade-in">
      {/* The quote's colour runs across the very top, as in Jobber. The left side scrolls; Notes stay put on the right and can be folded away. */}
      <div className={`quote-scroll${sideOpen ? "" : " wide"}`}>
        <div className="quote-head">
          <div className="qh-row">
            <div className="who">
              <span className="quote-mark" aria-hidden="true"><Icon name="quote" size={22} /></span>
              <span className={`pill tag ${QUOTE_PILL[q.status]}`}><span className="dot" style={{ background: QUOTE_DOT[q.status] }} />{q.status}</span>
              <Link href="/quotes" className="btn link plain" style={{ marginLeft: 8 }}>
                <Icon name="chevleft" size={18} /> All quotes
              </Link>
            </div>
            <div className="qh-actions">
              <button type="button" className="icon-btn" aria-label="View activity" title="View activity" onClick={() => setDialog("activity")}>
                <Icon name="history" size={24} />
              </button>
              {canEdit && q.status === "Draft" && <button className="btn primary" type="button" onClick={() => void sendNow()}><Icon name="newtab" size={22} />Send</button>}
              {canEdit && q.status === "Changes requested" && <Link className="btn primary" href={`/quotes/${q.id}/edit`}><Icon name="pencil" size={22} />Edit and resubmit</Link>}
              {canEdit && q.status === "Awaiting response" && q.shareToken && <button className="btn primary" type="button" onClick={() => setDialog("send")}><Icon name="newtab" size={22} />Client link</button>}
              {canEdit && q.status === "Approved" && q.totals.depositOutstandingCents > 0 && <button className="btn primary" type="button" onClick={() => setDialog("deposit")}><Icon name="dollar" size={22} />Record deposit</button>}
              <button className="btn more-btn" type="button" aria-label="More" aria-haspopup="menu" onClick={(e) => dropdown(e.currentTarget, moreItems, { alignRight: true, variant: "actions" })}>
                <Icon name="more" size={24} /><span className="lbl">More</span>
              </button>
              {canEdit && (
                <button className="btn" type="button" onClick={() => void duplicate({ id: q.id }).then((id) => router.push(`/quotes/${id}/edit`)).catch((e) => fail(e, "The quote could not be copied."))}>
                  <Icon name="duplicate" size={24} />Create Similar Quote
                </button>
              )}
            </div>
          </div>
          <div className="quote-title-row">
            <h1>{q.title}</h1>
            {pencil("details", "Edit quote details")}
          </div>
          {q.status === "Changes requested" && (
            <div className="qp-banner warn" role="status"><b>The client asked for changes</b>{q.changesMessage && <p>{q.changesMessage}</p>}<span>Edit the quote, then resubmit it. The client sees the newest version.</span></div>
          )}
          {q.status === "Rejected" && <div className="qp-banner bad" role="status"><b>The client declined this quote</b>{q.rejectedReason && <p>{q.rejectedReason}</p>}</div>}
          {q.status === "Awaiting response" && q.viewedAt && <div className="qp-banner" role="status"><b>The client opened the quote</b><span>{quoteDateTime(q.viewedAt)}</span></div>}
        </div>

        <div className="main-col">
          <div className="quote-top">
            <section className="card quote-client">
              <div className="qc-head">
                <h3><Link href={`/clients/${c.id}`}>{c.name}</Link></h3>
                <button type="button" className="icon-btn" aria-label="More options" aria-haspopup="menu" onClick={(e) => dropdown(e.currentTarget, clientItems, { alignRight: true })}>
                  <Icon name="more" size={24} />
                </button>
              </div>
              <div className="qc-label">Property Address</div>
              <address>
                {address.map((line) => (<div key={line}>{line}</div>))}
                {cityLine && <div>{cityLine}</div>}
              </address>
              {(c.phone || c.email) && (
                <div className="qc-contact">
                  {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                </div>
              )}
            </section>
            <dl className="quote-facts">
              {facts.map(([label, value]) => (
                <div className="f" key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </div>

          <section className="card panel quote-section">
            <div className="ph">
              <h3>Introduction</h3>
              {pencil("intro", "Edit introduction")}
            </div>
            <div className="qs-body">
              {q.introImageUrl && (
                <div className="qs-hero">
                  <button type="button" className="photo-btn" aria-label={`View photo: ${q.introHeading || "Introduction"}`} onClick={() => setViewing(photoIndex(q.introImageUrl))}>
                    {/* A signed storage address, so Next's image optimiser is not used. */}
                    <Image src={q.introImageUrl} alt="" width={640} height={360} unoptimized />
                  </button>
                </div>
              )}
              {q.introHeading && <h4>{q.introHeading}</h4>}
              {q.introText && <p>{q.introText}</p>}
            </div>
          </section>

          <section className="card panel quote-section">
            <div className="ph">
              <h3>Product / Service</h3>
              {pencil("lines", "Edit products and services")}
            </div>
            <div className="qs-body flush">
              <table className="table quote-lines">
                <colgroup>
                  <col />
                  <col style={{ width: 128 }} />
                  <col style={{ width: 171 }} />
                  <col style={{ width: 171 }} />
                  <col style={{ width: 171 }} />
                </colgroup>
                <thead>
                  <tr><th>Line Item</th><th /><th className="num">Quantity</th><th className="num">Unit Price</th><th className="num">Total</th></tr>
                </thead>
                <tbody>
                  {q.lines.map((l) =>
                    l.kind === "text" ? (
                      <tr key={l.id}><td className="ql-main" colSpan={5}><div className="ql-desc">{l.name}</div></td></tr>
                    ) : (
                    <tr key={l.id} className={l.optional ? "has-box" : undefined}>
                      <td className="ql-main">
                        <div className="ql-name">
                          {l.optional && (
                            <span className={`qbox${l.selected ? " on" : ""}`} role="img" aria-label={l.selected ? "Included" : "Not included"}>
                              {l.selected && <Icon name="check" size={14} />}
                            </span>
                          )}
                          <b>{l.name}</b>
                        </div>
                        {l.description && <div className="ql-desc">{l.description}</div>}
                      </td>
                      <td className="ql-img">
                        {l.visitPhotos.map((p) => (
                          <button key={p.id} type="button" className="ql-thumb photo-btn" aria-label={`View photo: ${l.name}`} onClick={() => setViewing(photoIndex(p.url))}>
                            <Image src={p.url} alt="" width={56} height={56} unoptimized />
                          </button>
                        ))}
                        {l.imageUrl && (
                          <button type="button" className="ql-thumb photo-btn" aria-label={`View photo: ${l.name}`} onClick={() => setViewing(photoIndex(l.imageUrl))}>
                            <Image src={l.imageUrl} alt="" width={56} height={56} unoptimized />
                          </button>
                        )}
                      </td>
                      <td className="num" data-label="Quantity">{l.quantity}</td>
                      <td className="num" data-label="Price">{moneyCents(l.unitPriceCents)}</td>
                      <td className="num" data-label="Total">{moneyCents(Math.round(l.quantity * l.unitPriceCents))}</td>
                    </tr>
                    ),
                  )}
                </tbody>
              </table>
              <dl className="quote-totals">
                <div><dt>Subtotal</dt><dd>{moneyCents(q.totals.subtotalCents)}</dd></div>
                {q.totals.discountCents > 0 && <div><dt>Discount{q.discountKind === "percent" ? ` (${q.discountValue}%)` : ""}</dt><dd>-{moneyCents(q.totals.discountCents)}</dd></div>}
                {q.totals.taxCents > 0 && <div><dt>Tax ({q.taxPercent}%)</dt><dd>{moneyCents(q.totals.taxCents)}</dd></div>}
                <div className="grand"><dt>Total</dt><dd>{moneyCents(q.totals.totalCents)}</dd></div>
                {q.totals.depositCents > 0 && (
                  <>
                    <div className="rule"><dt>Required deposit{q.depositKind === "percent" ? ` (${q.depositValue}%)` : ""}</dt><dd>{moneyCents(q.totals.depositCents)}</dd></div>
                    {q.totals.depositCollectedCents > 0 && (
                      <div>
                        <dt><b className="collected">Deposit collected</b>{q.depositCollectedAt ? <> • {quoteDate(q.depositCollectedAt)}</> : null}{q.depositProofUrl && <> • <a href={q.depositProofUrl} target="_blank" rel="noreferrer">{q.depositProofName ?? "Proof"}</a></>}</dt>
                        <dd>-{moneyCents(q.totals.depositCollectedCents)}</dd>
                      </div>
                    )}
                    <div><dt>Outstanding deposit</dt><dd>{moneyCents(q.totals.depositOutstandingCents)}</dd></div>
                  </>
                )}
              </dl>
              {q.attachments.length > 0 && (
                <ul className="qp-files" aria-label="Attachments">
                  {q.attachments.map((a) => (<li key={a.id}><Icon name="file" size={20} /><a href={a.url ?? undefined} target="_blank" rel="noreferrer">{a.name}</a></li>))}
                </ul>
              )}
            </div>
          </section>

          {/* Jobber's "Add section" strip. Attachments are on the quote already and are edited in the builder; Images and Reviews are greyed until they are built. */}
          {canEdit && (
            <div className="qs-add" role="group" aria-label="Add section">
              <span className="qs-add-label"><Icon name="plus" size={16} />Add section</span>
              {pencils ? <button type="button" className="qs-chip" onClick={() => openEdit("attachments")}>Attachments</button> : <span className="qs-chip" aria-disabled="true">Attachments</span>}
              <span className="qs-chip" aria-disabled="true" title="Not available yet">Images</span>
              <span className="qs-chip" aria-disabled="true" title="Not available yet">Reviews</span>
            </div>
          )}

          {(q.clientMessage || pencils) && (
            <section className="card panel quote-section">
              <div className="ph">
                <h3>Client Message</h3>
                {pencil("message", "Edit client message")}
              </div>
              <div className="qs-body"><p className="qs-text">{q.clientMessage || "No message."}</p></div>
            </section>
          )}

          {(q.contract || q.disclaimers.length > 0 || pencils) && (
            <section className="card panel quote-section">
              <div className="ph">
                <h3>Contract / Disclaimer</h3>
                {pencil("contract", "Edit contract / disclaimer")}
              </div>
              <div className="qs-body">
                {(q.contract || q.disclaimers.length === 0) && <p className="qs-text">{q.contract || "No contract."}</p>}
                {q.disclaimers.map((d) => (
                  <div key={d.title} className="qs-disc"><h4>{d.title}</h4><p className="qs-text">{d.text}</p></div>
                ))}
              </div>
            </section>
          )}

          {(q.signatureUrl || q.signedBy) && q.signedAt && (
            <div className="quote-signature">
              <div className="sig-cell">
                {q.signatureUrl ? (
                  <div className="sig-image">
                    {/* The picture of the signature, kept in Convex storage. A signed storage address, so Next's optimiser is not used. */}
                    <Image src={q.signatureUrl} alt={q.signedBy ? `Signature of ${q.signedBy}` : "Signature"} width={210} height={104} unoptimized />
                  </div>
                ) : (
                  <div className="sig-name" aria-label={`Signed by ${q.signedBy}`}>{q.signedBy}</div>
                )}
                <div className="sig-line">Signature</div>
              </div>
              <div className="sig-cell date">
                <div className="sig-date">{quoteDate(q.signedAt)}</div>
                <div className="sig-line">Date</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        className="quote-toggle"
        aria-label={sideOpen ? "Hide notes" : "Show notes"}
        aria-expanded={sideOpen}
        title={sideOpen ? "Hide notes" : "Show notes"}
        onClick={() => writeItem(SIDE_KEY, sideOpen ? "1" : "0")}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M15 4v16" />
          <path d={sideOpen ? "M8 9.5 10.5 12 8 14.5" : "M10.5 9.5 8 12l2.5 2.5"} />
        </svg>
      </button>

      <aside className={`quote-side${sideOpen ? "" : " closed"}`} aria-label="Notes" inert={!sideOpen}>
        <div className="quote-side-inner">
          <section className="card quote-notes">
            <div className="qn-head">
              <h3>Notes</h3>
            </div>
            {canEdit && (
              <form
                className="pl-noteform"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!note.trim() && noteFiles.length === 0) return;
                  setSavingNote(true);
                  uploadPending(noteFiles)
                    .then((files) => addNote({ quoteId: q.id as Id<"quotes">, text: note, files }))
                    .then(() => { noteFiles.forEach((f) => URL.revokeObjectURL(f.url)); setNote(""); setNoteFiles([]); })
                    .catch((err) => toast(failure(err, "The note could not be saved.")))
                    .finally(() => setSavingNote(false));
                }}
              >
                <NoteEditor value={note} onChange={setNote} files={noteFiles} onFiles={setNoteFiles} disabled={savingNote} rows={5} placeholder="Leave an internal note for yourself or a team member" />
                <button type="submit" className="btn primary" disabled={savingNote || (!note.trim() && noteFiles.length === 0)}>{savingNote ? "Saving…" : "Save note"}</button>
              </form>
            )}
            {q.notes.length ? (
              q.notes.map((n) => <QuoteNote key={n.id} n={n} canEdit={canEdit} editingId={noteEditing} setEditingId={setNoteEditing} />)
            ) : (
              !canEdit && <p className="muted">No notes yet.</p>
            )}
          </section>
        </div>
      </aside>

      {viewing !== null && viewing >= 0 && <ImageViewer images={photos} start={viewing} onClose={() => setViewing(null)} />}

      {dialog === "send" && q.shareToken && <SendDialog token={q.shareToken} revision={q.revision} clientName={q.client.name} clientEmail={q.client.email} title={q.title} onEmail={q.client.email ? () => setDialog("email") : undefined} onClose={() => { setDialog(null); if (params.get("link")) router.replace(`/quotes/${q.id}`); }} />}
      {dialog === "email" && q.shareToken && (
        <SendEmailDialog
          client={{ id: q.client.id as Id<"clients">, name: q.client.name, email: q.client.email }}
          preset={{
            subject: `Your quote from ${businessName}: ${q.title}`,
            body: `Hi ${q.client.name.split(" ")[0]},

Here is your quote. You can read it, ask for changes or approve it with your signature here:
${typeof window === "undefined" ? "" : window.location.origin}/q/${q.shareToken}

Thank you.
${businessName}`,
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "sign" && <SignDialog quoteId={q.id as Id<"quotes">} businessId={q.businessId} defaultName={q.client.name} onClose={() => setDialog(null)} />}
      {dialog === "deposit" && <DepositDialog quoteId={q.id as Id<"quotes">} businessId={q.businessId} outstandingCents={q.totals.depositOutstandingCents} onClose={() => setDialog(null)} />}
      {dialog === "activity" && <ActivityDialog quoteId={q.id} onClose={() => setDialog(null)} />}
      {editFor && <SignatureWarningDialog quoteId={q.id as Id<"quotes">} onClose={() => setEditFor(null)} onReopened={() => router.push(`/quotes/${q.id}/edit?section=${editFor}`)} />}

      {deleting && (
        <DeleteQuoteDialog
          id={q.id}
          number={q.number}
          title={q.title}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            toast(`Quote #${q.number} was deleted.`);
            router.push("/quotes");
          }}
        />
      )}
    </div>
  );
}
