"use client";

/* The quote builder (D-063): Jobber's New Quote form, with the PRD's rules. Title, client, project, quote number and salesperson; an
   Introduction; Product / Service lines; what the client sees; discount, tax and deposit; attachments, a client message and the contract.
   Totals are worked out by the same code the backend uses, so the screen cannot disagree with what is saved. One column on a phone,
   with the Save bar pinned to the bottom. Unsaved changes ask before they are thrown away. */

import { useConvex, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { quoteTotals, type PricedLine } from "@/convex/crm/lib/quoteMath";
import { useClientProjects, useWorkspace, type BusinessDoc } from "@/lib/clients";
import { money } from "@/lib/format";
import { clock, failure, usePeople } from "@/lib/pipeline";
import { centsToInput, dollarsToCents, uploadFile, useClientSearch, useQuote } from "@/lib/quotes";
import { SECTION_TITLE, type Section } from "@/lib/quote-sections";
import { sameTitle, type DisclaimerCopy } from "@/convex/crm/lib/disclaimers";
import { EmptyBackend } from "./empty-backend";
import { Icon } from "./icon";
import { NewClientDialog } from "./new-client-dialog";
import { PipelineModal } from "./pipeline-dialogs";
import { QuoteBuilderSkeleton } from "./skeletons";
import { QuoteLines, lineCents, newLine, type DraftLine } from "./quote-lines";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type View = { quantities: boolean; unitPrices: boolean; lineTotals: boolean; totals: boolean };

type Draft = {
  title: string;
  clientId?: Id<"clients">;
  clientName: string;
  opportunityId?: Id<"opportunities">;
  salesperson: string;
  introHeading: string;
  introText: string;
  introImageId?: Id<"_storage">;
  introImageUrl: string | null;
  lines: DraftLine[];
  discountKind: "amount" | "percent" | null;
  discount: string;
  tax: string;
  depositKind: "percent" | "amount" | null;
  deposit: string;
  clientView: View;
  showMessage: boolean;
  clientMessage: string;
  /** null until the person types: then a new quote shows (and saves) the business's default contract text. */
  contract: string | null;
  applyContract: boolean;
  /** Saved disclaimers attached to this quote, each a copy of its title and wording (D-075). */
  disclaimers: DisclaimerCopy[];
};

const ALL_ON: View = { quantities: true, unitPrices: true, lineTotals: true, totals: true };
const blank = (salesperson: string): Draft => ({
  title: "", clientName: "", salesperson, introHeading: "", introText: "", introImageUrl: null, lines: [newLine("item")], discountKind: null, discount: "", tax: "", depositKind: null,
  deposit: "", clientView: ALL_ON, showMessage: false, clientMessage: "", contract: null, applyContract: false, disclaimers: [],
});

type QuoteDoc = NonNullable<ReturnType<typeof useQuote>>;
function fromQuote(q: QuoteDoc): Draft {
  return {
    title: q.title, clientId: q.client.id, clientName: q.client.name, opportunityId: q.request?.id, salesperson: q.salesperson, introHeading: q.introHeading, introText: q.introText,
    introImageUrl: q.introImageUrl, lines: q.lines.map((l) => ({ key: l.id, id: l.id, kind: l.kind, name: l.name, description: l.description, imageUrl: l.imageUrl, quantity: String(l.quantity), price: centsToInput(l.unitPriceCents), optional: l.optional, selected: l.selected, catalogueName: l.catalogueName ?? undefined })),
    discountKind: q.discountKind, discount: q.discountKind === "amount" ? centsToInput(q.discountValue) : q.discountKind === "percent" ? String(q.discountValue) : "",
    tax: q.taxPercent ? String(q.taxPercent) : "", depositKind: q.depositKind, deposit: q.depositKind === "amount" ? centsToInput(q.depositValue) : q.depositKind === "percent" ? String(q.depositValue) : "",
    clientView: q.clientView, showMessage: !!q.clientMessage, clientMessage: q.clientMessage, contract: q.contract, applyContract: false, disclaimers: q.disclaimers,
  };
}

/** The money options of a draft, in the units the backend stores (cents, percents). */
function moneyOf(d: Draft) {
  const dv = d.discountKind === "amount" ? dollarsToCents(d.discount) : Number(d.discount);
  const pv = d.depositKind === "amount" ? dollarsToCents(d.deposit) : Number(d.deposit);
  return {
    discountKind: d.discountKind ?? undefined, discountValue: Number.isFinite(dv) ? dv : 0, taxPercent: Number.isFinite(Number(d.tax)) ? Number(d.tax) : 0,
    depositKind: d.depositKind ?? undefined, depositValue: Number.isFinite(pv) ? pv : 0,
  };
}

export function NewQuotePage({ clientId, projectId }: { clientId?: string; projectId?: string }) {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <QuoteBuilderSkeleton />;
  if (workspace.state === "empty") return <EmptyBackend />;
  return <Builder business={workspace.business} presetClient={clientId as Id<"clients"> | undefined} presetProject={projectId as Id<"opportunities"> | undefined} />;
}

/** The quote page's pencils each open just their own section, as in Jobber (`/quotes/<id>/edit?section=intro`). Without one, the whole quote opens. */
export function EditQuotePage({ id, section }: { id: string; section?: Section }) {
  const quote = useQuote(id);
  if (quote === undefined) return <QuoteBuilderSkeleton />;
  if (quote === null) return <div className="empty-state"><h2>Quote not found</h2><Link className="btn primary" href="/quotes">Back to quotes</Link></div>;
  return <EditGate quote={quote} section={section} />;
}

function EditGate({ quote, section }: { quote: QuoteDoc; section?: Section }) {
  const workspace = useWorkspace();
  if (workspace.state !== "ready") return <QuoteBuilderSkeleton />;
  const business = workspace.businesses.find((b) => b._id === quote.businessId) ?? workspace.business;
  return <Builder business={business} quote={quote} section={section} />;
}

function Builder({ business, quote, presetClient, presetProject, section }: { business: BusinessDoc; quote?: QuoteDoc; presetClient?: Id<"clients">; presetProject?: Id<"opportunities">; section?: Section }) {
  const router = useRouter();
  const { toast } = useUI();
  const staff = useStaff();
  const people = usePeople(business._id);
  const create = useMutation(api.crm.quoteDraft.create);
  const save = useMutation(api.crm.quoteDraft.save);
  const send = useMutation(api.crm.quoteFlow.send);
  const markAwaiting = useMutation(api.crm.quoteFlow.markAwaitingResponse);
  const uploadUrl = useMutation(api.crm.quoteDraft.uploadUrl);
  const addAttachment = useMutation(api.crm.quoteDraft.addAttachment);
  const removeAttachment = useMutation(api.crm.quoteDraft.removeAttachment);

  const initial = useMemo<Draft>(() => (quote ? fromQuote(quote) : { ...blank(staff.name), ...(presetProject ? { opportunityId: presetProject } : {}) }), [quote, staff.name, presetProject]);
  const [d, setD] = useState<Draft>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [bad, setBad] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
  const [addingClient, setAddingClient] = useState(false);
  const intro = useRef<HTMLInputElement>(null);
  const attach = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));

  // A client given in the address (from a client or a project): fill the name in.
  const presetDoc = useConvexClient(presetClient);
  const clientId = d.clientId ?? (presetClient && presetDoc ? presetClient : undefined);
  const clientName = d.clientName || (presetDoc?.name ?? "");
  const projects = useClientProjects(clientId);
  const found = useClientSearch(business._id, clientQuery);
  const contractDefault = useQuery(api.crm.quotes.contractDefault, { businessId: business._id });

  const dirty = JSON.stringify(d) !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const priced: PricedLine[] = d.lines.map((l) => ({ quantity: Number(l.quantity) || 0, unitPriceCents: Number.isFinite(dollarsToCents(l.price)) ? dollarsToCents(l.price) : 0, optional: l.optional, selected: l.selected, kind: l.kind }));
  const totals = quoteTotals(priced, moneyOf(d), quote?.totals.depositCollectedCents ?? 0);

  function validate(): Set<string> {
    const b = new Set<string>();
    if (!d.title.trim()) b.add("title");
    if (!clientId) b.add("client");
    for (const l of d.lines) {
      if (!l.name.trim()) b.add(`${l.key}:name`);
      if (l.kind === "item") {
        if (!(Number(l.quantity) >= 0) || l.quantity === "") b.add(`${l.key}:qty`);
        if (!Number.isFinite(dollarsToCents(l.price)) || dollarsToCents(l.price) < 0) b.add(`${l.key}:price`);
      }
    }
    return b;
  }

  async function persist(): Promise<Id<"quotes"> | null> {
    const flags = validate();
    setBad(flags);
    if (flags.size) {
      setError("Some fields need attention. They are marked in red.");
      const first = flags.has("title") ? "qb-title" : flags.has("client") ? "qb-client" : null;
      (first ? document.getElementById(first) : document.querySelector(".qb-line .bad input, .qb-line .bad textarea"))?.scrollIntoView({ block: "center" });
      (first ? document.getElementById(first) : document.querySelector<HTMLElement>(".qb-line .bad input, .qb-line .bad textarea"))?.focus();
      return null;
    }
    setError("");
    const m = moneyOf(d);
    let id = quote?.id as Id<"quotes"> | undefined;
    if (!id) id = await create({ businessId: business._id, clientId: clientId!, ...(d.opportunityId ? { opportunityId: d.opportunityId } : {}), title: d.title });
    await save({
      id, title: d.title, salesperson: d.salesperson, introHeading: d.introHeading, introText: d.introText, ...(d.introImageId ? { introImageId: d.introImageId } : {}),
      lines: d.lines.map((l) => ({
        ...(l.id ? { id: l.id } : {}), kind: l.kind, name: l.name, description: l.description, ...(l.imageId ? { imageId: l.imageId } : {}), quantity: l.kind === "text" ? 1 : Number(l.quantity),
        unitPriceCents: l.kind === "text" ? 0 : dollarsToCents(l.price), optional: l.optional, selected: l.selected, ...(l.catalogueName ? { catalogueName: l.catalogueName } : {}),
      })),
      ...(m.discountKind ? { discountKind: m.discountKind, discountValue: m.discountValue } : {}), ...(m.taxPercent ? { taxPercent: m.taxPercent } : {}),
      ...(m.depositKind ? { depositKind: m.depositKind, depositValue: m.depositValue } : {}),
      clientView: d.clientView, clientMessage: d.showMessage ? d.clientMessage : "", contract: d.contract ?? contractDefault ?? "", applyContractToFuture: d.applyContract, disclaimers: d.disclaimers,
    });
    setBaseline(JSON.stringify(d));
    return id;
  }

  async function run(after: "view" | "send" | "awaiting") {
    setBusy(true);
    try {
      const id = await persist();
      if (!id) return setBusy(false);
      if (after === "send") {
        await send({ id, now: clock() });
        router.push(`/quotes/${id}?link=1`);
      } else {
        if (after === "awaiting") await markAwaiting({ id, now: clock() });
        router.push(`/quotes/${id}`);
      }
    } catch (e) {
      setError(failure(e, "The quote could not be saved. Try again."));
      setBusy(false);
    }
  }

  async function pickIntro(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("The picture has to be an image.");
    try {
      const id = await uploadFile(await uploadUrl({ businessId: business._id }), file);
      set({ introImageId: id, introImageUrl: URL.createObjectURL(file) });
    } catch (e) {
      toast(failure(e, "The picture could not be uploaded."));
    }
  }

  async function addFile(file: File | undefined) {
    if (!file || !quote) return;
    try {
      const id = await uploadFile(await uploadUrl({ businessId: business._id }), file);
      await addAttachment({ quoteId: quote.id, storageId: id, name: file.name });
    } catch (e) {
      toast(failure(e, "The file could not be added."));
    }
  }

  const cancel = () => (dirty ? setLeaving(true) : router.push(quote ? `/quotes/${quote.id}` : "/quotes"));
  const personNames = people?.map((p) => p.name) ?? [];
  const view = d.clientView;
  /** With a section chosen (a pencil on the quote page) only that section is on screen; the rest of the quote is saved as it was. */
  const only = (s: Section) => !section || section === s;

  return (
    <div className="qb fade-in">
      <div className="qb-top">
        <h1><Icon name="quote" size={26} /> {quote ? `Edit quote #${quote.number}${section ? ` · ${SECTION_TITLE[section]}` : ""}` : "New Quote"}</h1>
      </div>
      {error && <p className="qb-error" role="alert">{error}</p>}

      {only("details") && (
      <section className="qb-card qb-head">
        <div className={`field${bad.has("title") ? " bad" : ""}`}>
          <label htmlFor="qb-title">Title</label>
          <input id="qb-title" aria-invalid={bad.has("title")} maxLength={200} value={d.title} onChange={(e) => { set({ title: e.target.value }); setBad((b) => { const n = new Set(b); n.delete("title"); return n; }); }} />
          <span className="err">Give the quote a title.</span>
        </div>
        <div className="qb-headgrid">
          <div className="qb-left">
            <div className={`field${bad.has("client") ? " bad" : ""}`}>
              <label htmlFor="qb-client">Client</label>
              {quote || clientId ? (
                <div className="sc-picked">
                  <span>{clientName || "Selected client"}</span>
                  {!quote && !presetClient && <button type="button" className="icon-btn" aria-label="Choose a different client" onClick={() => set({ clientId: undefined, clientName: "", opportunityId: undefined })}><Icon name="x" size={18} /></button>}
                </div>
              ) : (
                <>
                  <input id="qb-client" aria-invalid={bad.has("client")} placeholder="Select a client" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} autoComplete="off" />
                  {clientQuery.trim() && found && (
                    <div className="sc-results" role="listbox">
                      {found.rows.length === 0 && <div className="menu-empty">No clients match</div>}
                      {found.rows.map((c) => (
                        <button key={c._id} type="button" role="option" aria-selected={false} onClick={() => { set({ clientId: c._id, clientName: c.name }); setClientQuery(""); setBad((b) => { const n = new Set(b); n.delete("client"); return n; }); }}>
                          <b>{c.name}</b> <span>{[c.street1, c.city].filter(Boolean).join(", ")}</span>
                        </button>
                      ))}
                      <button type="button" className="sc-newclient" onClick={() => setAddingClient(true)}><Icon name="plus" size={16} /> New client{clientQuery.trim() ? ` "${clientQuery.trim()}"` : ""}</button>
                    </div>
                  )}
                  {!(clientQuery.trim() && found) && <button type="button" className="btn link sc-newclient-link" onClick={() => setAddingClient(true)}><Icon name="plus" size={16} /> New client</button>}
                  <span className="err">Pick the client this quote is for.</span>
                </>
              )}
            </div>
            {clientId && (
              <div className="field">
                <label htmlFor="qb-project">Project</label>
                <select id="qb-project" disabled={!!quote} value={d.opportunityId ?? ""} onChange={(e) => set({ opportunityId: (e.target.value || undefined) as Id<"opportunities"> | undefined })}>
                  <option value="">No project</option>
                  {(projects ?? []).filter((p) => p.pipeline === "Sales").map((p) => <option key={p._id} value={p._id}>{p.title} · {p.code}</option>)}
                </select>
              </div>
            )}
          </div>
          <dl className="qb-meta">
            <div><dt>Quote #</dt><dd>{quote ? quote.number : "Assigned when saved"}</dd></div>
            <div>
              <dt><label htmlFor="qb-sales">Salesperson</label></dt>
              <dd>
                <select id="qb-sales" value={d.salesperson} onChange={(e) => set({ salesperson: e.target.value })}>
                  {[...new Set([d.salesperson, ...personNames])].filter(Boolean).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </dd>
            </div>
            <div><dt>Customize</dt><dd><button type="button" className="btn" disabled data-tip="Custom fields are not available yet">Add Field</button></dd></div>
          </dl>
        </div>
      </section>
      )}

      {!section && <div className="qb-sections" role="group" aria-label="Add section">
        <span><Icon name="plus" size={16} /> Add section</span>
        <button type="button" className="chip outline" disabled data-tip="Add files from the Attachments section below">Attachments</button>
        <button type="button" className="chip outline" disabled data-tip="Not available yet">Images</button>
        <button type="button" className="chip outline" disabled data-tip="Not available yet">Reviews</button>
        <button type="button" className={`chip outline${d.showMessage ? " on" : ""}`} aria-pressed={d.showMessage} onClick={() => set({ showMessage: !d.showMessage })}>Client Message</button>
      </div>}

      {only("intro") && (
      <section className="qb-card" aria-label="Introduction">
        <h2 className="qb-h">Introduction</h2>
        <div className="qb-intro">
          <div className="qb-introtext">
            <div className="field"><label htmlFor="qb-ih">Heading</label><input id="qb-ih" value={d.introHeading} maxLength={200} onChange={(e) => set({ introHeading: e.target.value })} /></div>
            <div className="field"><label htmlFor="qb-it">Message</label><textarea id="qb-it" value={d.introText} onChange={(e) => set({ introText: e.target.value })} /></div>
          </div>
          <div className="qb-pic">
            <input ref={intro} type="file" accept="image/*" hidden onChange={(e) => { void pickIntro(e.target.files?.[0]); e.target.value = ""; }} />
            {d.introImageUrl ? (
              <div className="qb-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.introImageUrl} alt="" />
                <button type="button" className="icon-btn" aria-label="Remove the picture" onClick={() => set({ introImageId: undefined, introImageUrl: null })}><Icon name="x" size={18} /></button>
              </div>
            ) : (
              <button type="button" className="qb-add-pic" onClick={() => intro.current?.click()}><Icon name="image" size={24} /><span>Add image</span></button>
            )}
          </div>
        </div>
      </section>
      )}

      {only("lines") && <QuoteLines businessId={business._id} clientId={clientId} projectId={d.opportunityId} lines={d.lines} onChange={(lines) => set({ lines })} bad={bad} />}

      {only("lines") && (
      <section className="qb-card qb-money" aria-label="Totals">
        <div className="qb-view">
          <span><Icon name="eye" size={20} /> Client view</span>
          <fieldset>
            <legend className="sr">What the client sees</legend>
            {([["quantities", "Quantities"], ["unitPrices", "Unit prices"], ["lineTotals", "Line item totals"], ["totals", "Totals"]] as const).map(([k, label]) => (
              <label key={k} className="sc-check"><input type="checkbox" checked={view[k]} onChange={(e) => set({ clientView: { ...view, [k]: e.target.checked } })} /> {label}</label>
            ))}
          </fieldset>
        </div>
        <dl className="qb-totals">
          <div><dt>Subtotal</dt><dd>{money(totals.subtotalCents / 100)}</dd></div>
          <div className="qb-adj">
            <dt>Discount</dt>
            <dd>
              {d.discountKind === null ? (
                <button type="button" className="cj-link" onClick={() => set({ discountKind: "amount", discount: "" })}>Add Discount</button>
              ) : (
                <span className="qb-inline">
                  <select aria-label="Discount type" value={d.discountKind} onChange={(e) => set({ discountKind: e.target.value as "amount" | "percent", discount: "" })}><option value="amount">$</option><option value="percent">%</option></select>
                  <input aria-label="Discount" inputMode="decimal" value={d.discount} placeholder={d.discountKind === "amount" ? "0.00" : "0"} onChange={(e) => set({ discount: e.target.value.replace(/[^0-9.]/g, "") })} />
                  <button type="button" className="icon-btn" aria-label="Remove the discount" onClick={() => set({ discountKind: null, discount: "" })}><Icon name="trash" size={18} /></button>
                  <b>-{money(totals.discountCents / 100)}</b>
                </span>
              )}
            </dd>
          </div>
          <div className="qb-adj">
            <dt>Tax</dt>
            <dd>
              {d.tax === "" ? (
                <button type="button" className="cj-link" onClick={() => set({ tax: "0" })}>Add Tax</button>
              ) : (
                <span className="qb-inline">
                  <input aria-label="Tax percent" inputMode="decimal" value={d.tax} onChange={(e) => set({ tax: e.target.value.replace(/[^0-9.]/g, "") })} /> %
                  <button type="button" className="icon-btn" aria-label="Remove the tax" onClick={() => set({ tax: "" })}><Icon name="trash" size={18} /></button>
                  <b>{money(totals.taxCents / 100)}</b>
                </span>
              )}
            </dd>
          </div>
          <div className="qb-total"><dt>Total</dt><dd>{money(totals.totalCents / 100)}</dd></div>
          <div className="qb-adj">
            <dt>Deposit</dt>
            <dd>
              {d.depositKind === null ? (
                <button type="button" className="cj-link" onClick={() => set({ depositKind: "percent", deposit: "" })}>Add Deposit or Payment Schedule</button>
              ) : (
                <span className="qb-inline">
                  <select aria-label="Deposit type" value={d.depositKind} onChange={(e) => set({ depositKind: e.target.value as "percent" | "amount", deposit: "" })}><option value="percent">% of total</option><option value="amount">$ amount</option></select>
                  <input aria-label="Deposit" inputMode="decimal" value={d.deposit} placeholder={d.depositKind === "amount" ? "0.00" : "0"} onChange={(e) => set({ deposit: e.target.value.replace(/[^0-9.]/g, "") })} />
                  <button type="button" className="icon-btn" aria-label="Remove the deposit" onClick={() => set({ depositKind: null, deposit: "" })}><Icon name="trash" size={18} /></button>
                  <b>{money(totals.depositCents / 100)}</b>
                </span>
              )}
            </dd>
          </div>
        </dl>
        {d.lines.some((l) => !Number.isFinite(lineCents(l))) && <p className="sc-warn">A quantity or a price is not a number, so the totals are not final.</p>}
      </section>
      )}

      {(section === "message" || (!section && d.showMessage)) && (
        <section className="qb-card" aria-label="Client message">
          <h2 className="qb-h">Client Message</h2>
          <div className="field"><label htmlFor="qb-msg">Message shown on the quote</label><textarea id="qb-msg" value={d.clientMessage} onChange={(e) => set({ clientMessage: e.target.value, ...(section === "message" ? { showMessage: true } : {}) })} /></div>
        </section>
      )}

      {only("attachments") && (
      <section className="qb-card" aria-label="Attachments">
        <h2 className="qb-h">Attachments</h2>
        {quote ? (
          <>
            <input ref={attach} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { void addFile(e.target.files?.[0]); e.target.value = ""; }} />
            {quote.attachments.length === 0 && <p className="sc-muted">Site plans, drawings and other files the client should see.</p>}
            <ul className="qb-files">
              {quote.attachments.map((a) => (
                <li key={a.id}>
                  <Icon name="file" size={20} />
                  <a href={a.url ?? undefined} target="_blank" rel="noreferrer">{a.name}</a>
                  <button type="button" className="icon-btn" aria-label={`Remove ${a.name}`} onClick={() => void removeAttachment({ id: a.id }).catch((e) => toast(failure(e, "The file could not be removed.")))}><Icon name="trash" size={18} /></button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn" onClick={() => attach.current?.click()}><Icon name="upload" size={16} /> Add a file (PDF or image)</button>
          </>
        ) : (
          <p className="sc-muted">Save the quote first, then come back here to attach site plans and files.</p>
        )}
      </section>
      )}

      {only("contract") && (
      <section className="qb-card" aria-label="Contract / Disclaimer">
        <h2 className="qb-h">Contract / Disclaimer</h2>
        <div className="field"><label htmlFor="qb-contract">Description</label><textarea id="qb-contract" value={d.contract ?? contractDefault ?? ""} onChange={(e) => set({ contract: e.target.value })} /></div>
        <label className="sc-check"><input type="checkbox" checked={d.applyContract} onChange={(e) => set({ applyContract: e.target.checked })} /> Apply to all future quotes</label>
        <DisclaimerPicker businessId={business._id} chosen={d.disclaimers} onChange={(disclaimers) => set({ disclaimers })} />
      </section>
      )}

      <div className="qb-bar">
        <button type="button" className="btn plain" onClick={cancel} disabled={busy}>Cancel</button>
        <div className="qb-save">
          <button type="button" className="btn primary" disabled={busy || !staff.canEdit} onClick={() => void run("view")}>{busy ? "Saving…" : section ? "Save" : "Save Quote"}</button>
          {!section && <SaveMenu disabled={busy || !staff.canEdit} onSend={() => void run("send")} onAwaiting={() => void run("awaiting")} />}
        </div>
      </div>

      {leaving && (
        <PipelineModal title="Leave without saving?" onClose={() => setLeaving(false)}>
          {(close) => (
            <div>
              <p className="modal-lead">You have changes that are not saved. If you leave now they are lost.</p>
              <div className="modal-foot">
                <button type="button" className="btn plain" onClick={close}>Keep editing</button>
                <button type="button" className="btn danger" onClick={() => { setBaseline(JSON.stringify(d)); router.push(quote ? `/quotes/${quote.id}` : "/quotes"); }}>Discard changes</button>
              </div>
            </div>
          )}
        </PipelineModal>
      )}
      {addingClient && (
        <NewClientDialog
          businessId={business._id}
          typed={clientQuery}
          onClose={() => setAddingClient(false)}
          onCreated={(c) => { set({ clientId: c.id, clientName: c.name }); setClientQuery(""); setBad((b) => { const n = new Set(b); n.delete("client"); return n; }); toast("Client saved."); }}
        />
      )}
    </div>
  );
}

/** "Saved disclaimers": the business's library, with a tick box for each. Ticking one attaches a copy of its wording to the quote. The contract text
 *  box above stays for anything typed by hand. The starter wording is added to a new business's library the first time this opens. */
function DisclaimerPicker({ businessId, chosen, onChange }: { businessId: Id<"businesses">; chosen: DisclaimerCopy[]; onChange: (next: DisclaimerCopy[]) => void }) {
  const staff = useStaff();
  const library = useQuery(api.crm.disclaimers.list, { businessId });
  const seed = useMutation(api.crm.disclaimers.ensureDefaults);
  const seeding = useRef(false);
  useEffect(() => {
    if (!library || library.seeded || !staff.canEdit || seeding.current) return;
    seeding.current = true;
    void seed({ businessId, now: Date.now() }).catch(() => { seeding.current = false; });
  }, [library, staff.canEdit, seed, businessId]);
  const canManage = staff.isAdmin || staff.roles.includes("office");
  const has = (title: string) => chosen.some((c) => sameTitle(c.title, title));
  const toggle = (item: DisclaimerCopy) => onChange(has(item.title) ? chosen.filter((c) => !sameTitle(c.title, item.title)) : [...chosen, { title: item.title, text: item.text }]);
  // Attached ones whose library entry was renamed or deleted since still show, so they can be removed.
  const orphans = library ? chosen.filter((c) => !library.items.some((i) => sameTitle(i.title, c.title))) : [];
  return (
    <div className="qb-disc">
      <div className="qb-disc-head">
        <b>Saved disclaimers</b>
        <span>Tick the ones to attach to this quote.{canManage && <> <Link href="/settings/disclaimers">Manage disclaimers</Link></>}</span>
      </div>
      {library === undefined ? (
        <div className="sk" style={{ height: 44 }} />
      ) : library.items.length === 0 && orphans.length === 0 ? (
        <p className="sc-muted">{library.seeded ? "There are no saved disclaimers yet." : "Getting the starter disclaimers ready…"}</p>
      ) : (
        <ul className="qb-disc-list">
          {library.items.map((i) => (
            <li key={i.id}>
              <label className="sc-check">
                <input type="checkbox" checked={has(i.title)} onChange={() => toggle(i)} />
                <span><b>{i.title}</b><small>{i.text}</small></span>
              </label>
            </li>
          ))}
          {orphans.map((o) => (
            <li key={`o-${o.title}`}>
              <label className="sc-check">
                <input type="checkbox" checked onChange={() => toggle(o)} />
                <span><b>{o.title}</b><small>{o.text}</small><em>Not in the library any more. Untick to remove it from this quote.</em></span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The arrow next to Save Quote: "Save and..." choices, as in Jobber. Email and text delivery come with the Zoho connection. */
function SaveMenu({ disabled, onSend, onAwaiting }: { disabled: boolean; onSend: () => void; onAwaiting: () => void }) {
  const { dropdown } = useUI();
  return (
    <button
      type="button"
      className="btn primary qb-arrow"
      aria-label="More ways to save"
      disabled={disabled}
      onClick={(e) =>
        dropdown(
          e.currentTarget,
          [
            { heading: "Save and..." },
            { label: "Create the client link", icon: "newtab", onSelect: onSend },
            { label: "Send as Email", icon: "mail", disabled: true },
            { label: "Send as Text Message", icon: "sms", disabled: true },
            { label: "Convert to Job", icon: "hammer", iconColor: "var(--green)", disabled: true },
            { label: "Mark as Awaiting Response", icon: "timeline", onSelect: onAwaiting },
          ],
          { alignRight: true },
        )
      }
    >
      <Icon name="chevdown" size={18} />
    </button>
  );
}

/** The client named in the address, read once for its name. */
function useConvexClient(id: Id<"clients"> | undefined) {
  const [doc, setDoc] = useState<{ name: string } | null>(null);
  const convex = useConvex();
  useEffect(() => {
    if (!id) return;
    let live = true;
    void convex.query(api.crm.clients.get, { id }).then((c) => { if (live && c) setDoc({ name: c.name }); });
    return () => { live = false; };
  }, [id, convex]);
  return doc;
}
