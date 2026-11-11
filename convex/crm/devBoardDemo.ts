import { ConvexError } from "convex/values";
import { internalMutation } from "../_generated/server";
import { BUSINESS_TZ, zonedToMs } from "./lib/schedule";
import { LEAD_SOURCES, SALES_STAGES } from "./lib/stages";

/* TEMPORARY, dev only: a few demo projects so the pipeline board has cards to look at. `add` makes them (code starting "DEMO-"),
   `remove` deletes them. Delete this file when the board has been checked. */

export const add = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!(process.env.CONVEX_CLOUD_URL ?? "").includes("zany-bison-147")) throw new ConvexError("Dev only.");
    const business = await ctx.db.query("businesses").filter((q) => q.eq(q.field("slug"), "quality-first-turf")).first();
    if (!business) throw new ConvexError("No business.");
    const clients = (await ctx.db.query("clients").take(2000)).filter((c) => c.businessId === business._id).slice(5, 25);
    const now = Date.now();
    let n = 0;
    for (const [i, c] of clients.entries()) {
      const stage = SALES_STAGES[i % 7];
      const requestedAt = now - (i + 1) * 20 * 3_600_000;
      await ctx.db.insert("opportunities", {
        businessId: business._id, clientId: c._id, code: `DEMO-${String(i).padStart(3, "0")}`, title: ["Turf installation", "Patio pavers", "Retaining wall", "Putting green"][i % 4],
        pipeline: "Sales", stage, requestedAt, owner: "Unassigned", searchText: `${c.name} DEMO ${stage}`, stageEnteredAt: requestedAt + 3_600_000,
        ...(i % 3 === 0 ? {} : { leadSource: LEAD_SOURCES[i % LEAD_SOURCES.length] }),
      });
      n += 1;
    }
    return n;
  },
});

export const remove = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!(process.env.CONVEX_CLOUD_URL ?? "").includes("zany-bison-147")) throw new ConvexError("Dev only.");
    let n = 0;
    for (const p of await ctx.db.query("opportunities").take(2000)) {
      if (!p.code.startsWith("DEMO-")) continue;
      for (const h of await ctx.db.query("stageHistory").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(200)) await ctx.db.delete(h._id);
      for (const t of await ctx.db.query("opportunityTasks").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(200)) await ctx.db.delete(t._id);
      for (const t of await ctx.db.query("opportunityNotes").withIndex("by_opportunity", (q) => q.eq("opportunityId", p._id)).take(200)) await ctx.db.delete(t._id);
      await ctx.db.delete(p._id);
      n += 1;
    }
    return n;
  },
});

/* Demo bookings for the Schedule (dev only). Marked with the note "DEMO-SCHEDULE" (and task titles starting "DEMO"); `removeSchedule` deletes them. */
export const addSchedule = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!(process.env.CONVEX_CLOUD_URL ?? "").includes("zany-bison-147")) throw new ConvexError("Dev only.");
    const business = await ctx.db.query("businesses").filter((q) => q.eq(q.field("slug"), "quality-first-turf")).first();
    if (!business) throw new ConvexError("No business.");
    const users = (await ctx.db.query("users").take(100)).filter((u) => u.status === "active" && (u.roles.includes("admin") || u.businessIds.includes(business._id)));
    if (users.length === 0) throw new ConvexError("No users.");
    const now = Date.now();
    const p = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(now);
    const get = (t: string) => p.find((x) => x.type === t)!.value;
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
    const monday = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")) - ((dow + 6) % 7)));
    const at = (dayOffset: number, h: number, m = 0) => {
      const d = new Date(monday.getTime() + dayOffset * 86_400_000);
      return zonedToMs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, m, BUSINESS_TZ);
    };
    const by = users[0]._id;
    const make = (type: "consultation" | "visit" | "event" | "reminder", title: string, assigneeIds: typeof users[number]["_id"][], start: number, end: number, extra: Record<string, unknown> = {}) =>
      ctx.db.insert("calendarEvents", { businessId: business._id, type, title, start, end, anytime: false, assigneeIds, status: "upcoming", notes: "DEMO-SCHEDULE", repeat: "none", createdBy: by, createdAt: now, ...extra });
    for (const u of users) await make("event", "BREAK", [u._id], at(0, 12, 30), at(0, 13, 30), { repeat: "weekdays" });
    const projects = (await ctx.db.query("opportunities").take(200)).filter((o) => o.code.startsWith("DEMO-"));
    const onsite = projects.find((o) => o.stage === "Onsite Consultation");
    const sam = users[users.length - 1]._id;
    await make("consultation", "Onsite consultation", [sam], at(1, 10), at(1, 11), onsite ? { opportunityId: onsite._id, clientId: onsite.clientId } : {});
    await make("visit", "Follow-up visit", [users[0]._id], at(2, 14), at(2, 15, 30));
    await make("event", "Team meeting", users.map((u) => u._id), at(3, 9), at(3, 10));
    await make("reminder", "Send the patio design", [users[0]._id], at(2, 11), at(2, 11, 30));
    await make("visit", "Site walk", [sam], at(4, 8, 30), at(4, 10));
    const task = projects.length > 0 ? projects[0] : null;
    await ctx.db.insert("opportunityTasks", { businessId: business._id, opportunityId: task?._id, title: "DEMO Call about the gate code", assigneeId: users[0]._id, done: false, createdAt: now, startAt: at(1, 15), endAt: at(1, 15, 30) });
    return users.length;
  },
});

export const removeSchedule = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!(process.env.CONVEX_CLOUD_URL ?? "").includes("zany-bison-147")) throw new ConvexError("Dev only.");
    let n = 0;
    for (const e of await ctx.db.query("calendarEvents").take(2000)) if (e.notes === "DEMO-SCHEDULE") { await ctx.db.delete(e._id); n += 1; }
    for (const t of await ctx.db.query("opportunityTasks").take(2000)) if (t.title.startsWith("DEMO ")) { await ctx.db.delete(t._id); n += 1; }
    return n;
  },
});
