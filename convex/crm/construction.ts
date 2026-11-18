import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { requireModule, requireProject, type Staff } from "./lib/access";
import { checkAssignee } from "./lib/assignees";
import {
  MAX_PROGRESS,
  completionBlock,
  completionState,
  punchItemsOf,
  requireSite,
  signoffsOf,
  tellOffice,
  tellPerson,
} from "./lib/construction";
import { formatPhone } from "./lib/fields";
import { attachmentLinks, checkNoteFiles, deleteNoteFiles, noteFilesArg } from "./lib/noteFiles";
import { completeConstruction } from "./pipeline";
import { checkImage } from "./quoteDraft";

/* Construction management (PRD 4.6, D-081), for staff: the project's team (project manager and crews), progress updates with photos, the
   punch list, and the customer's completion sign-off. Editing roles and Project Managers can do all of it, only while the project is in
   Construction (lib/construction.ts requireSite). The customer's own page is clientSignoff.ts. Job walks, installation days and
   reinspections are Schedule visits with a `visitKind` (schedule.ts book). */

const MAX_CREWS = 200;

async function loadProject(ctx: MutationCtx, id: Id<"opportunities">) {
  const project = await ctx.db.get(id);
  if (project === null) throw new ConvexError("That project no longer exists.");
  const staff = await requireSite(ctx, project);
  return { project, staff };
}

async function loadPunch(ctx: MutationCtx, id: Id<"punchItems">) {
  const item = await ctx.db.get(id);
  if (item === null) throw new ConvexError("That punch item no longer exists.");
  const project = await ctx.db.get(item.opportunityId);
  if (project === null) throw new ConvexError("That project no longer exists.");
  const staff = await requireSite(ctx, project);
  return { item, project, staff };
}

function text(value: string, max: number, what: string): string {
  const t = value.trim();
  if (t.length > max) throw new ConvexError(`${what} is too long (${max.toLocaleString("en-US")} characters at most).`);
  return t;
}

async function checkCrew(ctx: MutationCtx, crewId: Id<"crews"> | undefined, businessId: Id<"businesses">) {
  if (crewId === undefined) return;
  const crew = await ctx.db.get(crewId);
  if (crew === null || crew.businessId !== businessId || !crew.active) throw new ConvexError("That crew is not on this business.");
}

