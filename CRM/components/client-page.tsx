"use client";

/* Client page, copied from Jobber's (checked in the browser 2026-11-09, D-060): the header and its details, the three tabs, the cards
   (Properties, Contacts, Work overview, Billing, Payment methods, Client schedule) and the right-hand column (Overview, Tags, Last
   communication, Notes). Everything shown is the client's real data; a card with nothing to show is the one-line prompt Jobber draws. */

import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CLIENT_STATUS_LABEL, requestStatus } from "@/convex/crm/lib/stages";
import { startOfToday, useClient, useClientNotes, useClientProjects, type ClientDoc } from "@/lib/clients";
import { BUSINESS_TIME_ZONE, moneyCents, quoteDate, quoteDateTime } from "@/lib/format";
import { QUOTE_DOT, QUOTE_OPEN_STATUSES } from "@/lib/quotes";
import { useStaff } from "./staff-context";
import { EditTagsDialog, SendEmailDialog } from "./client-dialogs";
import { DeleteClientsDialog } from "./delete-clients-dialog";
import { Icon } from "./icon";
import { ClientSkeleton, Sk } from "./skeletons";
import { useUI } from "./ui-provider";

type Tab = "info" | "communication" | "media";
const TAB_PARAM: Record<Tab, string> = { info: "", communication: "communication", media: "media" };
const requestDot = { New: "var(--blue)", Overdue: "var(--red)", Consultation: "var(--orange)", Converted: "var(--green)", Lost: "var(--muted)" } as const;

export function ClientPage({ id }: { id: string }) {
  const client = useClient(id);
  if (client === undefined) return <ClientSkeleton />;
  if (client === null) {
    return (
      <div className="empty-state">
        <h2>Client not found</h2>
        <p>This client does not exist, or it was removed.</p>
        <Link className="btn primary" href="/clients">Back to clients</Link>
      </div>
    );
  }
  return <ClientView c={client} />;
}

const noteDate = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TIME_ZONE });
const money = (cents: number) => (cents < 0 ? "-" : "") + moneyCents(Math.abs(cents));

/** "Main phone", "Other email": the label Jobber puts in front of each number and address. */
const label = (description: string, kind: "phone" | "email") => `${description || "Main"} ${kind}`;

