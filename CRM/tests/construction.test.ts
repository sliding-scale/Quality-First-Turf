/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PREPLANNING_STAGES } from "../../convex/crm/lib/stages";
import { signedInAs } from "./helpers";
import { NOW, seeded } from "./pipelineSeed";
import { signedQuote } from "./quoteSeed";

/** A project taken through Sales and Preplanning to "Ready to Start" in Construction, plus an Office person to watch the bell. */
async function onSite() {
  const w = await seeded();
  const office = await signedInAs(w.base, { key: "office-9", roles: ["office"], businessIds: [w.qft], name: "Olga Office" });
  await signedQuote(w);
  await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: "Closed Won", now: NOW });
  await w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: PREPLANNING_STAGES[PREPLANNING_STAGES.length - 1], now: NOW + 1 });
  await w.admin.mutation(api.crm.pipeline.startConstruction, { id: w.project, now: NOW + 2 });
  const picture = () => w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(300)], { type: "image/png" }))) as Promise<Id<"_storage">>;
  const doc = () => w.base.run((ctx) => ctx.db.get(w.project));
  return { ...w, office, picture, doc };
}

const FINAL = "100% Completed & Sign-off";

describe("Construction management (D-081)", () => {
  it("blocks the last stage until required punch items are verified and the customer signs, then signing moves it there", async () => {
    const w = await onSite();
    await expect(w.pm.mutation(api.crm.pipeline.moveStage, { id: w.project, to: FINAL, now: NOW + 3 })).rejects.toThrow(/not signed off/);

    const seam = await w.pm.mutation(api.crm.construction.addPunch, { id: w.project, title: "Seam lifting by the gate", details: "", required: true, now: NOW + 3 });
    await w.pm.mutation(api.crm.construction.addPunch, { id: w.project, title: "Sweep the drive", details: "", required: false, now: NOW + 3 });
    await expect(w.admin.mutation(api.crm.pipeline.moveStage, { id: w.project, to: FINAL, now: NOW + 4 })).rejects.toThrow(/1 required punch item still needs/);
    await expect(w.pm.mutation(api.crm.construction.requestSignoff, { id: w.project, summary: "Turf installed", now: NOW + 4 })).rejects.toThrow(/punch item/);

    // Open → Fixed → Verified, in that order.
    await expect(w.pm.mutation(api.crm.construction.setPunchStatus, { punchId: seam, status: "verified", now: NOW + 5 })).rejects.toThrow(/fixed before/);
    await w.pm.mutation(api.crm.construction.setPunchStatus, { punchId: seam, status: "fixed", files: [{ storageId: await w.picture(), name: "after.png" }], now: NOW + 5 });
    await w.pm.mutation(api.crm.construction.setPunchStatus, { punchId: seam, status: "verified", now: NOW + 6 });

    // The optional item does not hold anything up.
    const { signoffId } = await w.pm.mutation(api.crm.construction.requestSignoff, { id: w.project, summary: "Turf installed, edges trimmed", now: NOW + 7 });
    expect((await w.doc())?.stage).toBe("Ready to Start");
    await w.pm.mutation(api.crm.construction.signOnDevice, { signoffId, signedBy: "Maya Patel", signatureStorageId: await w.picture(), now: NOW + 8 });

    expect(await w.doc()).toMatchObject({ pipeline: "Construction", stage: FINAL });
    const history = await w.admin.query(api.crm.pipeline.history, { id: w.project });
    expect(history[0]).toMatchObject({ from: "Ready to Start", to: FINAL, note: "Customer signed off", byName: "Pat PM" });
    const told = await w.office.query(api.crm.mentions.mine, {});
    expect(told.items.some((i) => i.excerpt.includes(FINAL))).toBe(true);

    const page = await w.admin.query(api.crm.construction.get, { id: w.project });
    expect(page?.signoff).toMatchObject({ status: "signed", signedBy: "Maya Patel", signedVia: "device", token: null });
    expect(page?.signoff?.signatureUrl).toBeTruthy();
    expect(page?.signoff?.punchSnapshot).toEqual([
      { title: "Seam lifting by the gate", required: true, status: "verified" },
      { title: "Sweep the drive", required: false, status: "open" },
    ]);
    expect(page?.completion).toMatchObject({ ready: true, signed: true, openRequired: 0 });
    await expect(w.pm.mutation(api.crm.construction.requestSignoff, { id: w.project, summary: "", now: NOW + 9 })).rejects.toThrow(/already signed/);
  });

  it("lets the customer sign through the secret link, once, and shows them only this project", async () => {
    const w = await onSite();
    const { token } = await w.sales.mutation(api.crm.construction.requestSignoff, { id: w.project, summary: "All done", now: NOW + 3 });
    const shown = await w.base.query(api.crm.clientSignoff.get, { token });
    expect(shown).toMatchObject({ title: "Test turf", code: "TST-001", summary: "All done", punch: [] });
    expect(await w.base.query(api.crm.clientSignoff.get, { token: "x".repeat(64) })).toBeNull();

    await expect(w.base.mutation(api.crm.clientSignoff.sign, { token, signedBy: " ", signatureStorageId: await w.picture() })).rejects.toThrow(/name/);
    await w.base.mutation(api.crm.clientSignoff.sign, { token, signedBy: "Maya Patel", signatureStorageId: await w.picture() });
    expect((await w.doc())?.stage).toBe(FINAL);
    expect((await w.admin.query(api.crm.pipeline.history, { id: w.project }))[0]).toMatchObject({ byName: "Maya Patel", note: "Customer signed off" });
    // The link closes once it is used.
    expect(await w.base.query(api.crm.clientSignoff.get, { token })).toBeNull();
    await expect(w.base.mutation(api.crm.clientSignoff.sign, { token, signedBy: "Maya Patel", signatureStorageId: await w.picture() })).rejects.toThrow(/no longer open/);
  });

  it("refuses a signature if a required item was added after the sign-off was made, and a new sign-off replaces the old link", async () => {
    const w = await onSite();
    const first = await w.pm.mutation(api.crm.construction.requestSignoff, { id: w.project, summary: "", now: NOW + 3 });
    await w.pm.mutation(api.crm.construction.addPunch, { id: w.project, title: "Gap at the curb", details: "", required: true, now: NOW + 4 });
    await expect(w.pm.mutation(api.crm.construction.signOnDevice, { signoffId: first.signoffId, signedBy: "Maya", signatureStorageId: await w.picture(), now: NOW + 5 })).rejects.toThrow(/punch list changed/);
    expect((await w.doc())?.stage).toBe("Ready to Start");

    const [item] = (await w.admin.query(api.crm.construction.get, { id: w.project }))!.punch;
    await w.pm.mutation(api.crm.construction.setPunchStatus, { punchId: item.id, status: "fixed", now: NOW + 6 });
    await w.pm.mutation(api.crm.construction.setPunchStatus, { punchId: item.id, status: "verified", now: NOW + 7 });
    const second = await w.pm.mutation(api.crm.construction.requestSignoff, { id: w.project, summary: "", now: NOW + 8 });
    expect(await w.base.query(api.crm.clientSignoff.get, { token: first.token })).toBeNull();
    expect(await w.base.query(api.crm.clientSignoff.get, { token: second.token })).not.toBeNull();

    // Reopening clears the fix and the check.
    await w.pm.mutation(api.crm.construction.setPunchStatus, { punchId: item.id, status: "open", now: NOW + 9 });
    expect((await w.admin.query(api.crm.construction.get, { id: w.project }))!.punch[0]).toMatchObject({ status: "open", fixedBy: null, verifiedBy: null });
  });

  it("records the team, progress with photos, and tells a person given a punch item", async () => {
    const w = await onSite();
    const pmId = (await w.base.run((ctx) => ctx.db.query("users").collect())).find((u) => u.name === "Pat PM")!._id;
    const salesId = (await w.base.run((ctx) => ctx.db.query("users").collect())).find((u) => u.name === "Sam Sales")!._id;
    const crew = await w.admin.mutation(api.crm.construction.saveCrew, { businessId: w.qft, name: "Crew A", leadName: "Luis", phone: "9515550101", notes: "", active: true, now: NOW });
    await expect(w.admin.mutation(api.crm.construction.saveCrew, { businessId: w.qft, name: "crew a", leadName: "", phone: "", notes: "", active: true, now: NOW })).rejects.toThrow(/already a crew/);
    await expect(w.pm.mutation(api.crm.construction.saveCrew, { businessId: w.qft, name: "Crew B", leadName: "", phone: "", notes: "", active: true, now: NOW })).rejects.toThrow(/not change/);

    await expect(w.admin.mutation(api.crm.construction.setTeam, { id: w.project, projectManagerId: salesId, crewIds: [], now: NOW })).rejects.toThrow(/Project Manager/);
    await w.admin.mutation(api.crm.construction.setTeam, { id: w.project, projectManagerId: pmId, crewIds: [crew], now: NOW });
    await w.pm.mutation(api.crm.construction.addProgress, { id: w.project, text: "Base compacted", files: [{ storageId: await w.picture(), name: "base.png" }], now: NOW + 1 });
    await expect(w.pm.mutation(api.crm.construction.addProgress, { id: w.project, text: " ", now: NOW + 2 })).rejects.toThrow(/Write what was done/);
    await w.admin.mutation(api.crm.construction.addPunch, { id: w.project, title: "Fix the edging", details: "", required: true, assigneeUserId: pmId, now: NOW + 2 });
    await expect(w.admin.mutation(api.crm.construction.addPunch, { id: w.project, title: "Both", details: "", required: true, assigneeUserId: pmId, assigneeCrewId: crew, now: NOW + 2 })).rejects.toThrow(/not both/);

    const page = (await w.pm.query(api.crm.construction.get, { id: w.project }))!;
    expect(page).toMatchObject({ canWork: true, projectManager: { name: "Pat PM" }, crews: [{ name: "Crew A", leadName: "Luis", phone: "(951) 555-0101" }] });
    expect(page.progress[0]).toMatchObject({ text: "Base compacted", stage: "Ready to Start", author: "Pat PM" });
    expect(page.progress[0].files[0].url).toBeTruthy();
    expect(page.punch[0]).toMatchObject({ title: "Fix the edging", assigneeName: "Pat PM", status: "open" });

    const bell = await w.pm.query(api.crm.mentions.mine, {});
    const kinds = bell.items.filter((i) => i.kind === "construction");
    expect(kinds.map((i) => i.excerpt)).toEqual(expect.arrayContaining(["Punch item for you: Fix the edging", "You are the project manager on Test turf."]));
    expect(kinds[0].href).toBe(`/opportunities/${w.project}?tab=construction`);
  });

  it("books construction visits on the Schedule, and keeps it all to Construction, the right roles and the business", async () => {
    const w = await onSite();
    const visit = { businessId: w.qft, type: "visit" as const, title: "Job walk", start: NOW + 86_400_000, end: NOW + 86_400_000 + 3_600_000, assigneeIds: [], opportunityId: w.project, now: NOW };
    await w.pm.mutation(api.crm.schedule.book, { ...visit, visitKind: "jobWalk" });
    await expect(w.pm.mutation(api.crm.schedule.book, { ...visit, title: "Other" })).rejects.toThrow(/not change/);
    await expect(w.admin.mutation(api.crm.schedule.book, { ...visit, type: "event", visitKind: "install" })).rejects.toThrow(/is a visit/);
    expect((await w.admin.query(api.crm.construction.get, { id: w.project }))!.visits).toMatchObject([{ kind: "jobWalk", title: "Job walk" }]);
    // The Schedule shows it as a job walk, with the project to open from it (D-081).
    const week = await w.admin.query(api.crm.schedule.range, { businessId: w.qft, from: NOW, to: NOW + 3 * 86_400_000, types: [], assigneeIds: [], statuses: [], now: NOW });
    expect(week.items.find((i) => i.title === "Job walk")).toMatchObject({ kind: "visit", visitKind: "jobWalk", opportunityId: w.project });

    // Someone from another business sees and changes nothing.
    await expect(w.outsider.query(api.crm.construction.get, { id: w.project })).rejects.toThrow();
    await expect(w.outsider.mutation(api.crm.construction.addPunch, { id: w.project, title: "x", details: "", required: true, now: NOW })).rejects.toThrow();

    // Once the project is back in Preplanning, nothing here can change, and no visits can be booked for it.
    await w.admin.mutation(api.crm.pipeline.returnToPreplanning, { id: w.project, now: NOW + 1 });
    await expect(w.admin.mutation(api.crm.construction.addPunch, { id: w.project, title: "x", details: "", required: true, now: NOW })).rejects.toThrow(/not in Construction/);
    await expect(w.admin.mutation(api.crm.schedule.book, { ...visit, visitKind: "install" })).rejects.toThrow(/in Construction/);
    expect((await w.admin.query(api.crm.construction.get, { id: w.project }))!.canWork).toBe(false);
  });

  it("deletes a project's construction records and photos with its client", async () => {
    const w = await onSite();
    const photo = await w.picture();
    await w.pm.mutation(api.crm.construction.addProgress, { id: w.project, text: "Day 1", files: [{ storageId: photo, name: "d1.png" }], now: NOW + 1 });
    await w.pm.mutation(api.crm.construction.addPunch, { id: w.project, title: "x", details: "", required: true, now: NOW + 1 });
    await w.pm.mutation(api.crm.construction.requestSignoff, { id: w.project, summary: "", now: NOW + 2 }).catch(() => undefined);
    await w.admin.mutation(api.crm.clients.remove, { ids: [w.clientId] });
    const left = await w.base.run(async (ctx) => ({
      progress: (await ctx.db.query("progressUpdates").collect()).length,
      punch: (await ctx.db.query("punchItems").collect()).length,
      signoffs: (await ctx.db.query("signoffs").collect()).length,
      photo: await ctx.storage.getUrl(photo),
    }));
    expect(left).toEqual({ progress: 0, punch: 0, signoffs: 0, photo: null });
  });
});