/** Everything the project's Construction tab shows. null when the project does not exist. */
export const get = query({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (project === null) return null;
    const staff = await requireProject(ctx, project, "pipelineConstruction", "view");
    const users = await ctx.db.query("users").take(500);
    const team = users.filter((u) => u.status === "active" && (u.roles.includes("admin") || u.businessIds.includes(project.businessId)));
    const nameOf = new Map(users.map((u) => [u._id as string, u.name]));
    const crews = await ctx.db.query("crews").withIndex("by_business", (q) => q.eq("businessId", project.businessId)).take(MAX_CREWS);
    const crewName = new Map(crews.map((c) => [c._id as string, c.name]));

    const events = await ctx.db.query("calendarEvents").withIndex("by_opportunity", (q) => q.eq("opportunityId", project._id)).take(200);
    const visits = events
      .filter((e) => e.visitKind !== undefined)
      .sort((a, b) => a.start - b.start)
      .map((e) => ({ id: e._id, kind: e.visitKind!, title: e.title, start: e.start, end: e.end, anytime: e.anytime, status: e.status, people: e.assigneeIds.map((id) => nameOf.get(id) ?? "") }));

    const updates = await ctx.db.query("progressUpdates").withIndex("by_opportunity_and_at", (q) => q.eq("opportunityId", project._id)).order("desc").take(MAX_PROGRESS);
    const progress = [];
    for (const u of updates) progress.push({ id: u._id, stage: u.stage, text: u.text, author: u.author, at: u.at, files: await attachmentLinks(ctx, u.attachments) });

    const punch = [];
    for (const p of (await punchItemsOf(ctx, project._id)).sort((a, b) => a.createdAt - b.createdAt)) {
      punch.push({
        id: p._id, title: p.title, details: p.details, required: p.required, status: p.status,
        assigneeUserId: p.assigneeUserId ?? null, assigneeCrewId: p.assigneeCrewId ?? null,
        assigneeName: p.assigneeUserId ? (nameOf.get(p.assigneeUserId) ?? "") : p.assigneeCrewId ? (crewName.get(p.assigneeCrewId) ?? "") : "",
        createdBy: p.createdBy, createdAt: p.createdAt, fixedBy: p.fixedBy ?? null, fixedAt: p.fixedAt ?? null, verifiedBy: p.verifiedBy ?? null, verifiedAt: p.verifiedAt ?? null,
        files: await attachmentLinks(ctx, p.attachments), fixFiles: await attachmentLinks(ctx, p.fixAttachments),
      });
    }

    const latest = (await signoffsOf(ctx, project._id)).filter((s) => s.status !== "cancelled").sort((a, b) => b.createdAt - a.createdAt)[0];
    const signoff = latest
      ? {
          id: latest._id, status: latest.status, summary: latest.summary, punchSnapshot: latest.punchSnapshot, createdBy: latest.createdBy, createdAt: latest.createdAt,
          token: latest.status === "pending" ? (latest.shareToken ?? null) : null, signedBy: latest.signedBy ?? null, signedAt: latest.signedAt ?? null,
          signedVia: latest.signedVia ?? null, signatureUrl: latest.signatureImageId ? await ctx.storage.getUrl(latest.signatureImageId) : null,
        }
      : null;
    const state = await completionState(ctx, project._id);

    return {
      pipeline: project.pipeline,
      stage: project.stage,
      /** Whether this person can change anything here (an editing role or a Project Manager, and the project is in Construction). */
      canWork: project.pipeline === "Construction" && (staff.levels.pipelineConstruction === "edit" || staff.levels.pipelineConstruction === "full"),
      projectManager: project.projectManagerId ? { id: project.projectManagerId, name: nameOf.get(project.projectManagerId) ?? "" } : null,
      crews: (project.crewIds ?? []).map((id) => crews.find((c) => c._id === id)).filter((c): c is Doc<"crews"> => c !== undefined).map((c) => ({ id: c._id, name: c.name, leadName: c.leadName, phone: c.phone })),
      crewOptions: crews.filter((c) => c.active).map((c) => ({ id: c._id, name: c.name })),
      /** Who can be the project manager: active Project Managers and Admins of the business. Anyone on the team can be given a punch item. */
      managers: team.filter((u) => u.roles.includes("pm") || u.roles.includes("admin")).map((u) => ({ id: u._id, name: u.name })),
      people: team.map((u) => ({ id: u._id, name: u.name })),
      installers: (project.installerIds ?? []).map((id) => ({ id, name: nameOf.get(id as string) ?? "" })),
      installerOptions: team.filter((u) => u.roles.includes("installer")).map((u) => ({ id: u._id, name: u.name })),
      visits,
      progress,
      punch,
      signoff,
      completion: { openRequired: state.openRequired, signed: state.signed !== null, ready: state.ready, block: state.ready ? null : completionBlock(state) },
    };
  },
});

/** A place to upload a progress or punch-list photo. */
export const uploadUrl = mutation({
  args: { id: v.id("opportunities") },
  handler: async (ctx, args) => {
    await loadProject(ctx, args.id);
    return await ctx.storage.generateUploadUrl();
  },
});

/* ---- Team ---- */

