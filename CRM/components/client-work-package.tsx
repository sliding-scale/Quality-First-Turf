"use client";

/* The installer's work package page (PRD 4.3), at /w/<secret link>. No sign-in: the link is the key, and it expires. Mobile first, in the look of
   the quote page (client-quote.css). Read-only: scope, schedule, site access, the crew, materials, the installer budget and the chosen files. */

import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { moneyCents, quoteDateTime } from "@/lib/format";
import { dayLabel } from "./work-package-tab";
import { WorkPackageSkeleton } from "./skeletons";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

export function ClientWorkPackageApp({ token }: { token: string }) {
  if (!convex) return <main className="cq"><p>This page is not set up.</p></main>;
  return (
    <ConvexProvider client={convex}>
      <ClientWorkPackage token={token} />
    </ConvexProvider>
  );
}

function Notes({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <section className="cq-card">
      <h2>{title}</h2>
      <p className="cq-text" style={{ whiteSpace: "pre-wrap" }}>{text}</p>
    </section>
  );
}

function ClientWorkPackage({ token }: { token: string }) {
  const w = useQuery(api.crm.clientWorkPackage.get, { token });
  if (w === undefined) return <WorkPackageSkeleton />;
  if (w === null) {
    return (
      <main className="cq">
        <div className="cq-card cq-center">
          <h1>This link is not valid</h1>
          <p>It may have expired, been turned off, or replaced by a newer one. Please ask the office for a new link.</p>
        </div>
      </main>
    );
  }
  const dates = [w.targetStartDate !== null && `Target start ${dayLabel(w.targetStartDate)}`, w.startDate !== null && `Install ${dayLabel(w.startDate)}${w.endDate !== null ? ` to ${dayLabel(w.endDate)}` : ""}`].filter(Boolean);
  return (
    <main className="cq wp-public">
      <header className="cq-head">
        <div className="cq-biz">{w.businessName}</div>
        <h1>Work package</h1>
        <div className="cq-sub">{w.title} · {w.code}</div>
        {w.address && <div className="cq-sub">{w.address}</div>}
      </header>

      <Notes title="Scope of work" text={w.scope} />
      {(dates.length > 0 || w.scheduleNotes) && (
        <section className="cq-card">
          <h2>Schedule</h2>
          {dates.map((d) => <p key={String(d)} className="cq-text"><b>{d}</b></p>)}
          {w.scheduleNotes && <p className="cq-text" style={{ whiteSpace: "pre-wrap" }}>{w.scheduleNotes}</p>}
        </section>
      )}
      <Notes title="Site access" text={w.siteAccess} />
      <Notes title="Customer availability" text={w.customerAvailability} />

      {(w.crews.length > 0 || w.installers.length > 0) && (
        <section className="cq-card">
          <h2>Crew</h2>
          <ul className="cq-lines">
            {w.crews.map((c) => <li key={c.name} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}><div className="cq-lmain"><b>{c.name}</b>{(c.leadName || c.phone) && <span>{[c.leadName && `Lead: ${c.leadName}`, c.phone].filter(Boolean).join(" · ")}</span>}</div></li>)}
            {w.installers.map((n) => <li key={n} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}><div className="cq-lmain"><b>{n}</b></div></li>)}
          </ul>
        </section>
      )}

      {w.materials.length > 0 && (
        <section className="cq-card">
          <h2>Materials</h2>
          <ul className="cq-lines">
            {w.materials.map((m) => (
              <li key={m.name} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                <div className="cq-lmain"><b>{m.name}</b></div>
                <div className="cq-lnum"><span>{m.qty} {m.unit}</span></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {w.budget.length > 0 && (
        <section className="cq-card">
          <h2>Installer budget</h2>
          <ul className="cq-lines">
            {w.budget.map((b, i) => (
              <li key={i} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                <div className="cq-lmain"><b>{b.description}</b><span>{b.quantity} {b.unit} at {moneyCents(b.rateCents)}</span></div>
                <div className="cq-lnum"><span>{moneyCents(b.totalCents)}</span></div>
              </li>
            ))}
          </ul>
          <p className="cq-text"><b>Total: {moneyCents(w.budgetTotalCents)}</b></p>
        </section>
      )}

      <Notes title="Notes" text={w.installerNotes} />

      {w.files.length > 0 && (
        <section className="cq-card">
          <h2>Drawings, specifications and photos</h2>
          <div className="wp-gallery">
            {w.files.map((f) =>
              f.contentType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs of any host; no optimiser
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.name} loading="lazy" /><span>{f.name}</span></a>
              ) : (
                <a key={f.url} className="wp-doc" href={f.url} target="_blank" rel="noreferrer">{f.name}</a>
              ),
            )}
          </div>
        </section>
      )}

      <footer className="cq-sub wp-foot">
        Updated {quoteDateTime(w.updatedAt)}{w.expiresAt ? ` · this link works until ${quoteDateTime(w.expiresAt)}` : ""}
        <div><button type="button" className="cq-btn" onClick={() => window.print()}>Print</button></div>
      </footer>
    </main>
  );
}
