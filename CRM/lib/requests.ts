"use client";

/* Requests (D-039). A request is NOT its own record: it is a project in the Sales pipeline, seen through its early
   stages. The status below is derived from the project's stage, so moving the project moves the request.
   Today the projects are sample ones, one per client, matching the Related projects table on the client page. */

import { useMemo } from "react";
import { useBusinessClients } from "./clients";
import { shortCode } from "./format";
import { SALES_STAGES, type Client } from "./sample-data";

export type RequestStatus = "New" | "Overdue" | "Consultation" | "Converted" | "Lost";
export const REQUEST_STATUSES: RequestStatus[] = ["New", "Overdue", "Consultation", "Converted", "Lost"];

/** A New Request still untouched after this many days counts as Overdue. Our assumption; the PRD gives no number. */
export const OVERDUE_AFTER_DAYS = 21;

const SERVICES = ["Turf installation", "Putting green", "Patio pavers", "Fire pit and patio", "Turf for pets", "Drainage and base prep"];

export type RequestRow = {
  id: number;
  client: Client;
  title: string;
  code: string;
  stage: string;
  status: RequestStatus;
  /** Days since the request came in. */
  daysAgo: number;
  property: string;
};

export function statusFor(stageIndex: number, daysAgo: number): RequestStatus {
  if (stageIndex === 0) return daysAgo > OVERDUE_AFTER_DAYS ? "Overdue" : "New";
  if (stageIndex <= 2) return "Consultation"; // Schedule Onsite Consultation, Onsite Consultation
  if (SALES_STAGES[stageIndex] === "Closed Lost") return "Lost";
  return "Converted"; // quoting, proposal, contract, Closed Won: the request became a real project
}

export function toRequest(c: Client): RequestRow {
  const stageIndex = c.id % SALES_STAGES.length; // same rule as the client page
  const daysAgo = c.daysAgo + 2;
  return {
    id: c.id,
    client: c,
    title: SERVICES[c.id % SERVICES.length],
    code: shortCode(c.id),
    stage: SALES_STAGES[stageIndex],
    status: statusFor(stageIndex, daysAgo),
    daysAgo,
    property: c.street1 ? `${c.street1}, ${c.city}, ${c.state} ${c.zip}` : "",
  };
}

/** The selected business's requests. */
export function useRequests(): RequestRow[] {
  const clients = useBusinessClients();
  return useMemo(() => clients.map(toRequest), [clients]);
}