export const setTeam = mutation({
  args: { id: v.id("opportunities"), projectManagerId: v.union(v.id("users"), v.null()), crewIds: v.array(v.id("crews")), installerIds: v.optional(v.array(v.id("users"))), now: v.number() },
  handler: async (ctx, args) => {
    const { project, staff } = await loadProject(ctx, args.id);
    if (staff.assignedOnly) throw new ConvexError("Your role can view this but not change it."); // choosing who works on a project is not an Installer's job
    if (args.projectManagerId !== null) {
      const pm = await ctx.db.get(args.projectManagerId);
      if (pm === null || pm.status !== "active" || !(pm.roles.includes("pm") || pm.roles.includes("admin")) || !(pm.roles.includes("admin") || pm.businessIds.includes(project.businessId))) {
        throw new ConvexError("Pick a Project Manager or an Admin on this business.");
      }
    }
    const crewIds = [...new Set(args.crewIds)];
    if (crewIds.length > 20) throw new ConvexError("A project can have up to 20 crews.");
    for (const id of crewIds) await checkCrew(ctx, id, project.businessId);
    // The Installers on the work team (PRD 5.5): people who log in, and who then see this project and nothing else.
    const installerIds = args.installerIds === undefined ? project.installerIds : [...new Set(args.installerIds)];
    if ((installerIds ?? []).length > 20) throw new ConvexError("A project can have up to 20 installers.");
    for (const id of args.installerIds === undefined ? [] : installerIds ?? []) {
      const u = await ctx.db.get(id);
      if (u === null || u.status !== "active" || !u.roles.includes("installer") || !(u.roles.includes("admin") || u.businessIds.includes(project.businessId))) {
        throw new ConvexError("Pick an Installer on this business.");
      }
    }
    await ctx.db.patch(project._id, { projectManagerId: args.projectManagerId ?? undefined, crewIds, ...(args.installerIds !== undefined ? { installerIds } : {}) });
    for (const id of installerIds ?? []) {
      if (!(project.installerIds ?? []).includes(id) && id !== staff.userId) await tellPerson(ctx, { project, userId: id, by: staff, text: `You are on the work team for ${project.title}.`, now: args.now });
    }
    if (args.projectManagerId !== null && args.projectManagerId !== project.projectManagerId) {
      await tellPerson(ctx, { project, userId: args.projectManagerId, by: staff, text: `You are the project manager on ${project.title}.`, now: args.now });
    }
  },
});

/** A business's crews, for Manage crews and the pickers. */
export const crews = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "pipelineConstruction", "view");
    const rows = await ctx.db.query("crews").withIndex("by_business", (q) => q.eq("businessId", args.businessId)).take(MAX_CREWS);
    return rows.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map((c) => ({ id: c._id, name: c.name, leadName: c.leadName, phone: c.phone, notes: c.notes, active: c.active }));
  },
});

/** Adds a crew, or changes one. A crew is never deleted while projects may point at it; it is turned off (`active: false`) instead. */
export const saveCrew = mutation({
  args: { businessId: v.id("businesses"), id: v.optional(v.id("crews")), name: v.string(), leadName: v.string(), phone: v.string(), notes: v.string(), active: v.boolean(), now: v.number() },
  handler: async (ctx, args) => {
    await requireModule(ctx, args.businessId, "pipelineConstruction", "edit");
    const name = text(args.name, 100, "The crew name");
    if (!name) throw new ConvexError("Give the crew a name.");
    const fields = { name, leadName: text(args.leadName, 100, "The lead's name"), phone: formatPhone(args.phone), notes: text(args.notes, 2000, "The notes"), active: args.active };
    const all = await ctx.db.query("crews").withIndex("by_business", (q) => q.eq("businessId", args.businessId)).take(MAX_CREWS + 1);
    if (all.some((c) => c._id !== args.id && c.name.toLowerCase() === name.toLowerCase())) throw new ConvexError("There is already a crew with that name.");
    if (args.id) {
      const crew = await ctx.db.get(args.id);
      if (crew === null || crew.businessId !== args.businessId) throw new ConvexError("That crew no longer exists.");
      await ctx.db.patch(crew._id, fields);
      return crew._id;
    }
    if (all.length >= MAX_CREWS) throw new ConvexError(`A business can have up to ${MAX_CREWS} crews.`);
    return await ctx.db.insert("crews", { businessId: args.businessId, ...fields, createdAt: args.now });
  },
});

/* ---- Progress ---- */

export const addProgress = mutation({
  args: { id: v.id("opportunities"), text: v.string(), files: noteFilesArg, now: v.number() },
  handler: async (ctx, args) => {
    const { project, staff } = await loadProject(ctx, args.id);
    const body = text(args.text, 5000, "The update");
    const attachments = await checkNoteFiles(ctx, args.files);
    if (!body && attachments.length === 0) throw new ConvexError("Write what was done, or add a photo.");
    return await ctx.db.insert("progressUpdates", {
      opportunityId: project._id, businessId: project.businessId, stage: project.stage, text: body, attachments, author: staff.name, byUserId: staff.userId, at: args.now,
    });
  },
});

export const deleteProgress = mutation({
  args: { updateId: v.id("progressUpdates") },
  handler: async (ctx, args) => {
    const update = await ctx.db.get(args.updateId);
    if (update === null) return;
    await loadProject(ctx, update.opportunityId);
    await deleteNoteFiles(ctx, update.attachments);
    await ctx.db.delete(update._id);
  },
});

