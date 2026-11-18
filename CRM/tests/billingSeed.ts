/// <reference types="vite/client" />
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { NOW, seeded } from "./pipelineSeed";

const view = { quantities: true, unitPrices: true, lineTotals: true, accountBalance: true, lateStamp: true };
export const line = (name = "Turf", quantity = 1, unitPriceCents = 100_000) => ({ name, description: "", quantity, unitPriceCents });
export const body = (over: Record<string, unknown> = {}) => ({
  subject: "Test", termsKey: "net_30", salesperson: "Olga Office", clientMessage: "", contract: "", clientView: view, lines: [line()], ...over,
});

/** The seeded world plus an Office person who handles money, and a second client in the same business. */
export async function billingWorld() {
  const w = await seeded();
  const otherClient = (await w.base.run(async (ctx) => (await ctx.db.query("clients").collect()).find((c) => c.businessId === w.qft && c._id !== w.clientId)!._id)) as Id<"clients">;
  const make = (over: Record<string, unknown> = {}, who: typeof office = office) =>
    who.mutation(api.crm.invoices.create, { businessId: w.qft, clientId: w.clientId, now: NOW, ...body(over) });
  const office = w.office;
  return { ...w, otherClient, make };
}

