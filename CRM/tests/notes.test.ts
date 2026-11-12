/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { continueList, parseLine, parseNote, toggleCheckbox, toggleList } from "../../convex/crm/lib/noteText";
import { seeded } from "./pipelineSeed";

describe("note text (checkboxes, bullets, numbers)", () => {
  it("reads each kind of line", () => {
    expect(parseLine("- [ ] call back")).toEqual({ kind: "check", done: false, text: "call back" });
    expect(parseLine("- [x] sent quote")).toEqual({ kind: "check", done: true, text: "sent quote" });
    expect(parseLine("- ask about the gate")).toEqual({ kind: "bullet", text: "ask about the gate" });
    expect(parseLine("2. second")).toEqual({ kind: "number", n: 2, text: "second" });
    expect(parseLine("plain")).toEqual({ kind: "text", text: "plain" });
    expect(parseNote("a\n- b")).toHaveLength(2);
  });

  it("ticks and unticks one checkbox and refuses a line that is not one", () => {
    const t = "Todo\n- [ ] one\n- [ ] two";
    const ticked = toggleCheckbox(t, 2)!;
    expect(ticked).toBe("Todo\n- [ ] one\n- [x] two");
    expect(toggleCheckbox(ticked, 2)).toBe(t);
    expect(toggleCheckbox(t, 0)).toBeNull();
    expect(toggleCheckbox(t, 9)).toBeNull();
  });

  it("turns the selected lines into a list, and back when they all are one already", () => {
    const text = "intro\nfirst\nsecond\noutro";
    const sel = text.indexOf("first");
    const bullets = toggleList(text, sel, text.indexOf("second") + 2, "bullet");
    expect(bullets.text).toBe("intro\n- first\n- second\noutro");
    expect(toggleList(bullets.text, bullets.start, bullets.end, "bullet").text).toBe(text);
    expect(toggleList(text, sel, sel, "check").text).toBe("intro\n- [ ] first\nsecond\noutro");
    expect(toggleList(text, sel, text.indexOf("second"), "number").text).toBe("intro\n1. first\n2. second\noutro");
    // switching style keeps the words
    expect(toggleList("- [ ] a", 0, 0, "bullet").text).toBe("- a");
  });

  it("keeps a list going on Enter and ends it on an empty item", () => {
    expect(continueList("- [x] done")).toEqual({ insert: "\n- [ ] " });
    expect(continueList("- a")).toEqual({ insert: "\n- " });
    expect(continueList("3. c")).toEqual({ insert: "\n4. " });
    expect(continueList("- ")).toEqual({ clear: true });
    expect(continueList("hello")).toBeNull();
  });
});

describe("notes with photos and voice notes", () => {
  const store = (w: Awaited<ReturnType<typeof seeded>>, bytes: number, type: string) => w.base.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type }))) as Promise<Id<"_storage">>;

  it("saves a client note with a photo and a voice note, returns links, and lets a checkbox be ticked", async () => {
    const w = await seeded();
    const photo = await store(w, 500, "image/jpeg");
    const voice = await store(w, 800, "audio/webm");
    const id = await w.sales.mutation(api.crm.clients.addNote, { clientId: w.clientId, text: "To do\n- [ ] call back", files: [{ storageId: photo, name: "gate.jpg" }, { storageId: voice, name: "Voice note" }] });
    const notes = await w.sales.query(api.crm.clients.notes, { clientId: w.clientId });
    const n = notes.find((x) => x._id === id)!;
    expect(n.files.map((f) => f.kind).sort()).toEqual(["audio", "image"]);
    expect(n.files.every((f) => f.url.length > 0)).toBe(true);
    await w.sales.mutation(api.crm.clients.toggleNoteLine, { noteId: id, line: 1 });
    expect((await w.sales.query(api.crm.clients.notes, { clientId: w.clientId })).find((x) => x._id === id)?.text).toBe("To do\n- [x] call back");
    await expect(w.sales.mutation(api.crm.clients.toggleNoteLine, { noteId: id, line: 0 })).rejects.toThrow(/not a checkbox/);
  });

  it("allows a note that is only a voice note, and refuses an empty one", async () => {
    const w = await seeded();
    const voice = await store(w, 300, "audio/mp4");
    await w.sales.mutation(api.crm.opportunityTasks.addNote, { id: w.project, text: "", files: [{ storageId: voice, name: "Voice note" }] });
    const { notes } = await w.sales.query(api.crm.opportunityTasks.listForProject, { id: w.project });
    expect(notes[0].files[0].kind).toBe("audio");
    await expect(w.sales.mutation(api.crm.opportunityTasks.addNote, { id: w.project, text: "  " })).rejects.toThrow(/Write something/);
  });

  it("refuses files that are not photos or audio, and files that are too big", async () => {
    const w = await seeded();
    const pdf = await store(w, 100, "application/pdf");
    await expect(w.sales.mutation(api.crm.clients.addNote, { clientId: w.clientId, text: "x", files: [{ storageId: pdf, name: "a.pdf" }] })).rejects.toThrow(/Only photos and voice notes/);
    const big = await store(w, 16 * 1024 * 1024, "image/png");
    await expect(w.sales.mutation(api.crm.clients.addNote, { clientId: w.clientId, text: "x", files: [{ storageId: big, name: "b.png" }] })).rejects.toThrow(/15 MB/);
  });

  it("lets only people who can edit get an upload link or tick a box", async () => {
    const w = await seeded();
    await expect(w.pm.mutation(api.crm.noteFiles.generateUploadUrl, {})).rejects.toThrow(/view this but not change/);
    expect(typeof (await w.sales.mutation(api.crm.noteFiles.generateUploadUrl, {}))).toBe("string");
    const id = await w.sales.mutation(api.crm.clients.addNote, { clientId: w.clientId, text: "- [ ] a" });
    await expect(w.pm.mutation(api.crm.clients.toggleNoteLine, { noteId: id, line: 0 })).rejects.toThrow();
    await expect(w.outsider.query(api.crm.clients.notes, { clientId: w.clientId })).rejects.toThrow();
  });

  it("deletes a client's note files with the client", async () => {
    const w = await seeded();
    const photo = await store(w, 200, "image/png");
    await w.sales.mutation(api.crm.clients.addNote, { clientId: w.clientId, text: "", files: [{ storageId: photo, name: "p.png" }] });
    await w.sales.mutation(api.crm.clients.remove, { ids: [w.clientId] });
    expect(await w.base.run((ctx) => ctx.db.system.get("_storage", photo))).toBeNull();
  });

  it("a new request can carry a voice note in its first note", async () => {
    const w = await seeded();
    const voice = await store(w, 300, "audio/webm");
    const id = await w.sales.mutation(api.crm.requests.create, { businessId: w.qft, clientId: w.clientId, title: "Gate", note: "", noteFiles: [{ storageId: voice, name: "Voice note" }] });
    const { notes } = await w.sales.query(api.crm.opportunityTasks.listForProject, { id });
    expect(notes[0].files).toHaveLength(1);
  });
});
