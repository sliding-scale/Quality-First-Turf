import type { Doc } from "../../_generated/dataModel";
import { catalogue, findCatalogueItem } from "../../shared/catalogue";
import { canonicalService, serviceLabel } from "../../shared/discovery";
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
  // A service the form could not plan yet (its type or size is still to come) still gets its own line, so the section is never just the
  // names of services: the price-list product for it when there is one, and the service by name when not.
  const covered = new Set(planned.lines.map((l) => catalogue.find((c) => c.name === l.name)?.service));
  const customerType = project.answers.find((x) => x.question === "Customer type")?.value === "Contractor" ? "Contractor" : "Homeowner";
  for (const name of project.services) {
    const service = canonicalService(name);
    if (covered.has(service)) continue;
    covered.add(service);
    const item = findCatalogueItem({ customerType, service });
    const price = item ? retailPrice(item) : null;
    lines.push({
      name: (item && price !== null ? item.name : serviceLabel(service)).slice(0, 200),
      description: item && price !== null ? `Priced per ${priceUnit(item)}.` : "Type and size to be confirmed at the consultation.",
      quantity: 1,
      unitPriceCents: price !== null ? Math.round(price * 100) : 0,
    });
  }
  return lines.slice(0, 50);
}
