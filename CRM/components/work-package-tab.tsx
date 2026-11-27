"use client";

/* The project's Work package tab (PRD 4.3, plan 2026-11-20-work-packages): what an installer needs to do the job, in one place that can be printed
   or shared by a secret link that expires. The crew and installers are the project's team, chosen at the top (components/project-team.tsx); the
   install dates go on the Schedule for them when saved (D-136). The budget is priced, so only people who can see prices see or change it. The page behind the link is components/client-work-package.tsx. */

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { centsFromText } from "@/convex/crm/lib/catalogue";
import { budgetTotalCents, installDays, lineTotalCents, MAX_INSTALL_DAYS } from "@/convex/crm/lib/workPackage";
import { moneyCents, quoteDateTime } from "@/lib/format";
import { utcDate } from "@/lib/invoices";
import { clock, failure } from "@/lib/pipeline";
import { todayKey } from "@/lib/schedule";
import { Icon } from "./icon";
import { ProjectTeam } from "./project-team";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Pkg = NonNullable<FunctionReturnType<typeof api.crm.workPackages.get>>;
type Row = { description: string; quantity: string; unit: string; rate: string };

export const dayKey = (ms: number | null) => (ms === null ? "" : new Date(ms).toISOString().slice(0, 10));
export const dayFromKey = (k: string) => (k ? Date.parse(`${k}T00:00:00Z`) : undefined);
export const dayLabel = utcDate;

const toRow = (l: Pkg["budgetLines"][number]): Row => ({ description: l.description, quantity: String(l.quantity), unit: l.unit, rate: (l.rateCents / 100).toFixed(2) });

export function WorkPackageTab({ id, businessId, title }: { id: Id<"opportunities">; businessId: Id<"businesses">; title: string }) {
  const staff = useStaff();
  const p = useQuery(api.crm.workPackages.get, { id });
  const canEdit = staff.can("pipelinePreplanning", "edit");
  if (p === undefined) return <div className="card op-card"><div className="sk" style={{ height: 200 }} /></div>;
  if (p === null) return <div className="card op-card"><p className="muted">A work package starts once the project is Closed Won.</p></div>;
  return (
    <div className="op-body one wp">
      {/* Outside the package's form: it saves on its own, and Manage crews has a form of its own. */}
      <ProjectTeam id={id} businessId={businessId} />
      <Editor key={`${p.updatedAt}`} id={id} p={p} canEdit={canEdit} />
      {canEdit && <Share id={id} p={p} businessId={businessId} title={title} canWhatsApp={staff.can("messages", "edit")} />}
    </div>
  );
}

