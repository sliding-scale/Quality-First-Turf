"use client";

/* Settings → Export data (plan 2026-11-20-export): one CSV per kind of record, for the whole business. lib/download-export.ts asks the backend
   page after page and builds the file. */

import { useConvex, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/lib/clients";
import { downloadExport } from "@/lib/download-export";
import { failure } from "@/lib/pipeline";
import { CatalogueSkeleton } from "./skeletons";
import { useUI } from "./ui-provider";

const KINDS = [
  { kind: "clients", title: "Clients", text: "Every client with phone, email and address, status, tags and balance." },
  { kind: "projects", title: "Projects and jobs", text: "Every project from request to archive, with its job number once it is won." },
  { kind: "quotes", title: "Quotes", text: "Every quote with its status, total and dates." },
  { kind: "invoices", title: "Invoices", text: "Every invoice with its total, what is paid and the balance." },
  { kind: "payments", title: "Payments", text: "Every payment received, by date, method and reference." },
] as const;
type Kind = (typeof KINDS)[number]["kind"];

export function ExportPage() {
  const ws = useWorkspace();
  const convex = useConvex();
  const { toast } = useUI();
  const businessId = ws.state === "ready" ? ws.business._id : undefined;
  const allowed = useQuery(api.crm.exports.allowed, businessId ? { businessId } : "skip");
  const [busy, setBusy] = useState<Kind | null>(null);
  const [progress, setProgress] = useState(0);
  if (ws.state !== "ready" || allowed === undefined) return <CatalogueSkeleton />;
  const business = ws.business;

  async function download(kind: Kind) {
    setBusy(kind);
    setProgress(0);
    try {
      const count = await downloadExport(convex, business, kind, setProgress);
      toast(`Exported ${count} ${count === 1 ? "row" : "rows"}.`);
    } catch (e) {
      toast(failure(e, "The export did not finish. Nothing was downloaded."));
    } finally {
      setBusy(null);
    }
  }

  const offered = KINDS.filter((k) => allowed.includes(k.kind));
  return (
    <div className="fade-in cat">
      <div className="page-head"><h1>Export data</h1></div>
      <p className="au-lead">Download your records as spreadsheet files (CSV) for {business.name}: the whole business, not what a list is filtered to. Dates are written year-month-day and money in dollars. Take care with the files: they hold your clients&apos; details.</p>
      {offered.length === 0 ? (
        <div className="empty-state">
          <h2>You do not have access to any exports</h2>
          <Link className="btn primary" href="/home">Back to home</Link>
        </div>
      ) : (
        <div className="ex-list">
          {offered.map((k) => (
            <section key={k.kind} className="card op-card ex-card">
              <div>
                <h2>{k.title}</h2>
                <p className="muted">{k.text}</p>
              </div>
              <button type="button" className="btn primary" disabled={busy !== null} onClick={() => void download(k.kind)}>
                {busy === k.kind ? `Exporting… ${progress}` : "Download CSV"}
              </button>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
