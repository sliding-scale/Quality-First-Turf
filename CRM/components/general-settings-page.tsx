"use client";

/* Settings > General: settings for the whole CRM. Today that is the time zone every date, time and "today" is worked out in (user, 2026-11-25).
   An Admin changes it; everyone sees it. Saving redraws the screens in the new zone straight away. */

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { failure } from "@/lib/pipeline";
import { SettingsFormSkeleton } from "./skeletons";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

const US_ZONES: [string, string][] = [
  ["America/Los_Angeles", "Pacific Time (Los Angeles)"],
  ["America/Phoenix", "Arizona (Phoenix, no daylight saving)"],
  ["America/Denver", "Mountain Time (Denver)"],
  ["America/Chicago", "Central Time (Chicago)"],
  ["America/New_York", "Eastern Time (New York)"],
  ["America/Anchorage", "Alaska (Anchorage)"],
  ["Pacific/Honolulu", "Hawaii (Honolulu)"],
];

export function GeneralSettingsPage() {
  const saved = useQuery(api.crm.settings.timeZone);
  if (saved === undefined) return <SettingsFormSkeleton />;
  return <Form saved={saved} />;
}

function Form({ saved }: { saved: string }) {
  const { isAdmin } = useStaff();
  const { toast } = useUI();
  const save = useMutation(api.crm.settings.setTimeZone);
  const [zone, setZone] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const others = useMemo(() => {
    const us = new Set(US_ZONES.map(([id]) => id));
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return all.filter((id) => !us.has(id));
  }, []);
  const nowText = (id: string) => new Intl.DateTimeFormat("en-US", { timeZone: id, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date());

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await save({ timeZone: zone });
      toast("Time zone saved.");
    } catch (e) {
      setError(failure(e, "The time zone could not be saved."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="qb fade-in">
      <div className="qb-top"><h1>General settings</h1></div>
      <p className="sc-muted">For the whole CRM. {isAdmin ? "" : "Only an Admin can change them."}</p>
      {error && <p className="qb-error" role="alert">{error}</p>}
      <section className="qb-card">
        <div className="field">
          <label htmlFor="gs-zone">Time zone</label>
          <select id="gs-zone" value={zone} disabled={!isAdmin || busy} onChange={(e) => setZone(e.target.value)}>
            <optgroup label="United States">
              {US_ZONES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </optgroup>
            {others.length > 0 && (
              <optgroup label="Everywhere else">
                {others.map((id) => <option key={id} value={id}>{id.replace(/_/g, " ")}</option>)}
              </optgroup>
            )}
            {!US_ZONES.some(([id]) => id === zone) && !others.includes(zone) && <option value={zone}>{zone}</option>}
          </select>
        </div>
        <p className="sc-muted">Every date and time in the CRM, and what counts as &quot;today&quot; on Home, the Schedule and Tasks, uses this zone. It is {nowText(zone)} there now.</p>
      </section>
      {isAdmin && (
        <div className="qb-bar">
          <button type="button" className="btn primary" disabled={busy || zone === saved} onClick={() => void submit()}>{busy ? "Saving…" : "Save settings"}</button>
        </div>
      )}
    </div>
  );
}
