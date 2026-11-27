/* The installation days a work package puts on the Schedule (D-136, PRD 4.4): one "Anytime" installation visit for each day from Install
   starts to Install ends, for the installers on the project's team, titled with its crews (a crew has no calendar of its own). They are only
   rewritten when the package's dates change, so a day moved or deleted on the Schedule stays that way until then. */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { businessZone } from "../settings";
import { mirrorChanged, mirrorRemoved } from "./mirror";
import { DEFAULT_HOURS, dayKey, zonedToMs } from "./schedule";
import { installDays } from "./workPackage";

const DAY_MS = 86_400_000;

const packageOf = (ctx: QueryCtx, id: Id<"opportunities">) => ctx.db.query("workPackages").withIndex("by_opportunity", (q) => q.eq("opportunityId", id)).unique();

/** The business's working days (0 is Sunday), from the Schedule's settings. */
export async function workingDaysOf(ctx: QueryCtx, businessId: Id<"businesses">) {
  const row = await ctx.db.query("scheduleSettings").withIndex("by_business", (q) => q.eq("businessId", businessId)).first();
  return row?.days ?? DEFAULT_HOURS.days;
}

/** A project's installation visits, however they were booked. */
export async function installVisitsOf(ctx: QueryCtx, opportunityId: Id<"opportunities">) {
  const events = await ctx.db.query("calendarEvents").withIndex("by_opportunity", (q) => q.eq("opportunityId", opportunityId)).take(500);
  return events.filter((e) => e.visitKind === "install").sort((a, b) => a.start - b.start);
}

/** What an installation day is called and who is on it, from the project's team as it is now. */
async function crewAndPeople(ctx: QueryCtx, project: Doc<"opportunities">) {
  const crews: string[] = [];
  for (const id of project.crewIds ?? []) {
    const crew = await ctx.db.get(id);
    if (crew) crews.push(crew.name);
  }
  const assigneeIds: Id<"users">[] = [];
  for (const id of project.installerIds ?? []) if ((await ctx.db.get(id))?.status === "active") assigneeIds.push(id);
  const title = `Installation: ${project.title}${crews.length ? ` · ${crews.join(", ")}` : ""}`.slice(0, 200);
  return { title, assigneeIds };
}

async function remove(ctx: MutationCtx, event: Doc<"calendarEvents">) {
  await mirrorRemoved(ctx, "event", event._id);
  await ctx.db.delete(event._id);
}

/** Brings the Schedule in line with the work package. With `team`, the days still to come also take the team's present crews and installers. */
export async function syncInstallDays(ctx: MutationCtx, opportunityId: Id<"opportunities">, by: Id<"users">, now: number, opts: { team?: boolean } = {}) {
  const project = await ctx.db.get(opportunityId);
  const w = project ? await packageOf(ctx, opportunityId) : null;
  if (!project || !w) return;
  const dates = `${w.startDate ?? ""}:${w.endDate ?? ""}`;
  if (dates === w.bookedDates && !opts.team) return;
  const { title, assigneeIds } = await crewAndPeople(ctx, project);
  const visits = await installVisitsOf(ctx, opportunityId);
  const tz = await businessZone(ctx);
  const kept: Doc<"calendarEvents">[] = [];

  if (dates !== w.bookedDates) {
    const wanted = installDays(w.startDate, w.endDate, await workingDaysOf(ctx, project.businessId));
    for (const e of visits) {
      // A completed day is history. A day booked by hand on the Construction tab is that person's, and also counts as booked.
      if (e.fromWorkPackage && e.status !== "completed" && !wanted.includes(dayKey(e.start, tz))) await remove(ctx, e);
      else kept.push(e);
    }
    const booked = new Set(kept.map((e) => dayKey(e.start, tz)));
    for (const day of wanted) {
      if (booked.has(day)) continue;
      const [y, m, d] = day.split("-").map(Number);
      const start = zonedToMs(y, m, d, 0, 0, tz);
      const id = await ctx.db.insert("calendarEvents", {
        businessId: project.businessId, type: "visit", visitKind: "install", fromWorkPackage: true, title, opportunityId, clientId: project.clientId,
        start, end: start + DAY_MS, anytime: true, assigneeIds, status: "upcoming", notes: "", repeat: "none", createdBy: by, createdAt: now, updatedAt: now,
      });
      await mirrorChanged(ctx, "event", id);
    }
    await ctx.db.patch(w._id, { bookedDates: dates });
  } else kept.push(...visits);

  if (!opts.team) return;
  for (const e of kept) {
    if (!e.fromWorkPackage || e.status === "completed") continue;
    if (e.title === title && e.assigneeIds.join() === assigneeIds.join()) continue;
    await ctx.db.patch(e._id, { title, assigneeIds, updatedAt: now });
    await mirrorChanged(ctx, "event", e._id);
  }
}

/** Takes the work package's days that are still to come off the Schedule (the project went back to Sales). */
export async function clearInstallDays(ctx: MutationCtx, opportunityId: Id<"opportunities">) {
  for (const e of await installVisitsOf(ctx, opportunityId)) if (e.fromWorkPackage && e.status !== "completed") await remove(ctx, e);
  const w = await packageOf(ctx, opportunityId);
  if (w) await ctx.db.patch(w._id, { bookedDates: undefined });
}
