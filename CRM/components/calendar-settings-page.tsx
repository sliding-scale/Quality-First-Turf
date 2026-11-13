"use client";

/* Settings → My calendar (D-069): each person connects their own Zoho Calendar with one click. After Zoho's Allow screen the CRM and the
   person's Zoho Calendar mirror each other (events made, changed or deleted on either side show on the other). Jobber's calendar-sync
   choices are here as tick boxes. Nothing technical is shown: no tokens, no links. */

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { SYNC_TYPE_KEYS, SYNC_TYPE_LABEL, type SyncTypes } from "@/convex/crm/lib/calendarSync";
import { useWorkspace } from "@/lib/clients";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { CalendarSettingsSkeleton } from "./skeletons";
import { useUI } from "./ui-provider";

const RESULT: Record<string, string> = {
  connected: "Your Zoho Calendar is connected.",
  cancelled: "Zoho Calendar was not connected.",
  expired: "That took too long. Please try Connect again.",
  not_set_up: "Zoho Calendar is not set up on this system yet. Ask an Admin.",
  bad_server: "Zoho sent an unexpected address. Please try again.",
  no_refresh_token: "Zoho did not give the access the CRM needs. Please try again.",
  zoho: "Zoho would not connect. Please try again.",
  failed: "Something went wrong. Please try again.",
};

const ago = (ms: number | null, now: number) => {
  if (ms === null) return "not yet";
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

const readNow = () => Date.now();

export function CalendarSettingsPage() {
  const ws = useWorkspace();
  const data = useQuery(api.crm.calendarConnect.mine, {});
  const start = useMutation(api.crm.calendarConnect.start);
  const setTypes = useMutation(api.crm.calendarConnect.setSyncTypes);
  const syncNow = useMutation(api.crm.calendarConnect.syncNow);
  const disconnect = useMutation(api.crm.calendarConnect.disconnect);
  const { toast } = useUI();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const shown = useRef(false);

  // The result Zoho's round trip leaves in the address ("?zoho=connected") is said once.
  useEffect(() => {
    const r = params.get("zoho");
    if (!r || shown.current) return;
    shown.current = true;
    toast(RESULT[r] ?? RESULT.failed);
    window.history.replaceState(null, "", "/settings/calendar");
  }, [params, toast]);

  if (data === undefined || ws.state === "loading") return <CalendarSettingsSkeleton />;
  const businessId = ws.state === "ready" ? ws.business._id : undefined;
  const problem = (e: unknown, fallback: string) => toast(e instanceof ConvexError && typeof e.data === "string" ? e.data : fallback);

  async function connect() {
    if (!businessId) return;
    setBusy(true);
    try {
      const { url } = await start({ businessId, now: readNow() });
      window.location.href = url;
    } catch (e) {
      problem(e, "Could not start the connection.");
      setBusy(false);
    }
  }

  const c = data.connection;
  const types = c?.syncTypes as SyncTypes | undefined;

  return (
    <div className="fade-in mc">
      <div className="page-head"><h1>My calendar</h1></div>
      <p className="mc-lead">Connect your Zoho Calendar and it will match the calendar in the CRM: what you add, change or delete in one shows up in the other.</p>

      {!data.available && (
        <section className="card mc-card">
          <h2>Zoho Calendar is not set up yet</h2>
          <p>An Admin needs to finish the Zoho Calendar setup before you can connect. Nothing is needed from you.</p>
        </section>
      )}

      {data.available && c === null && (
        <section className="card mc-card">
          <h2><Icon name="calendar" size={22} /> Connect Zoho Calendar</h2>
          <p>You will be taken to Zoho to click <b>Allow</b>, then brought back here. It takes about ten seconds and you only do it once.</p>
          <p className="mc-note">The company calendar is shared: the team will see the events in your Zoho Calendar, with their titles, in the CRM.</p>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void connect()}>{busy ? "Opening Zoho…" : "Connect Zoho Calendar"}</button>
        </section>
      )}

      {data.available && c !== null && (
        <>
          <section className="card mc-card">
            <div className="mc-status">
              <span className={`pill ${c.status === "connected" ? "active" : "overdue"}`}><span className="dot" />{c.status === "connected" ? "Connected" : "Needs reconnecting"}</span>
              <span>{c.calendarName}</span>
            </div>
            {c.status === "connected" ? (
              <p className="mc-note">Last checked {ago(c.lastSyncAt, readNow())}. The CRM checks your Zoho Calendar every few minutes, and sends your changes straight away.</p>
            ) : (
              <p className="mc-warn" role="alert">Zoho no longer lets the CRM in. Nothing was lost. Connect again to carry on.</p>
            )}
            {c.lastError && c.status === "connected" && <p className="mc-warn" role="status">The last check had a problem: {c.lastError}</p>}
            <div className="mc-actions">
              {c.status === "connected" ? (
                <button type="button" className="btn" onClick={() => void syncNow({}).then(() => toast("Checking your Zoho Calendar now.")).catch((e) => problem(e, "Could not check now."))}>Sync now</button>
              ) : (
                <button type="button" className="btn primary" disabled={busy} onClick={() => void connect()}>Reconnect Zoho Calendar</button>
              )}
              <button type="button" className="btn plain" onClick={() => setConfirming(true)}>Disconnect</button>
            </div>
          </section>

          {types && (
            <section className="card mc-card">
              <h2>What the CRM sends to Zoho</h2>
              <p className="mc-note">Everything in your Zoho Calendar always comes into the CRM. These choose which of the CRM&apos;s items go into Zoho.</p>
              <div className="mc-types">
                {SYNC_TYPE_KEYS.map((k) => (
                  <label key={k} className="mc-type">
                    <input
                      type="checkbox"
                      checked={types[k]}
                      onChange={(e) => void setTypes({ ...types, [k]: e.target.checked }).catch((err) => problem(err, "Could not save that."))}
                    />
                    <span>{SYNC_TYPE_LABEL[k]}</span>
                  </label>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {confirming && (
        <PipelineModal title="Disconnect Zoho Calendar?" onClose={() => setConfirming(false)}>
          {(close) => (
            <div>
              <p className="modal-lead">The CRM and your Zoho Calendar stop matching. Nothing is deleted from either one: what is there now stays.</p>
              <div className="modal-foot">
                <button type="button" className="btn plain" onClick={close}>Keep it connected</button>
                <button type="button" className="btn danger" onClick={() => void disconnect({}).then(() => { toast("Zoho Calendar disconnected."); close(); }).catch((e) => problem(e, "Could not disconnect."))}>Disconnect</button>
              </div>
            </div>
          )}
        </PipelineModal>
      )}
    </div>
  );
}
