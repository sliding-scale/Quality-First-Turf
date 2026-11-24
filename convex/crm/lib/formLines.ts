import type { Doc } from "../../_generated/dataModel";
import { catalogue } from "../../shared/catalogue";
import { priceUnit, retailPrice } from "../../shared/priceList";
import { planQuoteLines } from "../../shared/quoteLines";

/** The request's Product / Service lines, worked out from what the customer chose on the form (client request, 2026-11-24): the real price-list
 *  products with their quantity and price, not a list of service names. Only what the form already answers is planned (no site visit yet), so a
 *  line that needs a size nobody gave is left out. */
export function linesFromForm(project: Pick<Doc<"projects">, "services" | "products" | "answers" | "measurements">) {
  const planned = planQuoteLines({ services: project.services, products: project.products, answers: project.answers, measurements: project.measurements, workAreas: [] });
  const lines = [];
  for (const l of planned.lines) {
    if (!(l.quantity > 0)) continue;
    const item = catalogue.find((c) => c.name === l.name);
    lines.push({
      name: l.name.slice(0, 200),
      description: item ? `Priced per ${priceUnit(item)}.` : "",
      quantity: l.quantity,
      unitPriceCents: item && retailPrice(item) !== null ? Math.round((retailPrice(item) ?? 0) * 100) : 0,
    });
  }
  return lines.slice(0, 50);
}
