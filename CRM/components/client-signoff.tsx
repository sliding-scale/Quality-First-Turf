"use client";

/* The customer's completion sign-off page (D-081), at /signoff/<secret link>. No sign-in: the link is the key. Mobile first, in the look of
   the quote page (client-quote.css). The customer reads the summary and the punch list as it was when the sign-off was made, types their
   name and signs. Once signed the link stops working, so this page keeps its own thank-you. */

import { ConvexProvider, ConvexReactClient, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { quoteDate } from "@/lib/format";
import { uploadFile } from "@/lib/quotes";
import { SignaturePad } from "./signature-pad";
import { ClientSignoffSkeleton } from "./skeletons";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

export function ClientSignoffApp({ token }: { token: string }) {
  if (!convex) return <main className="cq"><p>This page is not set up.</p></main>;
  return (
    <ConvexProvider client={convex}>
      <ClientSignoff token={token} />
    </ConvexProvider>
  );
}

const message = (e: unknown, fallback: string) => (e instanceof ConvexError && typeof e.data === "string" ? e.data : fallback);
const STATUS = { open: "Open", fixed: "Fixed", verified: "Verified" } as Record<string, string>;

function ClientSignoff({ token }: { token: string }) {
  const view = useQuery(api.crm.clientSignoff.get, { token });
  const uploadUrl = useMutation(api.crm.clientSignoff.uploadUrl);
  const sign = useMutation(api.crm.clientSignoff.sign);
  const [name, setName] = useState("");
  const [png, setPng] = useState<Blob | null>(null);
  const [agree, setAgree] = useState(false);
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signedBy, setSignedBy] = useState<string | null>(null);
  // The question is asked once; the thank-you is shown even after the link has closed behind the signature.
  const [signedOn] = useState(() => quoteDate(Date.now()));

  if (signedBy !== null) {
    return (
      <main className="cq">
        <div className="cq-card cq-center">
          <h1>Thank you, {signedBy}</h1>
          <p>Your sign-off is recorded ({signedOn}). The team has been told, and your project is complete.</p>
        </div>
      </main>
    );
  }
  if (view === undefined) return <ClientSignoffSkeleton />;
  if (view === null) {
    return (
      <main className="cq">
        <div className="cq-card cq-center">
          <h1>This link is not valid</h1>
          <p>It may have been used already, or replaced by a newer one. Please ask the person who sent it for a new link.</p>
        </div>
      </main>
    );
  }

  async function submit() {
    const next = { name: !name.trim(), sig: !png, agree: !agree };
    setBad(next);
    if (next.name || next.sig || next.agree) return;
    setBusy(true);
    setError("");
    try {
      const id = await uploadFile(await uploadUrl({ token }), new File([png!], "signature.png", { type: "image/png" }));
      await sign({ token, signedBy: name, signatureStorageId: id as Id<"_storage"> });
      setSignedBy(name.trim());
    } catch (e) {
      setError(message(e, "We could not save your signature. Please try again."));
      setBusy(false);
    }
  }

  const required = view.punch.filter((p) => p.required);
  return (
    <main className="cq">
      <header className="cq-head">
        <div className="cq-biz">{view.businessName}</div>
        <h1>Completion sign-off</h1>
        <div className="cq-sub">{view.title} · {view.code}{view.address ? ` · ${view.address}` : ""}</div>
      </header>

      <section className="cq-card">
        <p className="cq-hi">{view.clientName ? `Hi ${view.clientName.split(" ")[0]},` : "Hello,"}</p>
        <p className="cq-text">Your project is finished. Please read the summary below and sign to confirm the work is complete.</p>
        {view.summary && <p className="cq-text">{view.summary}</p>}
      </section>

      {view.punch.length > 0 && (
        <section className="cq-card" aria-label="Punch list">
          <h2>Punch list</h2>
          <p className="cq-text small">{required.length} required item{required.length === 1 ? "" : "s"}, all checked by our project manager.</p>
          <ul className="cq-lines">
            {view.punch.map((p, i) => (
              <li key={i} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                <div className="cq-lmain"><b>{p.title}{!p.required && <span className="cq-optional">Optional</span>}</b></div>
                <div className="cq-lnum"><span>{STATUS[p.status] ?? p.status}</span></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="cq-card cq-form" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <h2>Sign to confirm</h2>
        <div className={`cq-field${bad.name ? " bad" : ""}`}>
          <label htmlFor="so-name">Type your full name</label>
          <input id="so-name" autoComplete="name" aria-invalid={!!bad.name} maxLength={100} value={name} onChange={(e) => { setName(e.target.value); setBad((b) => ({ ...b, name: false })); }} />
          <span className="cq-err">Type your name to sign.</span>
        </div>
        <div className={`cq-field${bad.sig ? " bad" : ""}`}>
          <label>Your signature</label>
          <SignaturePad onChange={(b) => { setPng(b); setBad((x) => ({ ...x, sig: false })); }} />
          <span className="cq-err">Sign in the box.</span>
        </div>
        <label className={`cq-agree${bad.agree ? " bad" : ""}`}>
          <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setBad((b) => ({ ...b, agree: false })); }} />
          <span>I confirm the work is complete and the items above are done.</span>
        </label>
        {error && <p className="cq-error" role="alert">{error}</p>}
        <div className="cq-actions"><button type="submit" className="cq-btn primary" disabled={busy}>{busy ? "Saving…" : "Sign off"}</button></div>
      </form>
    </main>
  );
}
