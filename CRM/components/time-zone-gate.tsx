"use client";

/* Applies the CRM's saved time zone (Settings > General) before anything is drawn with it. Everything that shows a date or time reads the zone
   from lib/schedule, so when the saved zone differs from the starting one the screens under here are drawn again once, with the right one. */

import { useQuery } from "convex/react";
import { Fragment } from "react";
import { api } from "@/convex/_generated/api";
import { DEFAULT_TIME_ZONE, setBusinessTimeZone } from "@/convex/crm/lib/schedule";

export function TimeZoneGate({ children }: { children: React.ReactNode }) {
  const zone = useQuery(api.crm.settings.timeZone);
  // Idempotent and only touches a module value, so it is safe during render; it has to happen before the children read it.
  if (zone !== undefined) setBusinessTimeZone(zone);
  return <Fragment key={zone && zone !== DEFAULT_TIME_ZONE ? zone : "default"}>{children}</Fragment>;
}
