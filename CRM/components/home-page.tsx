"use client";

/* Home: greeting and the workflow cards. Everything shown is computed from the selected business's real requests and quotes.
   Appointments, messages, jobs and invoices come back when those parts of the CRM are built; nothing here is placeholder content. */

import type { CSSProperties } from "react";
import { QUOTE_OPEN_STATUSES } from "@/convex/crm/lib/stages";
import { useWorkspace } from "@/lib/clients";
import { moneyCents } from "@/lib/format";
import { useQuoteStats } from "@/lib/quotes";
import { useRequestStats } from "@/lib/requests";
import { useIsClient } from "@/lib/store";
import { Icon } from "./icon";
import { HomeSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";

export function HomePage() {
  // The greeting and date depend on the visitor's clock, so they render in the browser only.
  return useIsClient() ? <Workspace /> : <HomeSkeleton />;
}

function Workspace() {
  const workspace = useWorkspace();
  if (workspace.state === "loading") return <HomeSkeleton />;
  return <Home businessId={workspace.state === "ready" ? workspace.business._id : null} />;
}

function Home({ businessId }: { businessId: import("@/convex/_generated/dataModel").Id<"businesses"> | null }) {
  if (businessId === null) return <Greeting />;
  return <Cards businessId={businessId} />;
}

function Greeting() {
  const { name } = useStaff();
  const now = new Date();
  const hour = now.getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const first = name.trim().split(/\s+/)[0] ?? "";
  return (
    <div className="home-top">
      <div className="eyebrow">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
      <h1 className="greeting">Good {part}{first ? `, ${first}` : ""}</h1>
    </div>
  );
}

function Cards({ businessId }: { businessId: import("@/convex/_generated/dataModel").Id<"businesses"> }) {
  const requests = useRequestStats(businessId);
  const quotes = useQuoteStats(businessId);
  if (requests === undefined || quotes === undefined) return <HomeSkeleton />;

  const openQuotes = QUOTE_OPEN_STATUSES.reduce((n, s) => n + quotes.counts[s], 0);
  const cards: { bar: string; icon: string; name: string; big: number; label: string; lines: [string, number | string][] }[] = [
    {
      bar: "var(--orange)", icon: "inbox", name: "Requests", big: requests.counts.New, label: "New",
      lines: [["Overdue", requests.counts.Overdue], ["Consultation", requests.counts.Consultation]],
    },
    {
      bar: "var(--burgundy)", icon: "quote", name: "Quotes", big: openQuotes, label: "Open",
      lines: [["Draft", quotes.counts.Draft], ["Awaiting response", quotes.counts["Awaiting response"]], ["Changes requested", quotes.counts["Changes requested"]], ["Approved", `${quotes.counts.Approved}`]],
    },
  ];

  return (
    <div className="fade-in">
      <Greeting />
      <h2 className="section-title" style={{ marginTop: 0 }}>Workflow</h2>
      <div className="wf-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        {cards.map((c) => (
          <div className="wf-card" key={c.name} style={{ "--bar": c.bar } as CSSProperties}>
            <div className="top">
              <Icon name={c.icon} size={20} />
              <span>{c.name}</span>
            </div>
            <div className="big">{c.big}</div>
            <div className="lbl">{c.label}</div>
            {c.lines.map((l) => (
              <div className="ln" key={l[0]}>
                <span>{l[0]}</span>
                <span>{l[1]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 18 }}>
        Converted quotes in the last 30 days: {quotes.converted.count} ({moneyCents(quotes.converted.cents)}).
      </p>
    </div>
  );
}
