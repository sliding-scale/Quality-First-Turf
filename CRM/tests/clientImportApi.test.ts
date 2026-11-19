/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { ImportClient } from "../../convex/crm/lib/clientImport";
import { readClientsCsv } from "../../convex/crm/lib/clientImport";
import { seeded } from "./pipelineSeed";

const NOW = Date.UTC(2026, 10, 20);
type World = Awaited<ReturnType<typeof seeded>>;

const row = (over: Partial<ImportClient> = {}): Omit<ImportClient, never> => ({
  line: 2, type: "homeowner", isCompany: false, country: "", extraProperties: [], first: "Imp", last: "Orted", company: "", phone: "", email: "", street1: "1 Main St", street2: "", city: "Corona", state: "CA", zip: "92879", notes: "",
  extraPhones: [], extraEmails: [], tags: [], status: "active", ...over,
});
const count = (w: World, businessId = w.qft) => w.base.run(async (ctx) => (await ctx.db.query("clients").collect()).filter((c) => c.businessId === businessId).length);
const byName = (w: World, name: string) => w.base.run(async (ctx) => (await ctx.db.query("clients").collect()).filter((c) => c.name === name));

describe("Client import (plan 2026-11-20-client-import)", () => {
  it("previews without writing, then creates the same rows", async () => {
    const w = await seeded();
    const before = await count(w);
    const rows = [row({ line: 2, first: "Ana", last: "Ruiz", email: "Ana@Example.com", phone: "5551230001" }), row({ line: 3, first: "Bo", last: "Li" })];
    const p = await w.admin.query(api.crm.clientImport.preview, { businessId: w.qft, rows });
    expect(p.map((r) => [r.line, r.status, r.message])).toEqual([[2, "new", "Will be imported."], [3, "new", "Will be imported."]]);
    expect(await count(w)).toBe(before);
    const r = await w.admin.mutation(api.crm.clientImport.run, { businessId: w.qft, rows, now: NOW });
    expect(r.map((x) => x.status)).toEqual(["new", "new"]);
    expect(await count(w)).toBe(before + 2);
    const [ana] = await byName(w, "Ana Ruiz");
    expect(ana).toMatchObject({ email: "ana@example.com", phone: "(555) 123-0001", status: "active", tags: ["Homeowner"], firstName: "Ana", lastName: "Ruiz", createdAt: NOW, lastActivityAt: NOW });
    expect(ana.phones).toEqual([{ number: "(555) 123-0001", description: "Main" }]);
    expect(ana.emails).toEqual([{ address: "ana@example.com", description: "Main" }]);
    expect(ana.searchText).toContain("Ana Ruiz");
  });

  it("skips a client already here by email, then by phone, and a second run changes nothing", async () => {
    const w = await seeded();
    const rows = [row({ first: "Ana", last: "Ruiz", email: "ana@example.com", phone: "5551230001" })];
    await w.admin.mutation(api.crm.clientImport.run, { businessId: w.qft, rows, now: NOW });
    const again = await w.admin.mutation(api.crm.clientImport.run, {
      businessId: w.qft, now: NOW,
      rows: [row({ line: 5, first: "Ana R", last: "", email: "ANA@example.com" }), row({ line: 6, first: "Other", last: "Name", phone: "(555) 123-0001" }), row({ line: 7, first: "New", last: "Person", email: "new@example.com" })],
    });
    expect(again.map((r) => [r.line, r.status])).toEqual([[5, "duplicate"], [6, "duplicate"], [7, "new"]]);
    expect(again[0].message).toMatch(/Already a client \(Ana Ruiz\) with the same email/);
    expect(again[1].message).toMatch(/the same phone number/);
    expect(again[0].clientId).toBeTruthy();
    const total = await count(w);
    await w.admin.mutation(api.crm.clientImport.run, { businessId: w.qft, rows, now: NOW });
    expect(await count(w)).toBe(total);
  });

  it("catches the same person twice in one batch", async () => {
    const w = await seeded();
    const r = await w.admin.mutation(api.crm.clientImport.run, { businessId: w.qft, now: NOW, rows: [row({ line: 2, email: "dup@example.com" }), row({ line: 3, first: "Other", email: "dup@example.com" })] });
    expect(r.map((x) => x.status)).toEqual(["new", "duplicate"]);
  });

  it("reports a bad row with its line and why, and imports the others", async () => {
    const w = await seeded();
    const before = await count(w);
    const r = await w.admin.mutation(api.crm.clientImport.run, {
      businessId: w.qft, now: NOW,
      rows: [row({ line: 2, email: "not an email" }), row({ line: 3, phone: "12345" }), row({ line: 4, state: "ZZ" }), row({ line: 5, first: "", last: "" }), row({ line: 6, zip: "123" }), row({ line: 7, first: "Good", last: "One" })],
    });
    expect(r.map((x) => [x.line, x.status])).toEqual([[2, "error"], [3, "error"], [4, "error"], [5, "error"], [6, "error"], [7, "new"]]);
    expect(r[0].message).toMatch(/valid email/);
    expect(r[1].message).toMatch(/10-digit phone/);
    expect(r[2].message).toMatch(/state/);
    expect(r[3].message).toMatch(/first name, last name or company/);
    expect(r[4].message).toMatch(/ZIP/);
    expect(await count(w)).toBe(before + 1);
  });

  it("keeps extra phones and emails, leaves out bad ones and says so, keeps known tags, status and a past created date", async () => {
    const w = await seeded();
    const [r] = await w.admin.mutation(api.crm.clientImport.run, {
      businessId: w.qft, now: NOW,
      rows: [row({
        type: "contractor", first: "", last: "", company: "Turf Pros", phone: "5551230009", extraPhones: [{ number: "5551230010", description: "Mobile" }, { number: "123", description: "Work" }],
        email: "pros@example.com", extraEmails: [{ address: "ops@example.com", description: "Other" }, { address: "nope", description: "Other" }], tags: ["partner contractor", "Whatever"],
        status: "lead", createdAt: Date.UTC(2023, 0, 5),
      })],
    });
    expect(r.message).toBe('Imported; the phone "123" was left out; the email "nope" was left out.');
    const [c] = await byName(w, "Turf Pros");
    expect(c).toMatchObject({ type: "contractor", company: "Turf Pros", tags: ["Partner Contractor"], status: "lead", createdAt: Date.UTC(2023, 0, 5), isCompany: true });
    expect(c.phones).toEqual([{ number: "(555) 123-0009", description: "Main" }, { number: "(555) 123-0010", description: "Mobile" }]);
    expect(c.emails).toEqual([{ address: "pros@example.com", description: "Main" }, { address: "ops@example.com", description: "Other" }]);
    // A created date in the future is not trusted.
    const [f] = await w.admin.mutation(api.crm.clientImport.run, { businessId: w.qft, now: NOW, rows: [row({ first: "Future", last: "Client", createdAt: NOW + 86_400_000 })] });
    expect((await byName(w, "Future Client"))[0].createdAt).toBe(NOW);
    expect(f.status).toBe("new");
  });

  it("does not match clients of another business, and is for Admins only", async () => {
    const w = await seeded();
    const theirs = await w.base.run(async (ctx) => (await ctx.db.query("clients").collect()).find((c) => c.businessId === w.other && c.email)!);
    const r = await w.admin.mutation(api.crm.clientImport.run, { businessId: w.qft, now: NOW, rows: [row({ first: "Same", last: "Email", email: theirs.email })] });
    expect(r[0].status).toBe("new");
    await expect(w.outsider.query(api.crm.clientImport.preview, { businessId: w.qft, rows: [row()] })).rejects.toThrow();
    await expect(w.office.query(api.crm.clientImport.preview, { businessId: w.qft, rows: [row()] })).rejects.toThrow(/Only an Admin/);
    await expect(w.sales.mutation(api.crm.clientImport.run, { businessId: w.qft, rows: [row()], now: NOW })).rejects.toThrow();
  });

  it("refuses more than 100 rows at a time", async () => {
    const w = await seeded();
    const rows = Array.from({ length: 101 }, (_, i) => row({ line: i + 2, first: `P${i}`, last: "X" }));
    await expect(w.admin.mutation(api.crm.clientImport.run, { businessId: w.qft, rows, now: NOW })).rejects.toThrow(/at most 100/);
  });

  it("keeps a company flag, a balance and a client's other addresses as properties", async () => {
    const w = await seeded();
    const extra = { street1: "9 Elm Rd", street2: "", city: "Corona", state: "ca", zip: "92879", country: "United States" };
    await w.admin.mutation(api.crm.clientImport.run, { businessId: w.qft, now: NOW, rows: [row({ first: "Pat", last: "Prop", type: "contractor", isCompany: true, company: "Prop Ltd", balanceCents: 12500, country: "United States", extraProperties: [extra] })] });
    const [c] = await byName(w, "Prop Ltd");
    expect(c).toMatchObject({ isCompany: true, balanceCents: 12500, street1: "1 Main St" });
    expect(c.properties).toEqual([
      { street1: "1 Main St", street2: "", city: "Corona", state: "CA", zip: "92879", country: "United States", lawnSize: "", lockedGate: false },
      { street1: "9 Elm Rd", street2: "", city: "Corona", state: "CA", zip: "92879", country: "United States", lawnSize: "", lockedGate: false },
    ]);
    // With one address there is no properties list, as for a client typed in.
    await w.admin.mutation(api.crm.clientImport.run, { businessId: w.qft, now: NOW, rows: [row({ first: "One", last: "Address" })] });
    expect((await byName(w, "One Address"))[0].properties).toBeUndefined();
  });

  it("imports Jobber's real sample columns with state names turned into letters", async () => {
    const w = await seeded();
    const parsed = readClientsCsv([
      "Client Created Date,Client Is Company?,Client First Name,Client Last Name,Client Company Name,Client Email,Client Main Phone,Client Mobile Phone,Property Street 1,Property City,Property State/Province,Property Zip/Postal Code,Archived (True/False),Account Balance,Tags",
      "11/5/2025,FALSE,Cal,Ifornia,,cal@example.com,951-555-0188,951-555-0189,1 Palm Dr,San Jacinto,California,92582,FALSE,40,Homeowner",
    ].join("\r\n"));
    const r = await w.admin.mutation(api.crm.clientImport.run, { businessId: w.qft, rows: parsed.rows, now: NOW });
    expect(r[0].status).toBe("new");
    const [c] = await byName(w, "Cal Ifornia");
    expect(c).toMatchObject({ state: "CA", zip: "92582", phone: "(951) 555-0188", balanceCents: 4000, status: "active", createdAt: Date.UTC(2025, 10, 5) });
    expect(c.phones).toEqual([{ number: "(951) 555-0188", description: "Main" }, { number: "(951) 555-0189", description: "Mobile" }]);
  });

  it("imports a Jobber-style file end to end", async () => {
    const w = await seeded();
    const parsed = readClientsCsv([
      "First name,Last name,Company name,Email,Main phone,Mobile phone,Street 1,City,State,Zip code,Tags,Status,Created date",
      "Ana,Ruiz,,ana@example.com,(555) 123-4567,555.987.6543,12 Oak St,Temecula,CA,92592,Homeowner,Active,3/5/2024",
      ",,Turf Pros,,5551230009,,9 Elm Rd,Corona,CA,92879,Partner Contractor,Active,2023-01-05",
    ].join("\r\n"));
    const r = await w.admin.mutation(api.crm.clientImport.run, { businessId: w.qft, rows: parsed.rows, now: NOW });
    expect(r.map((x) => x.status)).toEqual(["new", "new"]);
    expect((await byName(w, "Turf Pros"))[0].type).toBe("contractor");
    expect((await byName(w, "Ana Ruiz"))[0].createdAt).toBe(Date.UTC(2024, 2, 5));
  });
});
