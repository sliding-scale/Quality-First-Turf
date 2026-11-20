"use client";

/* Settings → Materials, the Kits section (D-104): a kit is a named list of materials that go onto a project's takeoff together, such as "Turf: Standard
   install" or "Demo: dirt to haul away". A kit holds no rates (each material has its own formula), so editing one only chooses which materials it lists.
   An Admin can load the client's material calculator (their spreadsheet) when the list is empty; running it again only fills in what is missing. */

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TAKEOFF_INPUTS } from "@/convex/crm/lib/takeoff";
import { clock, failure } from "@/lib/pipeline";
import { Icon } from "./icon";
import { PipelineModal } from "./pipeline-dialogs";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

type Kit = { id: Id<"materialKits">; name: string; group: string; description: string; items: { id: Id<"materials">; name: string; unit: string; formula: string }[]; missing: number; uses: string[] };

export function MaterialKits({ businessId }: { businessId: Id<"businesses"> }) {
  const staff = useStaff();
  const { toast } = useUI();
  const kits = useQuery(api.crm.materialKits.list, { businessId });
  const load = useMutation(api.crm.materialKits.loadStarter);
  const [editing, setEditing] = useState<Kit | "new" | null>(null);
  const [loading, setLoading] = useState(false);
  const canEdit = staff.can("pipelinePreplanning", "edit");
  const canFull = staff.can("pipelinePreplanning", "full");

  async function loadStarter() {
    setLoading(true);
    try {
      const r = await load({ businessId, now: clock() });
      toast(r.kitsAdded === 0 && r.materialsAdded === 0 ? "Everything from the client's calculator is already here." : `Loaded ${r.kitsAdded} kit${r.kitsAdded === 1 ? "" : "s"} and ${r.materialsAdded} material${r.materialsAdded === 1 ? "" : "s"}.`);
    } catch (err) {
      toast(failure(err, "The calculator could not be loaded."));
    } finally {
      setLoading(false);
    }
  }

  if (kits === undefined) {
    return (
      <section className="mk" aria-busy="true">
        <div className="page-head"><h2>Kits</h2></div>
        <div className="table-wrap"><div className="sk" style={{ height: 140 }} /></div>
      </section>
    );
  }
  const groups = [...new Set(kits.map((k) => k.group))];

  return (
    <section className="mk" style={{ marginTop: 32 }}>
      <div className="page-head">
        <h2>Kits</h2>
        <div className="cat-actions" style={{ marginTop: 0 }}>
          {canFull && kits.length > 0 && <button type="button" className="btn" disabled={loading} data-tip="Adds any kit or material from the client's calculator that is not here yet. Nothing you changed is touched." onClick={() => void loadStarter()}>{loading ? "Loading…" : "Add missing from the client's calculator"}</button>}
          {canEdit && <button type="button" className="btn primary" onClick={() => setEditing("new")}><Icon name="plus" size={18} /> Add Kit</button>}
        </div>
      </div>
      <p className="au-lead">A kit is a set of materials that go on a project&apos;s takeoff together, such as a standard install or a 3 in. drain. On a project, Add kit puts all of its materials on the takeoff, each worked out from the measurements.</p>
      {kits.length === 0 ? (
        <div className="empty" style={{ margin: "20px 0" }}>
          <p>No kits yet.</p>
          {canFull && (
            <div className="cat-actions">
              <button type="button" className="btn primary" disabled={loading} onClick={() => void loadStarter()}>{loading ? "Loading…" : "Load the client's material calculator"}</button>
            </div>
          )}
          {canFull && <p className="muted">Loads the materials and kits from their spreadsheet, with a dirt-to-haul-away calculator for demolition. Prices and suppliers are left blank to fill in.</p>}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table cat-table">
            <colgroup><col style={{ width: "34%" }} /><col style={{ width: 150 }} /><col /></colgroup>
            <thead><tr><th>Kit</th><th>Uses</th><th>Materials</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                [
                  <tr key={`g-${g}`}><td colSpan={3}><b>{g || "Other"}</b></td></tr>,
                  ...kits.filter((k) => k.group === g).map((k) => (
                    <tr key={k.id} className="click" onClick={() => setEditing(k)}>
                      <td><b>{k.name}</b>{k.description && <div className="muted">{k.description}</div>}</td>
                      <td>{k.uses.length ? k.uses.map((u) => TAKEOFF_INPUTS.find((i) => i.key === u)?.label ?? u).join(", ") : <span className="muted">—</span>}</td>
                      <td className="single" title={k.items.map((i) => i.name).join(", ")}>{k.items.map((i) => i.name).join(", ")}{k.missing > 0 && <span className="cat-bad"> ({k.missing} deleted)</span>}</td>
                    </tr>
                  )),
                ]
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <KitDialog businessId={businessId} kit={editing === "new" ? null : editing} canEdit={canEdit} canDelete={canFull} onClose={() => setEditing(null)} />}
    </section>
  );
}

function KitDialog({ businessId, kit, canEdit, canDelete, onClose }: { businessId: Id<"businesses">; kit: Kit | null; canEdit: boolean; canDelete: boolean; onClose: () => void }) {
  const { toast } = useUI();
  const save = useMutation(api.crm.materialKits.save);
  const remove = useMutation(api.crm.materialKits.remove);
  const options = useQuery(api.crm.materials.options, { businessId });
  const [name, setName] = useState(kit?.name ?? "");
  const [group, setGroup] = useState(kit?.group ?? "");
  const [description, setDescription] = useState(kit?.description ?? "");
  const [chosen, setChosen] = useState<Id<"materials">[]>(kit?.items.map((i) => i.id) ?? []);
  const [find, setFind] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  const badName = tried && !name.trim();
  const badItems = tried && chosen.length === 0;
  const shown = (options ?? []).filter((o) => !find.trim() || `${o.name} ${o.supplier}`.toLowerCase().includes(find.trim().toLowerCase()));
  const toggle = (id: Id<"materials">) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  async function submit(e: FormEvent, close: () => void) {
    e.preventDefault();
    setTried(true);
    if (!name.trim() || chosen.length === 0) {
      document.getElementById(!name.trim() ? "kt-name" : "kt-find")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save({ ...(kit ? { id: kit.id } : {}), businessId, name, group, description, materialIds: chosen, now: clock() });
      toast(kit ? "Kit saved." : "Kit added.");
      close();
    } catch (err) {
      setError(failure(err, "That could not be saved. Try again."));
      setBusy(false);
    }
  }

  return (
    <PipelineModal title={kit ? `Edit ${kit.name}` : "New kit"} onClose={onClose} busy={busy} className="au-modal cat-modal">
      {(close) => (
        <form onSubmit={(e) => void submit(e, close)} noValidate>
          <fieldset disabled={!canEdit} className="cat-fields">
            <div className={`field${badName ? " bad" : ""}`}><label htmlFor="kt-name">Name</label><input id="kt-name" aria-invalid={badName} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoFocus /><span className="err">Give the kit a name.</span></div>
            <div className="cat-money two">
              <div className="field"><label htmlFor="kt-group">Group</label><input id="kt-group" maxLength={60} placeholder="Turf installation, Underground…" value={group} onChange={(e) => setGroup(e.target.value)} /></div>
              <div className="field"><label htmlFor="kt-desc">What it is measured by</label><input id="kt-desc" maxLength={300} placeholder="Priced by the area in square feet." value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            </div>
            <div className={`field${badItems ? " bad" : ""}`}>
              <label htmlFor="kt-find">Materials in this kit ({chosen.length} chosen)</label>
              <input id="kt-find" type="search" aria-invalid={badItems} placeholder="Search materials" value={find} onChange={(e) => setFind(e.target.value)} />
              <span className="err">Choose at least one material.</span>
            </div>
            <div className="mk-pick" role="group" aria-label="Materials">
              {options === undefined ? <div className="sk" style={{ height: 120 }} /> : shown.length === 0 ? <p className="muted">{options.length === 0 ? "There are no materials yet. Add them above first." : "Nothing matches that search."}</p> : shown.map((o) => (
                <label key={o.id} className="mk-opt">
                  <input type="checkbox" checked={chosen.includes(o.id)} onChange={() => toggle(o.id)} />
                  <span>{o.name} <span className="muted">({o.unit})</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="modal-error" role="alert">{error}</p>}
          {confirming ? (
            <div className="modal-foot">
              <span className="muted" style={{ marginRight: "auto" }}>Delete this kit? The materials stay.</span>
              <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>No</button>
              <button type="button" className="btn danger" disabled={busy} onClick={() => { setBusy(true); remove({ id: kit!.id }).then(() => { toast("Kit deleted."); close(); }).catch((err) => { toast(failure(err, "That could not be deleted.")); setBusy(false); }); }}>Yes, delete</button>
            </div>
          ) : (
            <div className="modal-foot">
              {kit && canDelete && <button type="button" className="btn danger" style={{ marginRight: "auto" }} disabled={busy} onClick={() => setConfirming(true)}>Delete</button>}
              <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
              {canEdit && <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : kit ? "Update" : "Add"}</button>}
            </div>
          )}
        </form>
      )}
    </PipelineModal>
  );
}
