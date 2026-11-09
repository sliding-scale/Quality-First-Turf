"use client";

/* One quote (D-056, PRD 3.6), laid out like Jobber's quote page: status and title, the client and a table of facts, then the quote as the
   customer reads it (introduction, products and services with optional extras, deposit, signature), with Notes in the
   right-hand column. The pencils and the sending, converting and signing items in the More menu are in place but say "not built yet":
   the quote builder, sending and customer approval are separate steps (Q-005). Print or Save PDF and Delete work. Everything on the page
   comes from the backend; the totals are worked out there from the lines. On a phone the columns stack, as Jobber's do. */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QUOTE_DOT, QUOTE_PILL, useQuote } from "@/lib/quotes";
import { moneyCents, quoteDate, quoteDateTime } from "@/lib/format";
import { useStoredString, writeItem } from "@/lib/store";
import { DeleteQuoteDialog } from "./delete-quote-dialog";
import { Icon } from "./icon";
import { ImageViewer, type ViewerImage } from "./image-viewer";
import { QuoteSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI, type MenuItem } from "./ui-provider";

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

function QuoteView({ q }: { q: Quote }) {
  const router = useRouter();
  const { dropdown, soon, toast } = useUI();
  const { canEdit } = useStaff();
  const [deleting, setDeleting] = useState(false);
  // The quote's photos, in the order they appear on the page; clicking one opens the viewer on it.
  const photos: ViewerImage[] = [
    ...(q.introImageUrl ? [{ url: q.introImageUrl, caption: q.introHeading || "Introduction" }] : []),
    ...q.lines.flatMap((l) => (l.imageUrl ? [{ url: l.imageUrl, caption: l.name }] : [])),
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
    ...(q.depositPercent > 0 ? ([["Required Deposit", moneyCents(q.totals.depositCents)]] as [string, React.ReactNode][]) : []),
    ...(q.request ? ([["From Request", <Link key="r" href={`/clients/${q.request.clientId}`}>{quoteDate(q.request.requestedAt)}</Link>]] as [string, React.ReactNode][]) : []),
  ];

  // Jobber's More menu. Sending, converting and signing wait for later steps; printing and deleting work now. A role that can only look gets
  // only the items that do not change anything.
  const later = (label: string, icon: string, what: string, extra: object = {}): MenuItem => ({ label, icon, onSelect: () => soon(what), ...extra });
  const rule: MenuItem = { divider: true };
  const moreItems: MenuItem[] = [
    ...(canEdit
      ? [later("Convert to Job", "hammer", "Converting quotes to jobs", { iconColor: "var(--green)" }), rule, { heading: "Send as..." } as MenuItem, later("Email", "mail", "Sending quotes by email"), later("Send Text", "sms", "Sending quotes by text"), rule]
      : []),
    later("Preview as Client", "eye", "Previewing a quote as the client"),
    ...(canEdit ? [later("Collect Signature", "signature", "Collecting signatures")] : []),
    { label: "Print or Save PDF", icon: "pdf", onSelect: () => window.print() },
    ...(canEdit ? [{ label: "Delete", icon: "trash", danger: true, onSelect: () => setDeleting(true) } as MenuItem] : []),
  ];
  const clientItems: MenuItem[] = [
    { label: "View client", onSelect: () => router.push(`/clients/${c.id}`) },
    ...(canEdit ? [{ label: "Edit client", onSelect: () => router.push(`/clients/${c.id}/edit`) } as MenuItem] : []),
  ];
  const editing = (what: string) => () => soon(what);

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
              <button type="button" className="icon-btn" aria-label="View activity" title="View activity" onClick={editing("Quote history")}>
                <Icon name="history" size={24} />
              </button>
              <button className="btn more-btn" type="button" aria-label="More" aria-haspopup="menu" onClick={(e) => dropdown(e.currentTarget, moreItems, { alignRight: true, variant: "actions" })}>
                <Icon name="more" size={24} /><span className="lbl">More</span>
              </button>
              <button className="btn primary" type="button" onClick={editing("Creating quotes")}>
                <Icon name="duplicate" size={24} />Create Similar Quote
              </button>
            </div>
          </div>
          <div className="quote-title-row">
            <h1>{q.title}</h1>
            {canEdit && (
              <button type="button" className="icon-btn" aria-label="Edit quote details" title="Edit quote details" onClick={editing("Editing quotes")}>
                <Icon name="pencil" size={24} />
              </button>
            )}
          </div>
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
              {canEdit && <button type="button" className="icon-btn" aria-label="Edit introduction" onClick={editing("Editing quotes")}><Icon name="pencil" size={24} /></button>}
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
              {canEdit && <button type="button" className="icon-btn" aria-label="Edit products and services" onClick={editing("Editing quotes")}><Icon name="pencil" size={24} /></button>}
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
                  {q.lines.map((l) => (
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
                  ))}
                </tbody>
              </table>
              <dl className="quote-totals">
                <div><dt>Subtotal</dt><dd>{moneyCents(q.totals.subtotalCents)}</dd></div>
                <div className="grand"><dt>Total</dt><dd>{moneyCents(q.totals.totalCents)}</dd></div>
                {q.depositPercent > 0 && (
                  <>
                    <div className="rule"><dt>Required deposit ({q.depositPercent}%)</dt><dd>{moneyCents(q.totals.depositCents)}</dd></div>
                    {q.totals.depositCollectedCents > 0 && (
                      <div>
                        <dt><b className="collected">Deposit collected</b>{q.depositCollectedAt ? <> • {quoteDate(q.depositCollectedAt)}</> : null}</dt>
                        <dd>-{moneyCents(q.totals.depositCollectedCents)}</dd>
                      </div>
                    )}
                    <div><dt>Outstanding deposit</dt><dd>{moneyCents(q.totals.depositOutstandingCents)}</dd></div>
                  </>
                )}
              </dl>
            </div>
          </section>

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
              <button type="button" className="btn square" aria-label="Add a note" onClick={() => soon("Adding notes to quotes")}>
                <Icon name="plus" size={20} />
              </button>
            </div>
            {q.notes.length ? (
              q.notes.map((n) => (
                <div className="qn-item" key={n.id}>
                  <div className="qn-who">
                    <span className="qn-avatar" aria-hidden="true">{n.author.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <b>{n.author}</b>
                      <div className="muted">{quoteDateTime(n.createdAt)}</div>
                    </div>
                    {canEdit && (
                      <button type="button" className="icon-btn" aria-label="Edit note" onClick={editing("Editing notes on quotes")}><Icon name="pencil" size={24} /></button>
                    )}
                  </div>
                  <p>{n.text}</p>
                  {n.attachmentUrl && (
                    <a className="qn-file" href={n.attachmentUrl} target="_blank" rel="noreferrer" title={n.attachmentName ?? "Attachment"}>
                      <Icon name="file" size={24} />
                      <span>{n.attachmentName ?? "Attachment"}</span>
                    </a>
                  )}
                </div>
              ))
            ) : (
              <p className="muted">No notes yet.</p>
            )}
          </section>
        </div>
      </aside>

      {viewing !== null && viewing >= 0 && <ImageViewer images={photos} start={viewing} onClose={() => setViewing(null)} />}

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
