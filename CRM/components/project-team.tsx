"use client";

/* The project's team: project manager, crews and installers (D-081). One card on the Construction tab and, so a crew can be chosen while the
   job is still being planned (D-136, PRD 4.4), on the Work package tab. A tick saves at once; the backend checks the person and the pipeline. */

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { moneyCents } from "@/lib/format";
import { clock, failure } from "@/lib/pipeline";
import { CrewsModal } from "./construction-dialogs";
import { useStaff } from "./staff-context";
import { useUI } from "./ui-provider";

export function ProjectTeam({ id, businessId }: { id: Id<"opportunities">; businessId: Id<"businesses"> }) {
  const { toast } = useUI();
  const { can } = useStaff();
  const team = useQuery(api.crm.construction.team, { id });
  const setTeam = useMutation(api.crm.construction.setTeam);
  const [crewsOpen, setCrewsOpen] = useState(false);

  if (team === undefined) {
    return (
      <section className="card op-card cn-team" aria-busy="true">
        <h2>Team</h2>
        <dl className="op-facts">
          {[0, 1, 2].map((n) => <div key={n}><dt><span className="sk sk-inline" style={{ width: 90, height: 14 }} /></dt><dd><span className="sk sk-inline" style={{ width: 160, height: 18 }} /></dd></div>)}
        </dl>
      </section>
    );
  }
  if (team === null) return null;

  const crewIds = team.crews.map((c) => c.id);
  const installerIds = team.installers.map((i) => i.id);
  const save = (change: { projectManagerId?: Id<"users"> | null; crewIds?: Id<"crews">[]; installerIds?: Id<"users">[] }) =>
    setTeam({ id, projectManagerId: team.projectManager?.id ?? null, crewIds, installerIds, ...change, now: clock() })
      .then(() => toast("Team saved."))
      .catch((e) => toast(failure(e, "The team could not be saved.")));
  const toggle = <T,>(list: T[], item: T, on: boolean) => (on ? [...list, item] : list.filter((x) => x !== item));

  return (
    <section className="card op-card cn-team" aria-labelledby="cn-team">
      <div className="op-sechead">
        <h2 id="cn-team">Team</h2>
        {can("pipelineConstruction", "edit") && <button type="button" className="btn" onClick={() => setCrewsOpen(true)}>Manage crews</button>}
      </div>
      <dl className="op-facts">
        <div>
          <dt>Project manager</dt>
          <dd>
            {team.canEdit ? (
              <select aria-label="Project manager" value={team.projectManager?.id ?? ""} onChange={(e) => void save({ projectManagerId: (e.target.value || null) as Id<"users"> | null })}>
                <option value="">Not assigned</option>
                {team.managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            ) : (team.projectManager?.name ?? "Not assigned")}
          </dd>
        </div>
        <div>
          <dt>Crews</dt>
          <dd>
            {team.crewOptions.length === 0 && team.crews.length === 0 ? <span className="muted">No crews yet.{can("pipelineConstruction", "edit") ? " Use Manage crews to add one." : ""}</span> : (
              <div className="cn-crews">
                {team.crewOptions.map((c) => (
                  <label key={c.id} className="sc-check">
                    <input type="checkbox" disabled={!team.canEdit} checked={crewIds.includes(c.id)} onChange={(e) => void save({ crewIds: toggle(crewIds, c.id, e.target.checked) })} />
                    <span>
                      {c.name}
                      <small>{[c.leadName && `Lead ${c.leadName}`, c.phone, c.availability && `Free: ${c.availability}`, c.rateCents !== null && `${moneyCents(c.rateCents)}/hr`].filter(Boolean).join(" · ")}</small>
                    </span>
                  </label>
                ))}
                {team.crews.filter((c) => !team.crewOptions.some((o) => o.id === c.id)).map((c) => <span key={c.id} className="muted">{c.name} (not active)</span>)}
              </div>
            )}
          </dd>
        </div>
        <div>
          <dt>Installers</dt>
          <dd>
            {team.installerOptions.length === 0 && team.installers.length === 0 ? <span className="muted">No installers on the team yet. Add one with the Installer role in Manage Team.</span> : (
              <div className="cn-crews">
                {team.installerOptions.map((p) => (
                  <label key={p.id} className="sc-check">
                    <input type="checkbox" disabled={!team.canEdit} checked={installerIds.includes(p.id)} onChange={(e) => void save({ installerIds: toggle(installerIds, p.id, e.target.checked) })} />
                    <span>{p.name}</span>
                  </label>
                ))}
                {team.installers.filter((i) => !team.installerOptions.some((o) => o.id === i.id)).map((i) => <span key={i.id} className="muted">{i.name}</span>)}
              </div>
            )}
          </dd>
        </div>
      </dl>
      {crewsOpen && <CrewsModal businessId={businessId} onClose={() => setCrewsOpen(false)} />}
    </section>
  );
}
