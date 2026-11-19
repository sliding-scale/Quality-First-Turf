/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { seeded } from "./pipelineSeed";

const D = Date.UTC(2026, 10, 19);
type World = Awaited<ReturnType<typeof seeded>>;
const template = (w: World, name: string, items: string[]) => w.office.mutation(api.crm.checklists.saveTemplate, { businessId: w.qft, name, items, now: D });
const newJob = (w: World) => w.office.mutation(api.crm.jobs.create, { businessId: w.qft, clientId: w.clientId, title: "Job", now: D });

describe("Checklists (plan 2026-11-19-jobs-extras)", () => {
  it("saves a template, trims it, and refuses a duplicate name, no items and a blank name", async () => {
    const w = await seeded();
    const id = await template(w, "  Install day ", [" Mark the area ", "", "Lay base"]);
    expect((await w.office.query(api.crm.checklists.templates, { businessId: w.qft }))).toEqual([{ id, name: "Install day", items: ["Mark the area", "Lay base"] }]);
    await expect(template(w, "install DAY", ["x"])).rejects.toThrow(/already exists/);
    await expect(template(w, "Empty", ["  "])).rejects.toThrow(/at least one item/);
    await expect(template(w, " ", ["x"])).rejects.toThrow(/name/);
  });

  it("copies a template onto a job, once, and ticking records who and when", async () => {
    const w = await seeded();
    const t = await template(w, "Install day", ["Mark the area", "Lay base"]);
    const job = await newJob(w);
    await w.office.mutation(api.crm.checklists.attach, { id: job, templateId: t });
    await expect(w.office.mutation(api.crm.checklists.attach, { id: job, templateId: t })).rejects.toThrow(/already has that checklist/);
    let lists = await w.office.query(api.crm.checklists.forJob, { id: job });
    expect(lists).toHaveLength(1);
    expect(lists[0].items.map((i) => [i.text, i.done])).toEqual([["Mark the area", false], ["Lay base", false]]);
    await w.office.mutation(api.crm.checklists.setDone, { itemId: lists[0].items[0].id, done: true, now: D });
    lists = await w.office.query(api.crm.checklists.forJob, { id: job });
    expect(lists[0].items[0]).toMatchObject({ done: true, doneByName: "Olga Office", doneAt: D });
    await w.office.mutation(api.crm.checklists.setDone, { itemId: lists[0].items[0].id, done: false, now: D });
    expect((await w.office.query(api.crm.checklists.forJob, { id: job }))[0].items[0]).toMatchObject({ done: false, doneByName: null });
  });

  it("leaves a job's copy alone when the template changes or is deleted, and detaches a list", async () => {
    const w = await seeded();
    const t = await template(w, "Install day", ["Mark the area"]);
    const job = await newJob(w);
    await w.office.mutation(api.crm.checklists.attach, { id: job, templateId: t });
    await w.office.mutation(api.crm.checklists.saveTemplate, { id: t, businessId: w.qft, name: "Install day", items: ["Changed"], now: D });
    await w.office.mutation(api.crm.checklists.removeTemplate, { id: t });
    expect((await w.office.query(api.crm.checklists.forJob, { id: job }))[0].items[0].text).toBe("Mark the area");
    await w.office.mutation(api.crm.checklists.detach, { id: job, listName: "Install day" });
    expect(await w.office.query(api.crm.checklists.forJob, { id: job })).toEqual([]);
  });

  it("lets Sales look but not change, and the checklists go with a deleted job", async () => {
    const w = await seeded();
    const t = await template(w, "Install day", ["Mark the area"]);
    const job = await newJob(w);
    await w.office.mutation(api.crm.checklists.attach, { id: job, templateId: t });
    expect(await w.sales.query(api.crm.checklists.forJob, { id: job })).toHaveLength(1);
    await expect(w.sales.mutation(api.crm.checklists.attach, { id: job, templateId: t })).rejects.toThrow(/can view this but not change it/);
    await expect(w.sales.mutation(api.crm.checklists.saveTemplate, { businessId: w.qft, name: "Other", items: ["x"], now: D })).rejects.toThrow(/can view this but not change it/);
    await w.admin.mutation(api.crm.jobs.remove, { id: job });
    expect((await w.base.run((ctx) => ctx.db.query("jobChecklistItems").collect())).length).toBe(0);
  });
});
