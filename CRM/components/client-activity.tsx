"use client";

/* The client page's Activity history tab (PRD 2.1, D-113): one timeline, newest first, of what happened to this client: their own changes
   (created, edited, tags, archived), notes, requests and their stage moves, quote and invoice events. The backend leaves out what the
   person may not see. */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { quoteDateTime } from "@/lib/format";
import { ClientActivitySkeleton } from "./skeletons";

export function ClientActivity({ clientId }: { clientId: Id<"clients"> }) {
  const items = useQuery(api.crm.clientActivity.list, { clientId });
  if (items === undefined) return <ClientActivitySkeleton />;
  return (
    <section className="card op-card">
      <h2>Activity history</h2>
      {items.length === 0 ? (
        <p className="op-detail">Nothing has happened to this client yet.</p>
      ) : (
        <ul className="op-tl">
          {items.map((a) => (
            <li key={a.key}>
              <i className={a.kind} aria-hidden="true" />
              <span>
                <b>{a.title}</b>{a.detail ? <span className="op-detail"> {a.detail}</span> : null}
                <small>{[a.who, quoteDateTime(a.at)].filter(Boolean).join(" · ")}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
