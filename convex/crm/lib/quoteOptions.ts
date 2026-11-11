import type { Doc } from "../../_generated/dataModel";
import type { QuoteMoneyOptions } from "./quoteMath";

/** The money options of a stored quote. An older quote only has `depositPercent`, which counts as a percent deposit. */
export function quoteMoneyOptions(q: Partial<Pick<Doc<"quotes">, "discountKind" | "discountValue" | "taxPercent" | "depositKind" | "depositValue" | "depositPercent">>): QuoteMoneyOptions {
  const legacy = q.depositKind === undefined && (q.depositPercent ?? 0) > 0;
  return {
    discountKind: q.discountKind, discountValue: q.discountValue, taxPercent: q.taxPercent,
    depositKind: legacy ? "percent" : q.depositKind, depositValue: legacy ? q.depositPercent : q.depositValue,
  };
}
