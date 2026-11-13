"use client";

/* The client's quote page (D-063), at /q/<secret link>. No sign-in: the link is the key. Mobile first. The client reads the quote, ticks
   or unticks optional lines (the total follows), and then approves with a signature, asks for changes, or declines. The first time it is
   opened it records "viewed". With ?preview=1 (staff: Preview as Client) it records nothing and the answers are switched off. */

import { ConvexProvider, ConvexReactClient, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { moneyCents, quoteDate } from "@/lib/format";
import { uploadFile } from "@/lib/quotes";
import { SignaturePad } from "./signature-pad";
import { ClientQuoteSkeleton } from "./skeletons";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

/** No Clerk and no shell here: a visitor who is not signed in anywhere can use it. */
export function ClientQuoteApp({ token, preview }: { token: string; preview: boolean }) {
  if (!convex) return <main className="cq"><p>This page is not set up.</p></main>;
  return (
    <ConvexProvider client={convex}>
      <ClientQuote token={token} preview={preview} />
    </ConvexProvider>
  );
}

const message = (e: unknown, fallback: string) => (e instanceof ConvexError && typeof e.data === "string" ? e.data : fallback);

function ClientQuote({ token, preview }: { token: string; preview: boolean }) {
  const view = useQuery(api.crm.clientQuote.get, { token });
  const markViewed = useMutation(api.crm.clientQuote.markViewed);
  const uploadUrl = useMutation(api.crm.clientQuote.uploadUrl);
  const approve = useMutation(api.crm.clientQuote.approve);
  const requestChanges = useMutation(api.crm.clientQuote.requestChanges);
  const decline = useMutation(api.crm.clientQuote.decline);

  const [ticked, setTicked] = useState<Set<string> | null>(null);
  const [mode, setMode] = useState<null | "approve" | "changes" | "decline">(null);
  const [name, setName] = useState("");
  const [png, setPng] = useState<Blob | null>(null);
  const [agree, setAgree] = useState(false);
  const [text, setText] = useState("");
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<null | "approved" | "changes" | "declined">(null);

  useEffect(() => {
    if (!preview) void markViewed({ token }).catch(() => undefined);
  }, [token, preview, markViewed]);

  const optionalIds = useMemo(() => (view ? view.lines.filter((l) => l.optional).map((l) => l.id) : []), [view]);
  const chosen = ticked ?? new Set(view ? view.lines.filter((l) => l.optional && l.selected).map((l) => l.id as string) : []);
  const live = useQuery(api.crm.clientQuote.totalsFor, view?.canAnswer && view.clientView.totals ? { token, selectedLineIds: optionalIds.filter((id) => chosen.has(id)) } : "skip");

  if (view === undefined) return <ClientQuoteSkeleton />;
  if (view === null) {
    return (
      <main className="cq">
        <div className="cq-card cq-center">
          <h1>This link is not valid</h1>
          <p>The quote may have been replaced or withdrawn. Please ask the person who sent it for a new link.</p>
        </div>
      </main>
    );
  }

  const canAnswer = view.canAnswer && !preview;
  // The contract text and any saved disclaimers are one thing to read and agree to.
  const hasTerms = !!view.contract || view.disclaimers.length > 0;
  const totals = live ?? view.totals;
  const reset = () => { setMode(null); setError(""); setBad({}); setBusy(false); };

  async function submitApprove() {
    const next = { name: !name.trim(), sig: !png, agree: hasTerms && !agree };
    setBad(next);
    if (next.name || next.sig || next.agree) return;
    setBusy(true);
    setError("");
    try {
      const id = await uploadFile(await uploadUrl({ token }), new File([png!], "signature.png", { type: "image/png" }));
      await approve({ token, signedBy: name, signatureStorageId: id as Id<"_storage">, selectedLineIds: optionalIds.filter((x) => chosen.has(x)) as Id<"quoteLineItems">[] });
      setDone("approved");
      reset();
    } catch (e) {
      setError(message(e, "We could not save your signature. Please try again."));
      setBusy(false);
    }
  }
  async function submitText(kind: "changes" | "decline") {
    if (!text.trim()) return setBad({ text: true });
    setBusy(true);
    setError("");
    try {
      if (kind === "changes") await requestChanges({ token, message: text });
      else await decline({ token, reason: text });
      setDone(kind === "changes" ? "changes" : "declined");
      reset();
    } catch (e) {
      setError(message(e, "We could not send that. Please try again."));
      setBusy(false);
    }
  }

  const status = view.status;
  return (
    <main className="cq">
      {preview && <div className="cq-preview" role="status">Preview: this is what your client sees. Nothing you do here is saved.</div>}
      <header className="cq-head">
        <div className="cq-biz">{view.businessName}</div>
        <h1>{view.title}</h1>
        <div className="cq-sub">Quote #{view.number}{view.salesperson ? ` · ${view.salesperson}` : ""}</div>
      </header>

      {done === "approved" || status === "Approved" || status === "Converted" ? (
        <div className="cq-banner good" role="status"><b>Approved and signed</b><span>{view.signedBy ? `Thank you, ${view.signedBy}.` : "Thank you."}{view.signedAt ? ` Signed ${quoteDate(view.signedAt)}.` : ""}</span></div>
      ) : done === "changes" || status === "Changes requested" ? (
        <div className="cq-banner warn" role="status"><b>You asked for changes</b>{view.changesMessage && <p>{view.changesMessage}</p>}<span>We will send you an updated quote.</span></div>
      ) : done === "declined" || status === "Rejected" ? (
        <div className="cq-banner bad" role="status"><b>You declined this quote</b>{view.rejectedReason && <p>{view.rejectedReason}</p>}<span>Thank you for letting us know.</span></div>
      ) : null}

      <section className="cq-card">
        {view.introImageUrl && <Image className="cq-hero" src={view.introImageUrl} alt="" width={760} height={400} unoptimized />}
        <p className="cq-hi">{view.clientFirstName ? `Hi ${view.clientFirstName},` : "Hello,"}</p>
        {view.introHeading && <h2>{view.introHeading}</h2>}
        {view.introText && <p className="cq-text">{view.introText}</p>}
      </section>

      <section className="cq-card" aria-label="Products and services">
        <h2>Products and services</h2>
        <ul className="cq-lines">
          {view.lines.map((l) =>
            l.kind === "text" ? (
              <li key={l.id} className="cq-textline">{l.name}</li>
            ) : (
              <li key={l.id} className={l.optional && !chosen.has(l.id) ? "off" : undefined}>
                {l.optional && (
                  <label className="cq-tick">
                    <input type="checkbox" checked={chosen.has(l.id)} disabled={!canAnswer} onChange={() => setTicked((cur) => { const n = new Set(cur ?? chosen); if (!n.delete(l.id)) n.add(l.id); return n; })} aria-label={`Include ${l.name}`} />
                  </label>
                )}
                <div className="cq-lmain">
                  <b>{l.name}{l.optional && <span className="cq-optional">Optional</span>}</b>
                  {l.description && <p>{l.description}</p>}
                  {l.imageUrl && <Image className="cq-lpic" src={l.imageUrl} alt="" width={240} height={160} unoptimized />}
                </div>
                <div className="cq-lnum">
                  {l.quantity !== null && l.unitPriceCents !== null && <span>{l.quantity} × {moneyCents(l.unitPriceCents)}</span>}
                  {l.quantity !== null && l.unitPriceCents === null && <span>Qty {l.quantity}</span>}
                  {l.totalCents !== null && <strong>{moneyCents(l.totalCents)}</strong>}
                </div>
              </li>
            ),
          )}
        </ul>
        {totals && (
          <dl className="cq-totals">
            <div><dt>Subtotal</dt><dd>{moneyCents(totals.subtotalCents)}</dd></div>
            {totals.discountCents > 0 && <div><dt>Discount</dt><dd>-{moneyCents(totals.discountCents)}</dd></div>}
            {totals.taxCents > 0 && <div><dt>Tax</dt><dd>{moneyCents(totals.taxCents)}</dd></div>}
            <div className="grand"><dt>Total</dt><dd>{moneyCents(totals.totalCents)}</dd></div>
            {totals.depositCents > 0 && <div><dt>Deposit required</dt><dd>{moneyCents(totals.depositCents)}</dd></div>}
          </dl>
        )}
      </section>

      {view.clientMessage && <section className="cq-card"><h2>Message</h2><p className="cq-text">{view.clientMessage}</p></section>}
      {view.attachments.length > 0 && (
        <section className="cq-card">
          <h2>Attachments</h2>
          <ul className="cq-files">{view.attachments.map((a) => (<li key={a.name}><a href={a.url ?? undefined} target="_blank" rel="noreferrer">{a.name}</a></li>))}</ul>
        </section>
      )}
      {hasTerms && (
        <section className="cq-card">
          <h2>Contract / Disclaimer</h2>
          {view.contract && <p className="cq-text small">{view.contract}</p>}
          {view.disclaimers.map((d) => (<div key={d.title} className="cq-disc"><h3>{d.title}</h3><p className="cq-text small">{d.text}</p></div>))}
        </section>
      )}

      {canAnswer && !mode && (
        <div className="cq-actions" role="group" aria-label="Your answer">
          <button type="button" className="cq-btn primary" onClick={() => setMode("approve")}>Approve and sign</button>
          <button type="button" className="cq-btn" onClick={() => { setText(""); setMode("changes"); }}>Request changes</button>
          <button type="button" className="cq-btn plain" onClick={() => { setText(""); setMode("decline"); }}>Decline</button>
        </div>
      )}

      {canAnswer && mode === "approve" && (
        <form className="cq-card cq-form" noValidate onSubmit={(e) => { e.preventDefault(); void submitApprove(); }}>
          <h2>Approve and sign</h2>
          {totals && <p>You are approving a total of <b>{moneyCents(totals.totalCents)}</b>.</p>}
          <div className={`cq-field${bad.name ? " bad" : ""}`}>
            <label htmlFor="cq-name">Type your full name</label>
            <input id="cq-name" autoComplete="name" aria-invalid={!!bad.name} value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setBad((b) => ({ ...b, name: false })); }} />
            <span className="cq-err">Please type your name.</span>
          </div>
          <div className={`cq-field${bad.sig ? " bad" : ""}`}>
            <label>Sign with your finger or mouse</label>
            <SignaturePad onChange={(b) => { setPng(b); setBad((x) => ({ ...x, sig: false })); }} />
            <span className="cq-err">Please sign in the box.</span>
          </div>
          {hasTerms && (
            <label className={`cq-agree${bad.agree ? " bad" : ""}`}>
              <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setBad((b) => ({ ...b, agree: false })); }} /> I have read and agree to the contract and disclaimers above.
            </label>
          )}
          {error && <p className="cq-error" role="alert">{error}</p>}
          <div className="cq-formbtns">
            <button type="button" className="cq-btn plain" onClick={reset} disabled={busy}>Cancel</button>
            <button type="submit" className="cq-btn primary" disabled={busy}>{busy ? "Saving…" : "Approve"}</button>
          </div>
        </form>
      )}

      {canAnswer && (mode === "changes" || mode === "decline") && (
        <form className="cq-card cq-form" noValidate onSubmit={(e) => { e.preventDefault(); void submitText(mode); }}>
          <h2>{mode === "changes" ? "Request changes" : "Decline this quote"}</h2>
          <div className={`cq-field${bad.text ? " bad" : ""}`}>
            <label htmlFor="cq-text">{mode === "changes" ? "What would you like changed?" : "Can you tell us why?"}</label>
            <textarea id="cq-text" aria-invalid={!!bad.text} value={text} maxLength={2000} onChange={(e) => { setText(e.target.value); setBad({}); }} />
            <span className="cq-err">{mode === "changes" ? "Please say what you would like changed." : "Please give a reason."}</span>
          </div>
          {error && <p className="cq-error" role="alert">{error}</p>}
          <div className="cq-formbtns">
            <button type="button" className="cq-btn plain" onClick={reset} disabled={busy}>Cancel</button>
            <button type="submit" className={`cq-btn ${mode === "decline" ? "danger" : "primary"}`} disabled={busy}>{busy ? "Sending…" : mode === "changes" ? "Send request" : "Decline"}</button>
          </div>
        </form>
      )}
      <footer className="cq-foot">{view.businessName}</footer>
    </main>
  );
}