/* ---- Punch list ---- */

const assignee = { assigneeUserId: v.optional(v.union(v.id("users"), v.null())), assigneeCrewId: v.optional(v.union(v.id("crews"), v.null())) };

async function checkAssignees(ctx: MutationCtx, project: Doc<"opportunities">, a: { assigneeUserId?: Id<"users"> | null; assigneeCrewId?: Id<"crews"> | null }) {
  if (a.assigneeUserId && a.assigneeCrewId) throw new ConvexError("Give the item to a person or a crew, not both.");
  await checkAssignee(ctx, a.assigneeUserId ?? undefined, project.businessId);
  await checkCrew(ctx, a.assigneeCrewId ?? undefined, project.businessId);
}

export const addPunch = mutation({
  args: { id: v.id("opportunities"), title: v.string(), details: v.string(), required: v.boolean(), ...assignee, files: noteFilesArg, now: v.number() },
  handler: async (ctx, args) => {
    const { project, staff } = await loadProject(ctx, args.id);
    const title = text(args.title, 200, "The title");
    if (!title) throw new ConvexError("Say what needs fixing.");
    if ((await punchItemsOf(ctx, project._id)).length >= 200) throw new ConvexError("A project can have up to 200 punch items.");
    await checkAssignees(ctx, project, args);
    const id = await ctx.db.insert("punchItems", {
      opportunityId: project._id, businessId: project.businessId, title, details: text(args.details, 5000, "The details"), required: args.required, status: "open",
      ...(args.assigneeUserId ? { assigneeUserId: args.assigneeUserId } : {}), ...(args.assigneeCrewId ? { assigneeCrewId: args.assigneeCrewId } : {}),
      attachments: await checkNoteFiles(ctx, args.files), createdBy: staff.name, createdAt: args.now,
    });
    if (args.assigneeUserId) await tellPerson(ctx, { project, userId: args.assigneeUserId, by: staff, text: `Punch item for you: ${title}`, now: args.now });
    return id;
  },
});

export const updatePunch = mutation({
  args: { punchId: v.id("punchItems"), title: v.string(), details: v.string(), required: v.boolean(), ...assignee, now: v.number() },
  handler: async (ctx, args) => {
    const { item, project, staff } = await loadPunch(ctx, args.punchId);
    const title = text(args.title, 200, "The title");
    if (!title) throw new ConvexError("Say what needs fixing.");
    await checkAssignees(ctx, project, args);
    await ctx.db.patch(item._id, {
      title, details: text(args.details, 5000, "The details"), required: args.required,
      assigneeUserId: args.assigneeUserId ?? undefined, assigneeCrewId: args.assigneeCrewId ?? undefined,
    });
    if (args.assigneeUserId && args.assigneeUserId !== item.assigneeUserId) {
      await tellPerson(ctx, { project, userId: args.assigneeUserId, by: staff, text: `Punch item for you: ${title}`, now: args.now });
    }
  },
});

/** Open → Fixed (with optional photos of the fix) → Verified. Any status can go back to Open, which clears the fix and the check. */
export const setPunchStatus = mutation({
  args: { punchId: v.id("punchItems"), status: v.union(v.literal("open"), v.literal("fixed"), v.literal("verified")), files: noteFilesArg, now: v.number() },
  handler: async (ctx, args) => {
    const { item, staff } = await loadPunch(ctx, args.punchId);
    if (item.status === args.status) return;
    if (args.status === "open") {
      await deleteNoteFiles(ctx, item.fixAttachments);
      await ctx.db.patch(item._id, { status: "open", fixAttachments: [], fixedAt: undefined, fixedBy: undefined, verifiedAt: undefined, verifiedBy: undefined });
      return;
    }
    if (args.status === "fixed") {
      if (item.status !== "open") throw new ConvexError("Only an open item can be marked fixed.");
      const photos = await checkNoteFiles(ctx, args.files);
      await ctx.db.patch(item._id, { status: "fixed", fixAttachments: photos, fixedAt: args.now, fixedBy: staff.name });
      return;
    }
    if (item.status !== "fixed") throw new ConvexError("Mark the item fixed before it is verified.");
    await ctx.db.patch(item._id, { status: "verified", verifiedAt: args.now, verifiedBy: staff.name });
  },
});