/** One property's line: "35043 Hacienda Heights, Fallbrook, CA 92028". */
const propertyLine = (p: { street1: string; street2: string; city: string; state: string; zip: string }) =>
  [[p.street1, p.street2].filter(Boolean).join(" "), p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

function ClientView({ c }: { c: ClientDoc }) {
  const { canEdit } = useStaff();
  const router = useRouter();
  const { dropdown, soon, toast } = useUI();
  const archive = useMutation(api.crm.clients.archive);
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(location.search).get("tab");
    return t === "communication" || t === "media" ? t : "info";
  });
  const [tagging, setTagging] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = `${c.name} · Quality First Turf CRM`;
  }, [c.name]);

  const pick = (t: Tab) => {
    setTab(t);
    const q = TAB_PARAM[t];
    history.replaceState(null, "", q ? `?tab=${q}` : location.pathname);
  };

  // What Jobber lists: every phone and email with its label, in the order given. A client made here has just the one of each.
  const phones = c.phones ?? (c.phone ? [{ number: c.phone, description: "Main" }] : []);
  const emails = c.emails ?? (c.email ? [{ address: c.email, description: "Main" }] : []);
  const properties = c.properties ?? (c.street1 ? [{ street1: c.street1, street2: c.street2, city: c.city, state: c.state, zip: c.zip, country: "", lawnSize: "", lockedGate: false }] : []);
  const subtitle = c.isCompany ? [c.firstName, c.lastName].filter(Boolean).join(" ") : "";
  const company = c.isCompany ?? c.type === "contractor";
  const statusClass = c.status === "lead" ? "lead" : c.status === "active" ? "active" : "draft";
  const tags = c.tags ?? [];

  return (
    <div className="fade-in cj">
      <div className="cj-top">
        <div className="cj-who">
          <Icon name="contact" size={22} />
          <span className={`pill jb-status ${statusClass}`}><span className="dot" />{CLIENT_STATUS_LABEL[c.status]}</span>
        </div>
        <div className="cj-actions">
          {c.email && (
            <button type="button" className="cj-btn" aria-label={`Send email to ${c.name}`} data-tip="Email" onClick={() => setEmailing(true)}><Icon name="mail" size={22} /></button>
          )}
          <button
            type="button"
            className="cj-btn"
            aria-label="More actions"
            aria-haspopup="menu"
            data-tip="More actions"
            onClick={(e) =>
              dropdown(
                e.currentTarget,
                [
                  ...(canEdit && c.status !== "archived"
                    ? [{ label: "Archive", onSelect: () => void archive({ ids: [c._id] }).then(() => toast(`${c.name} archived`)) }]
                    : []),
                  ...(canEdit ? [{ label: "Delete", danger: true, onSelect: () => setDeleting(true) }] : []),
                  { label: "Open in New Tab", icon: "newtab", onSelect: () => window.open(location.pathname, "_blank", "noopener") },
                ],
                { alignRight: true },
              )
            }
          >
            <Icon name="more" size={22} />
          </button>
          <button
            type="button"
            className="btn primary cj-create"
            onClick={(e) =>
              dropdown(
                e.currentTarget,
                [["Request", "inbox"], ["Quote", "quote"], ["Job", "hammer"], ["Invoice", "receipt"]].map(([l, ic]) => ({ label: l, icon: ic, onSelect: () => soon(l + "s") })),
                { alignRight: true },
              )
            }
          >
            <Icon name="plus" size={18} /> Create
          </button>
        </div>
      </div>

      <div className="cj-name">
        <div>
          <h1>{c.name}</h1>
          {subtitle && <div className="cj-sub">{subtitle}</div>}
        </div>
        {canEdit && (
          <Link className="cj-pencil" href={`/clients/${c._id}/edit`} aria-label="Edit client" data-tip="Edit client"><Icon name="pencil" size={22} /></Link>
        )}
      </div>

      <div className="cj-fields">
        <dl>
          {phones.length ? phones.map((p, i) => (
            <div className="f" key={`p${i}`}><dt>{label(p.description, "phone")}</dt><dd><a href={`tel:${p.number}`}>{p.number}</a></dd></div>
          )) : <div className="f"><dt>Phone</dt><dd>—</dd></div>}
          {emails.length ? emails.map((e, i) => (
            <div className="f" key={`e${i}`}><dt>{label(e.description, "email")}</dt><dd><a href={`mailto:${e.address}`}>{e.address}</a></dd></div>
          )) : <div className="f"><dt>Email</dt><dd>—</dd></div>}
        </dl>
        <dl>
          <div className="f"><dt>Payment terms</dt><dd>{company ? "Commercial default (Net 30)" : "Residential default (Due upon receipt)"}</dd></div>
          <div className="f"><dt>Lead source</dt><dd>—</dd></div>
          <div className="f"><dt>Ask for a review</dt><dd>Yes</dd></div>
        </dl>
      </div>

      <div className="cj-cols">
        <div className="cj-main">
          <div className="cj-tabs" role="tablist">
            <button className={`cj-tab${tab === "info" ? " active" : ""}`} role="tab" aria-selected={tab === "info"} onClick={() => pick("info")}>Client information</button>
            <button className={`cj-tab${tab === "communication" ? " active" : ""}`} role="tab" aria-selected={tab === "communication"} onClick={() => pick("communication")}>Communication</button>
            <button className={`cj-tab${tab === "media" ? " active" : ""}`} role="tab" aria-selected={tab === "media"} onClick={() => pick("media")}>Files and media <span className="cj-new">NEW</span></button>
          </div>

          <div key={tab} className="fade-in cj-stack">
            {tab === "info" && (
              <>
                <PropertiesCard properties={properties} canEdit={canEdit} soon={soon} />
                <ContactsCard contacts={c.contacts ?? []} soon={soon} />
                <WorkOverview clientId={c._id} soon={soon} />
                <BillingCard billing={c.billing ?? []} balanceCents={c.balanceCents ?? 0} soon={soon} />
                <div className="cj-strip">
                  <Icon name="card" size={22} />
                  <span><b>Payment methods</b> - Saved payment methods will appear here once Jobber Payments is set up</span>
                  <button type="button" className="cj-link" onClick={() => soon("Payments")}>Set up Jobber Payments</button>
                </div>
                <ScheduleCard items={c.scheduleItems ?? []} soon={soon} />
              </>
            )}
            {tab === "communication" && (
              <section className="cj-card cj-empty">
                {c.lastCommunication ? (
                  <div className="cj-msg">
                    <div className="when">{quoteDateTime(c.lastCommunication.at)}</div>
                    <p>{c.lastCommunication.text}</p>
                  </div>
                ) : (
                  <>
                    <b>No communications yet</b>
                    <span>This client&apos;s emails, texts, and chats will appear here.</span>
                  </>
                )}
              </section>
            )}
            {tab === "media" && (
              <div className="cj-media">
                <div className="cj-media-empty">
                  <span className="cj-media-ic"><Icon name="image" size={26} /></span>
                  <span>Files and images added to this client&apos;s notes and checklists will appear here</span>
                </div>
                <div className="cj-tiles" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <span key={i}><Icon name="image" size={22} /></span>)}</div>
              </div>
            )}
          </div>
        </div>

        <aside className="cj-aside">
          <section className="cj-side">
            <h3>Overview</h3>
            <div className="cj-big">{money(c.lifetimeValueCents ?? 0)}<small>Lifetime value</small></div>
            <div className="cj-big">{money(c.balanceCents ?? 0)}<small>Current balance</small></div>
          </section>

          <section className="cj-side">
            <div className="cj-side-head">
              <h3>Tags</h3>
              {canEdit && (
                <button type="button" className="cj-iconbtn" aria-label="Edit tags" data-tip="Edit tags" onClick={() => setTagging(true)}>
                  <Icon name={tags.length ? "pencil" : "plus"} size={22} />
                </button>
              )}
            </div>
            {tags.length ? (
              <div className="cj-tags">{tags.map((t) => <span className="jb-tag" key={t}>{t}</span>)}</div>
            ) : (
              <p className="cj-muted">This client has no tags</p>
            )}
          </section>

          {c.lastCommunication && (
            <section className="cj-side cj-last">
              <button type="button" onClick={() => pick("communication")}>
                <span className="cj-side-head"><h3>Last communication</h3><Icon name="chevright" size={22} /></span>
                <span className="when">{quoteDateTime(c.lastCommunication.at)}</span>
                <span className="text">{c.lastCommunication.text} <b>Read more…</b></span>
              </button>
            </section>
          )}

          <NotesCard clientId={c._id} canEdit={canEdit} />
        </aside>
      </div>

      {tagging && <EditTagsDialog client={c} onClose={() => setTagging(false)} onSaved={() => toast("Tags saved")} />}
      {emailing && <SendEmailDialog client={c} onClose={() => setEmailing(false)} />}
      {deleting && (
        <DeleteClientsDialog ids={[c._id]} onClose={() => setDeleting(false)} onDeleted={() => { toast("Client deleted"); router.push("/clients"); }} />
      )}
    </div>
  );
}