function Editor({ id, p, canEdit }: { id: Id<"opportunities">; p: Pkg; canEdit: boolean }) {
  const { toast } = useUI();
  const { can } = useStaff();
  const save = useMutation(api.crm.workPackages.save);
  const [scope, setScope] = useState(p.scope);
  const [target, setTarget] = useState(dayKey(p.targetStartDate));
  const [start, setStart] = useState(dayKey(p.startDate));
  const [end, setEnd] = useState(dayKey(p.endDate));
  const [scheduleNotes, setScheduleNotes] = useState(p.scheduleNotes);
  const [siteAccess, setSiteAccess] = useState(p.siteAccess);
  const [availability, setAvailability] = useState(p.customerAvailability);
  const [notes, setNotes] = useState(p.installerNotes);
  const [includeMaterials, setIncludeMaterials] = useState(p.includeMaterials);
  const [fileIds, setFileIds] = useState<string[]>(p.fileIds);
  const [rows, setRows] = useState<Row[]>(p.budgetLines.map(toRow));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const parsed = rows.map((r) => ({ description: r.description.trim(), quantity: Number(r.quantity), unit: r.unit.trim(), rateCents: centsFromText(r.rate) }));
  const rowBad = (i: number) => !parsed[i].description || !Number.isFinite(parsed[i].quantity) || parsed[i].quantity < 0 || parsed[i].rateCents === null;
  // The server counts the business's own working days; this catches the same mistake before saving, Monday to Friday.
  const tooLong = !!start && !!end && installDays(dayFromKey(start), dayFromKey(end), [1, 2, 3, 4, 5]).length > MAX_INSTALL_DAYS;
  const endBad = (!!start && !!end && end < start) || tooLong;
  const total = budgetTotalCents(parsed.map((r) => ({ quantity: Number.isFinite(r.quantity) ? r.quantity : 0, rateCents: r.rateCents ?? 0 })));
  const patchRow = (i: number, patch: Partial<Row>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const crewRate = p.crews.find((c) => c.rateCents !== null)?.rateCents ?? null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (endBad || rows.some((_, i) => rowBad(i))) return;
    setBusy(true);
    try {
      await save({
        id, scope, targetStartDate: dayFromKey(target), startDate: dayFromKey(start), endDate: dayFromKey(end), scheduleNotes, siteAccess, customerAvailability: availability,
        installerNotes: notes, includeMaterials, fileIds: fileIds as Id<"opportunityFiles">[],
        ...(p.canSeeBudget ? { budgetLines: parsed.map((r) => ({ description: r.description, quantity: r.quantity, unit: r.unit, rateCents: r.rateCents ?? 0 })) } : {}),
        now: clock(),
      });
      toast("Work package saved.");
    } catch (err) {
      toast(failure(err, "The work package could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  const area = (label: string, idn: string, value: string, set: (v: string) => void, rows = 3, ph = "") => (
    <div className="field"><label htmlFor={idn}>{label}</label><textarea id={idn} rows={rows} maxLength={5000} disabled={!canEdit} placeholder={ph} value={value} onChange={(e) => set(e.target.value)} /></div>
  );

  return (
    <form className="wp-form" onSubmit={(e) => void submit(e)} noValidate>
      <section className="card op-card">
        <div className="op-sechead">
          <h2>Work package</h2>
          <button type="button" className="btn" onClick={() => window.print()}>Print</button>
        </div>
        {area("Scope of work", "wp-scope", scope, setScope, 5, "What the installers will do on this job")}
        {area("Notes for installers", "wp-notes", notes, setNotes, 3, "Anything else they should know")}
      </section>

      <section className="card op-card">
        <h2>Schedule</h2>
        <div className="wp-dates">
          <div className="field"><label htmlFor="wp-target">Target start</label><input id="wp-target" type="date" disabled={!canEdit} value={target} onChange={(e) => setTarget(e.target.value)} /></div>
          <div className="field"><label htmlFor="wp-start">Install starts</label><input id="wp-start" type="date" disabled={!canEdit} value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className={`field${tried && endBad ? " bad" : ""}`}><label htmlFor="wp-end">Install ends</label><input id="wp-end" type="date" disabled={!canEdit} min={start || undefined} aria-invalid={tried && endBad} value={end} onChange={(e) => setEnd(e.target.value)} /><span className="err">{tooLong ? `An installation can cover up to ${MAX_INSTALL_DAYS} working days.` : "The end is before the start."}</span></div>
        </div>
        <p className="muted wp-booked">
          {p.installVisits.count === 0 ? "Saving puts each working day from Install starts to Install ends on the Schedule, for the installers on the team." : `${p.installVisits.count} installation day${p.installVisits.count === 1 ? " is" : "s are"} on the Schedule.`}
          {p.installVisits.first !== null && can("schedule") && <> <Link href={`/schedule?view=week&date=${todayKey(p.installVisits.first)}`}>Open the Schedule</Link></>}
        </p>
        {area("Schedule notes", "wp-sched", scheduleNotes, setScheduleNotes, 2, "Phases, days off, anything that moves the dates")}
        {area("Site access", "wp-access", siteAccess, setSiteAccess, 2, "Gate codes, parking, where to unload, pets")}
        {area("Customer availability", "wp-avail", availability, setAvailability, 2, "When the customer is home, or can be reached")}
      </section>


      <section className="card op-card">
        <h2>Drawings, specifications and photos</h2>
        {p.files.length === 0 ? (
          <p className="muted">Upload files on the project&apos;s Files tab, then choose here which ones go with the package.</p>
        ) : (
          <ul className="wp-files">
            {p.files.map((f) => (
              <li key={f.id}>
                <label className="cq-agree">
                  <input type="checkbox" disabled={!canEdit} checked={fileIds.includes(f.id)} onChange={(e) => setFileIds((all) => (e.target.checked ? [...all, f.id] : all.filter((x) => x !== f.id)))} />
                  <span>{f.name} <span className="muted">· {f.kind}</span></span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <label className="cq-agree">
          <input type="checkbox" disabled={!canEdit} checked={includeMaterials} onChange={(e) => setIncludeMaterials(e.target.checked)} />
          <span>Include the material list from the takeoff ({p.materials.length} item{p.materials.length === 1 ? "" : "s"}, quantities only, no costs)</span>
        </label>
      </section>

      {p.canSeeBudget && (
        <section className="card op-card op-wide">
          <div className="op-sechead">
            <h2>Installer budget</h2>
            {canEdit && (
              <button type="button" className="btn" onClick={() => setRows((r) => [...r, { description: "", quantity: "1", unit: "hr", rate: crewRate !== null ? (crewRate / 100).toFixed(2) : "" }])}>
                <Icon name="plus" size={16} /> Add line
              </button>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="muted">Add the labour for this job: what, how many hours or units, and the rate. {crewRate !== null && "A new line starts at the crew's agreed rate."}</p>
          ) : (
            <div className="op-scroll">
              <table className="table op-table">
                <colgroup><col /><col style={{ width: 90 }} /><col style={{ width: 90 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 52 }} /></colgroup>
                <thead><tr><th>Description</th><th className="num">Qty</th><th>Unit</th><th className="num">Rate ($)</th><th className="num">Amount</th><th /></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td><div className={`field${tried && !parsed[i].description ? " bad" : ""}`}><input aria-label="Description" maxLength={200} disabled={!canEdit} value={r.description} onChange={(e) => patchRow(i, { description: e.target.value })} /><span className="err">Describe the work.</span></div></td>
                      <td><div className={`field${tried && (!Number.isFinite(parsed[i].quantity) || parsed[i].quantity < 0) ? " bad" : ""}`}><input aria-label="Quantity" inputMode="decimal" disabled={!canEdit} value={r.quantity} onChange={(e) => patchRow(i, { quantity: e.target.value.replace(/[^\d.]/g, "") })} /></div></td>
                      <td><input aria-label="Unit" maxLength={30} disabled={!canEdit} value={r.unit} onChange={(e) => patchRow(i, { unit: e.target.value })} /></td>
                      <td><div className={`field${tried && parsed[i].rateCents === null ? " bad" : ""}`}><input aria-label="Rate" inputMode="decimal" disabled={!canEdit} value={r.rate} onChange={(e) => patchRow(i, { rate: e.target.value.replace(/[^\d.]/g, "") })} /></div></td>
                      <td className="num">{parsed[i].rateCents !== null && Number.isFinite(parsed[i].quantity) ? moneyCents(lineTotalCents({ quantity: parsed[i].quantity, rateCents: parsed[i].rateCents! })) : "—"}</td>
                      <td>{canEdit && <button type="button" className="icon-btn" aria-label="Remove line" data-tip="Remove" onClick={() => setRows((all) => all.filter((_, j) => j !== i))}><Icon name="trash" size={18} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p><b>Budget total: {moneyCents(total)}</b></p>
        </section>
      )}


      {canEdit && (
        <div className="cat-actions wp-save">
          <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save work package"}</button>
          {p.updatedAt && <span className="muted">Saved {quoteDateTime(p.updatedAt)} by {p.updatedByName}.</span>}
        </div>
      )}
    </form>
  );
}

function Share({ id, p, businessId, title, canWhatsApp }: { id: Id<"opportunities">; p: Pkg; businessId: Id<"businesses">; title: string; canWhatsApp: boolean }) {
  const { toast } = useUI();
  const share = useMutation(api.crm.workPackages.share);
  const revoke = useMutation(api.crm.workPackages.revoke);
  const [days, setDays] = useState(String(p.defaultLinkDays));
  const [busy, setBusy] = useState(false);
  const daysNum = Number(days);
  const daysBad = !Number.isInteger(daysNum) || daysNum < 1 || daysNum > 90;
  const url = p.share.token ? `${window.location.origin}/w/${p.share.token}` : "";

  async function make() {
    if (daysBad) return;
    setBusy(true);
    try {
      await share({ id, days: daysNum, now: clock() });
      toast("The link is ready. Any earlier link no longer works.");
    } catch (e) {
      toast(failure(e, "The link could not be made."));
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied.");
    } catch {
      toast("The link could not be copied. Select it and copy it by hand.");
    }
  }

  return (
    <section className="card op-card wp-share tk-noprint">
      <h2>Share with installers</h2>
      {!p.saved ? (
        <p className="muted">Save the work package first, then make a link.</p>
      ) : (
        <>
          <p className="muted">
            {p.share.state === "live" && p.share.expiresAt ? `The link is open until ${quoteDateTime(p.share.expiresAt)}. ` : p.share.state === "expired" ? "The last link has expired. " : "No link yet. "}
            Anyone with the link can read the package, so send it only to the people doing the work. It shows no customer prices.
          </p>
          {url && (
            <div className="wp-link">
              <input readOnly aria-label="Work package link" value={url} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn" onClick={() => void copy()}>Copy</button>
              <a className="btn" href={url} target="_blank" rel="noreferrer">Open</a>
            </div>
          )}
          {url && canWhatsApp && <WhatsAppSend id={id} p={p} businessId={businessId} title={title} url={url} />}
          <div className="cat-actions">
            <div className={`field wp-days${daysBad ? " bad" : ""}`}>
              <label htmlFor="wp-days">Stays open for (days)</label>
              <input id="wp-days" inputMode="numeric" value={days} aria-invalid={daysBad} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
              <span className="err">1 to 90 days.</span>
            </div>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void make()}>{p.share.state === "live" ? "Make a new link" : "Make a link"}</button>
            {p.share.state !== "none" && <button type="button" className="btn" disabled={busy} onClick={() => void revoke({ id }).then(() => toast("The link is turned off.")).catch((e) => toast(failure(e, "The link could not be turned off.")))}>Turn off the link</button>}
          </div>
        </>
      )}
    </section>
  );
}

/* Send the link through WhatsApp (plan 2026-11-20-calls-whatsapp, PRD 5.4). Until the WhatsApp Business Platform is connected this opens WhatsApp with the
   message filled in (wa.me) and logs it against the project as sent by hand. */
function WhatsAppSend({ id, p, businessId, title, url }: { id: Id<"opportunities">; p: Pkg; businessId: Id<"businesses">; title: string; url: string }) {
  const { toast } = useUI();
  const log = useMutation(api.crm.whatsapp.log);
  const withPhone = p.crews.filter((c) => c.phone);
  const [who, setWho] = useState<string>(withPhone[0]?.id ?? "other");
  const [other, setOther] = useState("");
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const number = who === "other" ? other : withPhone.find((c) => c.id === who)?.phone ?? "";
  const standard = `Hi, here is the work package for ${title}: ${url}${p.share.expiresAt ? `\nThe link works until ${quoteDateTime(p.share.expiresAt)}.` : ""}`;
  const message = typed ?? standard;
  const digits = number.replace(/\D/g, "");
  const numberBad = tried && digits.length < 8;

  async function send() {
    setTried(true);
    if (digits.length < 8 || !message.trim()) return;
    setBusy(true);
    const win = window.open("about:blank", "_blank"); // opened now, so a pop-up blocker sees the click
    try {
      const r = await log({ businessId, opportunityId: id, phone: number, body: message, now: clock() });
      const target = `https://wa.me/${r.digits}?text=${encodeURIComponent(r.body)}`;
      if (win) { win.opener = null; win.location.href = target; } else window.location.href = target;
      toast("Logged as sent by hand. WhatsApp is opening with the message.");
    } catch (e) {
      win?.close();
      toast(failure(e, "The message could not be logged."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wp-wa">
      <h3>Send by WhatsApp</h3>
      <div className="wp-dates">
        <div className="field">
          <label htmlFor="wa-who">To</label>
          <select id="wa-who" value={who} onChange={(e) => setWho(e.target.value)}>
            {withPhone.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
            <option value="other">Another number</option>
          </select>
        </div>
        {who === "other" && (
          <div className={`field${numberBad ? " bad" : ""}`}>
            <label htmlFor="wa-num">WhatsApp number</label>
            <input id="wa-num" type="tel" inputMode="tel" placeholder="+1 555 123 4567" aria-invalid={numberBad} value={other} onChange={(e) => setOther(e.target.value)} />
            <span className="err">Enter the number with its country code.</span>
          </div>
        )}
      </div>
      <div className="field"><label htmlFor="wa-msg">Message</label><textarea id="wa-msg" rows={3} maxLength={4000} value={message} onChange={(e) => setTyped(e.target.value)} /></div>
      <div className="cat-actions"><button type="button" className="btn primary" disabled={busy} onClick={() => void send()}>{busy ? "Opening…" : "Open WhatsApp"}</button></div>
      <p className="muted">WhatsApp opens with the message ready; press send there. It is logged against this project in Messages.</p>
    </div>
  );
}