export const deletePunch = mutation({
  args: { punchId: v.id("punchItems") },
  handler: async (ctx, args) => {
    const { item } = await loadPunch(ctx, args.punchId);
    await deleteNoteFiles(ctx, item.attachments);
    await deleteNoteFiles(ctx, item.fixAttachments);
    await ctx.db.delete(item._id);
  },
});

/* ---- Completion sign-off ---- */

function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

/** Gets the sign-off ready: needs every required punch item verified. It keeps the punch list as it is now and a summary of the work,
 *  and makes the secret link for the customer. A sign-off still waiting is replaced by the new one (its link stops working). */
export const requestSignoff = mutation({
  args: { id: v.id("opportunities"), summary: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const { project, staff } = await loadProject(ctx, args.id);
    const all = await signoffsOf(ctx, project._id);
    if (all.some((s) => s.status === "signed")) throw new ConvexError("The customer has already signed off this project.");
    const state = await completionState(ctx, project._id);
    if (state.openRequired > 0) throw new ConvexError(completionBlock(state));
    for (const s of all) if (s.status === "pending") await ctx.db.patch(s._id, { status: "cancelled", shareToken: undefined });
    const items = await punchItemsOf(ctx, project._id);
    const token = newToken();
    const signoffId = await ctx.db.insert("signoffs", {
      opportunityId: project._id, businessId: project.businessId, status: "pending", summary: text(args.summary, 5000, "The summary"),
      punchSnapshot: items.sort((a, b) => a.createdAt - b.createdAt).map((i) => ({ title: i.title, required: i.required, status: i.status })),
      shareToken: token, createdBy: staff.name, createdAt: args.now,
    });
    return { signoffId, token };
  },
});

export const cancelSignoff = mutation({
  args: { signoffId: v.id("signoffs") },
  handler: async (ctx, args) => {
    const signoff = await ctx.db.get(args.signoffId);
    if (signoff === null || signoff.status !== "pending") return;
    await loadProject(ctx, signoff.opportunityId);
    await ctx.db.patch(signoff._id, { status: "cancelled", shareToken: undefined });
  },
});

/** Records the customer's signature on a pending sign-off, from a staff device or the customer's link. Refused if a required punch item
 *  was opened again since the sign-off was made. Then the project moves to the last construction stage by itself, or, if it cannot (not
 *  in Construction, archived), the Office team is told. */
export async function recordSignature(
  ctx: MutationCtx,
  signoff: Doc<"signoffs">,
  a: { signedBy: string; signatureStorageId: Id<"_storage">; via: "device" | "link"; by: Staff | { name: string }; now: number },
) {
  if (signoff.status !== "pending") throw new ConvexError("This sign-off is no longer waiting for a signature.");
  const name = a.signedBy.trim();
  if (name.length < 1 || name.length > 100) throw new ConvexError("Type the name of the person signing.");
  const state = await completionState(ctx, signoff.opportunityId);
  if (state.openRequired > 0) throw new ConvexError("The punch list changed since this sign-off was made. Ask the team for a new one.");
  await checkImage(ctx, a.signatureStorageId, "The signature");
  await ctx.db.patch(signoff._id, { status: "signed", signedBy: name, signedAt: a.now, signedVia: a.via, signatureImageId: a.signatureStorageId, shareToken: undefined });
  const project = await ctx.db.get(signoff.opportunityId);
  if (project === null) return;
  const moved = await completeConstruction(ctx, project, { name: a.via === "link" ? name : a.by.name, ...("userId" in a.by ? { userId: a.by.userId } : {}) }, a.now);
  if (!moved) await tellOffice(ctx, { project, by: a.by, text: `${name} signed off ${project.title}.`, now: a.now });
}

export const signOnDevice = mutation({
  args: { signoffId: v.id("signoffs"), signedBy: v.string(), signatureStorageId: v.id("_storage"), now: v.number() },
  handler: async (ctx, args) => {
    const signoff = await ctx.db.get(args.signoffId);
    if (signoff === null) throw new ConvexError("That sign-off no longer exists.");
    const { staff } = await loadProject(ctx, signoff.opportunityId);
    await recordSignature(ctx, signoff, { signedBy: args.signedBy, signatureStorageId: args.signatureStorageId, via: "device", by: staff, now: args.now });
  },
});
