/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { excerpt, findTags, mentionedIds, splitTags, tagQuery } from "../../convex/crm/lib/mentions";
import { seeded } from "./pipelineSeed";

const team = [{ id: "a", name: "Sam Sales" }, { id: "b", name: "Sam" }, { id: "c", name: "Pat PM" }];

describe("tagging rules", () => {
  it("finds @Name, the longest name first, case-insensitively", () => {
    expect(mentionedIds("Hi @Sam Sales and @pat pm, thanks", team)).toEqual(["a", "c"]);
    expect(mentionedIds("@Sam can you look?", team)).toEqual(["b"]);
    expect(mentionedIds("@Sam Sales then @Sam", team)).toEqual(["a", "b"]);
  });

  it("does not tag inside a longer word, an email address or without the @", () => {
    expect(mentionedIds("Call Sam Sales tomorrow", team)).toEqual([]);
    expect(mentionedIds("mail x@Sam.com", team)).toEqual([]);
    expect(mentionedIds("@Samuel is here", team)).toEqual([]);
    expect(mentionedIds("@Sam, @Sam.", team)).toEqual(["b"]);
  });

  it("cuts a note into plain pieces and tags for colouring", () => {
    expect(splitTags("Hi @Pat PM, ok?", team)).toEqual([{ text: "Hi ", tag: false }, { text: "@Pat PM", tag: true }, { text: ", ok?", tag: false }]);
    expect(findTags("no tags", team)).toEqual([]);
  });

  it("works out what the picker is being asked for", () => {
    expect(tagQuery("hello @", 7)).toEqual({ start: 6, query: "" });
    expect(tagQuery("hello @sa", 9)).toEqual({ start: 6, query: "sa" });
    expect(tagQuery("hello @Sam Sa", 13)).toEqual({ start: 6, query: "Sam Sa" });
    expect(tagQuery("mail x@sa", 9)).toBeNull();
    expect(tagQuery("hello @sam\nnext", 15)).toBeNull();
    expect(tagQuery("no at sign", 5)).toBeNull();
  });

  it("shortens a long note for the notification", () => {
    expect(excerpt("a\n\n  b")).toBe("a b");
    expect(excerpt("x".repeat(300)).length).toBe(140);
  });
});

describe("tagging a person in a note", () => {
  it("tells the tagged person, not the writer, and only people on the business", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.opportunityTasks.addNote, { id: w.project, text: "@Pat PM please check, @Sam Sales (me), @Olive Outsider too", files: [] });
    const pm = await w.pm.query(api.crm.mentions.mine, {});
    expect(pm.unread).toBe(1);
    expect(pm.items[0]).toMatchObject({ byName: "Sam Sales", kind: "project", where: "Test turf", href: `/requests/${w.project}`, read: false });
    expect(pm.items[0].excerpt).toContain("please check");
    expect((await w.sales.query(api.crm.mentions.mine, {})).unread).toBe(0); // tagging yourself tells nobody
    expect((await w.outsider.query(api.crm.mentions.mine, {})).unread).toBe(0); // not on this business
  });

  it("marks one or all as read, and only your own", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.opportunityTasks.addNote, { id: w.project, text: "@Pat PM one", files: [] });
    await w.sales.mutation(api.crm.opportunityTasks.addNote, { id: w.project, text: "@Pat PM two", files: [] });
    const { items } = await w.pm.query(api.crm.mentions.mine, {});
    await expect(w.sales.mutation(api.crm.mentions.markRead, { id: items[0].id, now: 1 })).rejects.toThrow();
    await w.pm.mutation(api.crm.mentions.markRead, { id: items[0].id, now: 1 });
    expect((await w.pm.query(api.crm.mentions.mine, {})).unread).toBe(1);
    await w.pm.mutation(api.crm.mentions.markRead, { now: 2 });
    expect((await w.pm.query(api.crm.mentions.mine, {})).unread).toBe(0);
  });

  it("works for a client note and a quote note, and for the note made with a new request", async () => {
    const w = await seeded();
    await w.sales.mutation(api.crm.clients.addNote, { clientId: w.clientId, text: "@Pat PM client note", files: [] });
    const made = await w.sales.mutation(api.crm.requests.create, { businessId: w.qft, clientId: w.clientId, title: "Patio", note: "@Pat PM new request" });
    const { items } = await w.pm.query(api.crm.mentions.mine, {});
    expect(items.map((i) => i.kind).sort()).toEqual(["client", "project"]);
    expect(items.find((i) => i.kind === "project")?.href).toBe(`/requests/${made}`);
    expect(items.find((i) => i.kind === "client")?.href).toBe(`/clients/${w.clientId}`);
  });
});