type Soon = (what?: string) => void;

function PropertiesCard({ properties, canEdit, soon }: { properties: NonNullable<ClientDoc["properties"]>; canEdit: boolean; soon: Soon }) {
  if (!properties.length) {
    return (
      <div className="cj-strip">
        <Icon name="pin" size={22} />
        <span><b>Properties</b> - Add properties so you can organize work by location</span>
        <button type="button" className="cj-link" onClick={() => soon("Properties")}>Add Property</button>
      </div>
    );
  }
  return (
    <section className="cj-card">
      <div className="cj-card-head">
        <h3>Properties</h3>
        {canEdit && <button type="button" className="cj-plus" aria-label="Add property" data-tip="Add property" onClick={() => soon("Properties")}><Icon name="plus" size={22} /></button>}
      </div>
      {properties.map((p, i) => (
        <div className="cj-prop" key={i}>
          <div className="top">
            <b>{propertyLine(p)}</b>
            <span>
              <a className="cj-iconbtn" aria-label="Open in maps" data-tip="View on map" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(propertyLine(p))}`} target="_blank" rel="noopener noreferrer"><Icon name="pin" size={22} /></a>
              {canEdit && <button type="button" className="cj-iconbtn" aria-label="Edit property" data-tip="Edit property" onClick={() => soon("Editing properties")}><Icon name="pencil" size={22} /></button>}
            </span>
          </div>
          <dl className="cj-fields2">
            <div className="f"><dt>Lawn Size</dt><dd>{p.lawnSize || "—"}</dd></div>
            <div className="f"><dt>Locked Gate</dt><dd>{p.lockedGate ? "Yes" : "No"}</dd></div>
          </dl>
        </div>
      ))}
    </section>
  );
}

function ContactsCard({ contacts, soon }: { contacts: NonNullable<ClientDoc["contacts"]>; soon: Soon }) {
  if (!contacts.length) {
    return (
      <div className="cj-strip">
        <Icon name="contact" size={22} />
        <span><b>Contacts</b> - Add contacts to keep track of everyone you communicate with</span>
        <button type="button" className="cj-link" onClick={() => soon("Contacts")}>Add Contact</button>
      </div>
    );
  }
  return (
    <section className="cj-card">
      <div className="cj-card-head">
        <h3>Contacts</h3>
        <button type="button" className="cj-plus" aria-label="Add contact" data-tip="Add contact" onClick={() => soon("Contacts")}><Icon name="plus" size={22} /></button>
      </div>
      <table className="table cj-table">
        <colgroup><col style={{ width: "30%" }} /><col style={{ width: "25%" }} /><col style={{ width: "40%" }} /><col style={{ width: "5%" }} /></colgroup>
        <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th /></tr></thead>
        <tbody>
          {contacts.map((p, i) => (
            <tr key={i}>
              <td><b>{p.name}</b>{p.role && <div>{p.role}</div>}</td>
              <td>{p.phone && <a href={`tel:${p.phone}`}>{p.phone}</a>}</td>
              <td>{p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}</td>
              <td><button type="button" className="cj-iconbtn" aria-label="More actions" onClick={() => soon("Contacts")}><Icon name="more" size={22} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

type Kind = "requests" | "quotes" | "jobs" | "invoices";
const KINDS: { key: Kind; label: string; icon: string; color: string }[] = [
  { key: "requests", label: "Requests", icon: "inbox", color: "var(--orange)" },
  { key: "quotes", label: "Quotes", icon: "quote", color: "var(--burgundy)" },
  { key: "jobs", label: "Jobs", icon: "hammer", color: "var(--green)" },
  { key: "invoices", label: "Invoices", icon: "receipt", color: "var(--navy)" },
];

/** Requests and quotes of the client, as in Jobber: "Status | Active" until a type is picked, which shows all statuses of that type. */
function WorkOverview({ clientId, soon }: { clientId: Id<"clients">; soon: Soon }) {
  const projects = useClientProjects(clientId);
  const quotes = useQuery(api.crm.quotes.byClient, { clientId });
  const [kind, setKind] = useState<Kind | null>(null);
  const now = startOfToday();

  const rows = [
    ...(projects ?? []).map((p) => {
      const status = requestStatus(p.stage, p.requestedAt, now);
      return { key: p._id as string, kind: "requests" as Kind, icon: "inbox", color: "var(--orange)", title: `Request ${p.code}`, sub: p.title, date: `Created at ${quoteDate(p.requestedAt)}`, status: status as string, dot: requestDot[status] as string, active: status === "New" || status === "Overdue" || status === "Consultation", amount: "", href: "" };
    }),
    ...(quotes ?? []).map((q) => ({
      key: q._id as string, kind: "quotes" as Kind, icon: "quote", color: "var(--burgundy)", title: `Quote #${q.number}`, sub: q.title, date: `Created at ${quoteDate(q.createdAt)}`,
      status: q.status as string, dot: QUOTE_DOT[q.status] as string, active: (QUOTE_OPEN_STATUSES as readonly string[]).includes(q.status), amount: moneyCents(q.totalCents), href: `/quotes/${q._id}`,
    })),
  ];
  const shown = rows.filter((r) => (kind ? r.kind === kind : r.active));

  return (
    <section className="cj-card">
      <div className="cj-card-head">
        <h3>Work overview</h3>
        <button type="button" className="cj-plus" aria-label="Create work" data-tip="Create" onClick={() => soon("Creating work")}><Icon name="plus" size={22} /></button>
      </div>
      <div className="cj-chips">
        <span className="chip cj-status">Status<span className="sep" /><b>{kind ? "All" : "Active"}</b></span>
        {KINDS.map((k) => (
          <button key={k.key} type="button" className={`chip outline cj-kind${kind === k.key ? " on" : ""}`} aria-pressed={kind === k.key} onClick={() => setKind(kind === k.key ? null : k.key)}>
            <span style={{ color: k.color, display: "inline-flex" }}><Icon name={k.icon} size={18} /></span>{k.label}
            {kind === k.key && <span className="x" aria-hidden="true"><Icon name="x" size={14} /></span>}
          </button>
        ))}
      </div>
      <table className="table cj-table">
        <colgroup><col style={{ width: "40%" }} /><col style={{ width: "20%" }} /><col style={{ width: "25%" }} /><col style={{ width: "15%" }} /></colgroup>
        <thead><tr><th>Item</th><th>Date</th><th>Status</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {projects === undefined || quotes === undefined ? (
            <tr><td><Sk w="60%" h={16} /></td><td><Sk w="70%" h={16} /></td><td><Sk w="60%" h={22} r={999} /></td><td><Sk w="50%" h={16} /></td></tr>
          ) : shown.length ? (
            shown.map((r) => (
              <tr key={r.key} className={r.href ? "click" : undefined} onClick={r.href ? () => { location.href = r.href; } : undefined}>
                <td>
                  <div className="cj-item">
                    <span style={{ color: r.color, display: "inline-flex" }}><Icon name={r.icon} size={22} /></span>
                    <div><b>{r.title}</b><div>{r.sub}</div></div>
                  </div>
                </td>
                <td>{r.date}</td>
                <td><span className="pill jb-status"><span className="dot" style={{ background: r.dot }} />{r.status}</span></td>
                <td className="num">{r.amount}</td>
              </tr>
            ))
          ) : (
            <tr><td colSpan={4} className="cj-none">No results match your search</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function BillingCard({ billing, balanceCents, soon }: { billing: NonNullable<ClientDoc["billing"]>; balanceCents: number; soon: Soon }) {
  if (!billing.length) {
    return (
      <div className="cj-strip">
        <Icon name="receipt" size={22} />
        <span><b>Billing</b> - Bill this client to see billing history</span>
        <button type="button" className="cj-link" onClick={() => soon("Billing")}>Add Billing Information</button>
      </div>
    );
  }
  return (
    <section className="cj-card">
      <div className="cj-card-head">
        <h3>Billing</h3>
        <button type="button" className="cj-plus" aria-label="Add billing information" data-tip="Add billing" onClick={() => soon("Billing")}><Icon name="plus" size={22} /></button>
      </div>
      <table className="table cj-table">
        <colgroup><col style={{ width: "25%" }} /><col style={{ width: "25%" }} /><col style={{ width: "25%" }} /><col style={{ width: "25%" }} /></colgroup>
        <thead><tr><th>Item</th><th>Applied to</th><th>Date</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {billing.map((b, i) => (
            <tr key={i}>
              <td><div className="cj-item"><span style={{ color: "var(--orange)", display: "inline-flex" }}><Icon name="card" size={22} /></span><b>{b.kind}</b></div></td>
              <td>{b.appliedTo}</td>
              <td>{quoteDate(b.at)}</td>
              <td className="num">{money(b.cents)}</td>
            </tr>
          ))}
          <tr className="cj-total"><td colSpan={3}><b>Current balance</b></td><td className="num"><b>{money(balanceCents)}</b></td></tr>
        </tbody>
      </table>
    </section>
  );
}

function ScheduleCard({ items, soon }: { items: NonNullable<ClientDoc["scheduleItems"]>; soon: Soon }) {
  if (!items.length) {
    return (
      <div className="cj-strip">
        <Icon name="calendar" size={22} />
        <span><b>Client schedule</b> - Scheduled client tasks and events appear here</span>
        <button type="button" className="cj-link" onClick={() => soon("Scheduling")}>Add</button>
      </div>
    );
  }
  return (
    <section className="cj-card">
      <div className="cj-card-head">
        <h3>Client schedule</h3>
        <button type="button" className="cj-plus" aria-label="Add to the schedule" data-tip="Add" onClick={() => soon("Scheduling")}><Icon name="plus" size={22} /></button>
      </div>
      <div className="cj-chips">
        <span className="chip cj-status">Type<span className="sep" /><b>All</b></span>
        <span className="chip cj-status">Status<span className="sep" /><b>All</b></span>
      </div>
      <table className="table cj-table">
        <colgroup><col style={{ width: "40%" }} /><col style={{ width: "35%" }} /><col style={{ width: "20%" }} /><col style={{ width: "5%" }} /></colgroup>
        <thead><tr><th>Schedule</th><th>Title</th><th>Assigned</th><th /></tr></thead>
        <tbody>
          {items.map((s, i) => (
            <tr key={i}>
              <td>
                <div className="cj-item">
                  <span style={{ color: s.kind === "request" ? "var(--orange)" : "var(--ink)", display: "inline-flex" }}><Icon name={s.kind === "request" ? "inbox" : "tasks"} size={22} /></span>
                  <div><b>{quoteDateTime(s.at)}</b><div>{s.status}</div></div>
                </div>
              </td>
              <td>{s.title}</td>
              <td className={s.assigned === "Unassigned" ? "cj-unassigned" : undefined}>{s.assigned}</td>
              <td><button type="button" className="cj-iconbtn" aria-label="More actions" onClick={() => soon("Scheduling")}><Icon name="more" size={22} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function NotesCard({ clientId, canEdit }: { clientId: Id<"clients">; canEdit: boolean }) {
  const { toast } = useUI();
  const addNote = useMutation(api.crm.clients.addNote);
  const saved = useClientNotes(clientId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const text = ref.current?.value.trim();
    if (!text) return;
    try {
      await addNote({ clientId, text });
      if (ref.current) ref.current.value = "";
      setOpen(false);
    } catch (e) {
      toast(e instanceof ConvexError && typeof e.data === "string" ? e.data : "The note could not be saved.");
    }
  }

  return (
    <section className="cj-side">
      <h3>Notes</h3>
      {canEdit && (open ? (
        <div className="cj-note-box">
          <textarea ref={ref} autoFocus placeholder="Leave an internal note for yourself or a team member" aria-label="New note" />
          <div className="cj-note-actions">
            <button type="button" className="btn plain" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn primary" onClick={() => void submit()}>Save</button>
          </div>
        </div>
      ) : (
        <button type="button" className="cj-note-empty" onClick={() => setOpen(true)}>
          <span className="ic"><Icon name="note" size={22} /></span>
          Leave an internal note for yourself or a team member
        </button>
      ))}
      {saved === undefined ? (
        <div className="note-item"><Sk w="80%" h={14} /></div>
      ) : (
        saved.map((n) => (
          <div className="note-item" key={n._id}>
            {n.text}
            <div className="d">{n.author} · {noteDate(n._creationTime)}</div>
          </div>
        ))
      )}
    </section>
  );
}
