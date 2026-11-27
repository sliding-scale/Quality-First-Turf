/* One kind of record as a CSV file, for the whole business (plan 2026-11-20-export). The backend gives the rows a page at a time
   (convex/crm/exports.ts); the file is built here, with the spreadsheet-safe cell rules of exportCsv. Used by Settings > Export data and by
   "Export Jobs / Invoices / Payments" on those lists (D-134). */

import type { ConvexReactClient } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Kind } from "@/convex/crm/exports";
import { csvFile } from "@/convex/crm/lib/exportCsv";

type Page = { headers: string[]; rows: (string | number | null)[][]; next: string | null };

/** Downloads the file and returns how many rows it holds. `progress` is told the count after each page. */
export async function downloadExport(convex: ConvexReactClient, business: { _id: Id<"businesses">; slug: string }, kind: Kind, progress?: (rows: number) => void): Promise<number> {
  const rows: Page["rows"] = [];
  let headers: string[] = [];
  let cursor: string | null = null;
  do {
    const r: Page = await convex.query(api.crm.exports.page, { businessId: business._id, kind, cursor });
    headers = r.headers;
    rows.push(...r.rows);
    cursor = r.next;
    progress?.(rows.length);
  } while (cursor !== null);
  const url = URL.createObjectURL(new Blob([csvFile(headers, rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kind}-${business.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return rows.length;
}
