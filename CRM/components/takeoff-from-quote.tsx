"use client";

/* The Takeoff tab's "From the quote" card (D-137). Each quoted service is linked once to the material kits it needs, and to what its quoted
   quantity measures; the link is kept for every later job. Fill the takeoff then adds those materials, sized from the quote and the visit. */

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LINK_MEASURE_LABEL, LINK_MEASURES, type LinkMeasure } from "@/convex/crm/lib/takeoffLinks";
import { clock, failure } from "@/lib/pipeline";
import { Icon } from "./icon";
import { useUI } from "./ui-provider";

export function FromQuote({ id, kits, canEdit }: { id: Id<"opportunities">; kits: { id: Id<"materialKits">; name: string; group: string }[]; canEdit: boolean }) {
  const { toast } = useUI();
  const data = useQuery(api.crm.takeoff.fromQuote, { id });
  const link = useMutation(api.crm.takeoff.linkService);
  const fill = useMutation(api.crm.takeoff.fill);
  const [busy, setBusy] = useState(false);

  if (data === undefined) return <section className="card op-card op-wide" aria-busy="true"><div className="sk" style={{ height: 90 }} /></section>;
  if (data === null) return null;

  const set = (name: string, kitIds: Id<"materialKits">[], measure: LinkMeasure) =>
    void link({ id, name, kitIds, measure, now: clock() }).catch((e) => toast(failure(e, "The link could not be saved.")));

  async function run() {
    setBusy(true);
    try {
      const r = await fill({ id, now: clock() });
      const parts = [r.added ? `Added ${r.added} material${r.added === 1 ? "" : "s"}` : "No new materials to add"];
      if (r.measured) parts.push("measurements filled in");
      toast(`${parts.join(", ")}.${r.unlinked.length ? ` ${r.unlinked.length} service${r.unlinked.length === 1 ? " has" : "s have"} no kit yet.` : ""}`);
    } catch (e) {
      toast(failure(e, "The takeoff could not be filled."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card op-card op-wide tk-quote tk-noprint" aria-labelledby="tk-quote">
      <div className="op-sechead">
        <h2 id="tk-quote">From the quote{data.quote ? <small className="op-sub"> · #{data.quote.number}, {data.quote.status.toLowerCase()}</small> : null}</h2>
        {canEdit && <button type="button" className="btn primary" disabled={busy} onClick={() => void run()}><Icon name="import" size={16} /> {busy ? "Filling…" : "Fill the takeoff"}</button>}
      </div>
      {!data.quote ? (
        <p className="muted">This job has no approved quote. Filling takes the area and perimeter from the site visit; add materials with a kit below.</p>
      ) : data.lines.length === 0 ? (
        <p className="muted">The quote has no priced lines.</p>
      ) : (
        <>
          <p className="muted">Choose the material kits each service needs, once. Every later job with the same service uses them.</p>
          <ul className="tk-services">
            {data.lines.map((l, i) => {
              const kitIds = l.link?.kitIds ?? [];
              const measure = l.link?.measure ?? l.suggested;
              return (
                <li key={`${l.name}-${i}`}>
                  <div className="tk-service">
                    <b>{l.service}</b>
                    <small>Quoted quantity {l.quantity}{l.link?.shared ? ` · uses the link for every ${l.link.shared}` : ""}</small>
                  </div>
                  <div className="tk-kits">
                    {kitIds.map((k) => (
                      <span className="tk-kit" key={k}>
                        {kits.find((x) => x.id === k)?.name ?? "A removed kit"}
                        {canEdit && <button type="button" aria-label={`Remove the kit from ${l.service}`} onClick={() => set(l.name, kitIds.filter((x) => x !== k), measure)}><Icon name="x" size={14} /></button>}
                      </span>
                    ))}
                    {canEdit ? (
                      <select aria-label={`Add a kit to ${l.service}`} value="" onChange={(e) => e.target.value && set(l.name, [...kitIds, e.target.value as Id<"materialKits">], measure)}>
                        <option value="">{kits.length === 0 ? "No kits yet" : kitIds.length ? "Add another kit…" : "Choose a kit…"}</option>
                        {[...new Set(kits.map((k) => k.group))].map((g) => (
                          <optgroup key={g} label={g || "Other"}>{kits.filter((k) => k.group === g && !kitIds.includes(k.id)).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</optgroup>
                        ))}
                      </select>
                    ) : kitIds.length === 0 && <span className="muted">No kit</span>}
                  </div>
                  <select
                    className="tk-measure" aria-label={`What the quantity of ${l.service} measures`} disabled={!canEdit || kitIds.length === 0} value={measure}
                    data-tip={kitIds.length === 0 ? "Choose a kit first" : "What the quoted quantity is"} onChange={(e) => set(l.name, kitIds, e.target.value as LinkMeasure)}
                  >
                    {LINK_MEASURES.map((m) => <option key={m} value={m}>{LINK_MEASURE_LABEL[m]}</option>)}
                  </select>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
