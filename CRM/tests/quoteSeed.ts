/// <reference types="vite/client" />
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { seeded } from "./pipelineSeed";

export const item = (name: string, quantity: number, unitPriceCents: number) => ({ kind: "item" as const, name, description: "", quantity, unitPriceCents, optional: false, selected: true });
export const full = (over: Record<string, unknown> = {}) => ({
  title: "Back yard turf", salesperson: "Sam Sales", introHeading: "", introText: "", lines: [item("Turf", 2, 50000)], clientView: { quantities: true, unitPrices: true, lineTotals: true, totals: true },
  clientMessage: "", contract: "Valid 30 days.", applyContractToFuture: false, ...over,
});

/** A saved quote with one $1,000 line, linked to the test project. */
export async function quoteWorld(over: Record<string, unknown> = {}) {
  const w = await seeded();
  const quoteId = await w.sales.mutation(api.crm.quoteDraft.create, { businessId: w.qft, clientId: w.clientId, opportunityId: w.project, title: "Turf", now: 100 });
  await w.sales.mutation(api.crm.quoteDraft.save, { id: quoteId, ...full(over) });
  const store = (bytes: number, type: string) => w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type }))) as Promise<Id<"_storage">>;
  return { ...w, quoteId, store };
}


/** The test project's quote, approved and signed in person (and, with `deposit`, with a deposit asked for). Returns the quote id. */
export async function signedQuote(w: Awaited<ReturnType<typeof seeded>>, over: Record<string, unknown> = {}) {
  const id = await w.sales.mutation(api.crm.quoteDraft.create, { businessId: w.qft, clientId: w.clientId, opportunityId: w.project, title: "Turf", now: 100 });
  await w.sales.mutation(api.crm.quoteDraft.save, { id, ...full(over) });
  const sig = (await w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(500)], { type: "image/png" })))) as Id<"_storage">;
  await w.sales.mutation(api.crm.quoteFlow.collectSignature, { id, signedBy: "Pat Client", signatureStorageId: sig, now: 200 });
  return id;
}
