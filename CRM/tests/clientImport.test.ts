import { describe, expect, it } from "vitest";
import { centsFromAmount, dayFromText, fileDuplicates, readClientsCsv, stateAbbr } from "../../convex/crm/lib/clientImport";

const csv = (...lines: string[]) => lines.join("\r\n");

/** Jobber's own sample file from its "Import clients" window (help.getjobber.com), as downloaded on 2026-11-19. Phone cells hold a stray line break, as there. */
const JOBBER_SAMPLE = [
  'Client Created Date,Client Is Company?,Client Title,Client First Name,Client Last Name,Client Full Name (Display Only),Client Company Name,Client Email,Client Main Phone,Client Home Phone,Client Work Phone,Client Mobile Phone,Client Fax Phone,Client Other Phone,Client SMS Enabled Phone Number,Property Street 1,Property Street 2,Property City,Property State/Province,Property Zip/Postal Code,Property Country,Billing Street 1,Billing Street 2,Billing City,Billing State/Province,Billing Zip/Postal Code,Billing Country,Client Receives Auto Visit Reminders? (True/False),Client Receives Auto Job Follow-ups? (True/False),Client Receives Auto Quote Follow-ups? (True/False),Client Receives Auto Invoice Follow-ups? (True/False),Archived (True/False),Account Balance,Client Internal Notes,Lead Source,Tags',
  '12/25/2025,TRUE,Mr,Jason,Example,Jason Example,Example Ltd,JasonExample@example.com,800-555-0100,"\n",800-555-0165,"\n","\n","\n",800-555-0100,10520 Ave NW,111,Edmonton,Alberta,T5G 0B6,Canada,11660 Ave NW,104,Edmonton,Alberta,T5K 2T7,Canada,FALSE,FALSE,TRUE,TRUE,FALSE,100,The key is under the mat!,Google,"Summer 2026, Recurring, Lawnmowing"',
  '12/25/2025,TRUE,Mr,Jason,Example,Jason Example,Example Ltd,JasonExample@example.com,800-555-0100,"\n",800-555-0165,"\n","\n","\n",800-555-0100,15730 87 Ave NW,,Edmonton,Alberta,T5R 5W9,Canada,11660 Ave NW,104,Edmonton,Alberta,T5K 2T7,Canada,FALSE,FALSE,TRUE,TRUE,FALSE,100,Dont let cat escape,Google,"Summer 2026, Recurring, Lawnmowing"',
  '7/1/2025,TRUE,Mrs,Jane,Sample,Jane Sample,Sample Ltd,Jane@example.com,800-555-0177,800-555-0122,"\n",800-555-0138,,,800-555-0177,8415 St NW,109,Edmonton,Alberta,T6G 1E3,Canada,10305 Ave NW,80,Edmonton,Alberta,T6E 1T8,Canada,TRUE,TRUE,FALSE,FALSE,FALSE,75,Great customer! ,Facebook,"Winter 2025, Snow Removal, One Time"',
  '3/3/2025,FALSE,Mr,Jason,Test,Jason Test,,Jason@example.com,800-555-0111,"\n",800-555-0144,"\n","\n","\n",800-555-0111,8132 Ave NW,112,Edmonton,Alberta,T5B 4W4,Canada,7419 Ave NW,82,Edmonton,Alberta,T6B 0G3,Canada,FALSE,FALSE,TRUE,TRUE,TRUE,,Loves Formula 1,Flyer,"Winter 2025, Snow Removal, One Time"',
].join("\r\n");

describe("dayFromText", () => {
  it("reads the usual date spellings as UTC midnight, and refuses the rest", () => {
    const d = Date.UTC(2024, 2, 5);
    expect(dayFromText("2024-03-05")).toBe(d);
    expect(dayFromText("2024-03-05 14:22:00")).toBe(d);
    expect(dayFromText("3/5/2024")).toBe(d);
    expect(dayFromText("3/5/24")).toBe(d);
    expect(dayFromText("Mar 5, 2024")).toBe(d);
    expect(dayFromText("")).toBeUndefined();
    expect(dayFromText("2024-02-30")).toBeUndefined();
    expect(dayFromText("13/40/2024")).toBeUndefined();
    expect(dayFromText("yesterday")).toBeUndefined();
    expect(dayFromText("1/1/1850")).toBeUndefined();
  });
});

describe("stateAbbr and centsFromAmount", () => {
  it("turns a state name into its letters and leaves the rest for the row check", () => {
    expect(stateAbbr("California")).toBe("CA");
    expect(stateAbbr("california")).toBe("CA");
    expect(stateAbbr("ca")).toBe("CA");
    expect(stateAbbr("District of Columbia")).toBe("DC");
    expect(stateAbbr("Alberta")).toBe("Alberta");
    expect(stateAbbr("")).toBe("");
  });
  it("reads an amount as cents", () => {
    expect(centsFromAmount("100")).toBe(10000);
    expect(centsFromAmount("$1,250.50")).toBe(125050);
    expect(centsFromAmount("-75")).toBe(-7500);
    expect(centsFromAmount("")).toBeUndefined();
    expect(centsFromAmount("n/a")).toBeUndefined();
  });
});

describe("readClientsCsv with Jobber's real sample file", () => {
  const r = readClientsCsv(JOBBER_SAMPLE);

  it("understands every client column, and says which it does not use", () => {
    expect(r.headerProblem).toBeNull();
    expect(r.problems).toEqual([]);
    expect(r.rows).toHaveLength(4);
    expect(r.ignored.sort()).toEqual([
      "Billing City", "Billing Country", "Billing State/Province", "Billing Street 1", "Billing Street 2", "Billing Zip/Postal Code", "Client Receives Auto Invoice Follow-ups? (True/False)",
      "Client Receives Auto Job Follow-ups? (True/False)", "Client Receives Auto Quote Follow-ups? (True/False)", "Client Receives Auto Visit Reminders? (True/False)", "Client SMS Enabled Phone Number",
      "Client Title", "Lead Source",
    ].sort());
    for (const h of ["Client Created Date", "Client Is Company?", "Client First Name", "Client Main Phone", "Client Home Phone", "Property Street 1", "Property State/Province", "Archived (True/False)", "Account Balance", "Client Internal Notes", "Tags"]) {
      expect(r.recognised, h).toContain(h);
    }
  });

  it("reads a company client, its phones (a stray line break is nothing), address, balance, date, tags and notes", () => {
    expect(r.rows[0]).toMatchObject({
      line: 2, type: "contractor", isCompany: true, first: "Jason", last: "Example", company: "Example Ltd", email: "JasonExample@example.com", phone: "800-555-0100", street1: "10520 Ave NW",
      street2: "111", city: "Edmonton", state: "Alberta", zip: "T5G 0B6", country: "Canada", notes: "The key is under the mat!", tags: ["Summer 2026", "Recurring", "Lawnmowing"],
      status: "active", balanceCents: 10000, createdAt: Date.UTC(2025, 11, 25),
    });
    // The work phone is kept; the SMS number repeats the main one and is not used; blank cells are nothing.
    expect(r.rows[0].extraPhones).toEqual([{ number: "800-555-0165", description: "Work" }]);
    expect(r.rows[2].extraPhones.map((p) => [p.number, p.description]).sort()).toEqual([["800-555-0122", "Home"], ["800-555-0138", "Mobile"]]);
  });

  it("reads a person client who is archived, with no balance", () => {
    expect(r.rows[3]).toMatchObject({ type: "homeowner", isCompany: false, first: "Jason", last: "Test", company: "", status: "archived", createdAt: Date.UTC(2025, 2, 3) });
    expect(r.rows[3].balanceCents).toBeUndefined();
  });

  it("keeps the second address of a client Jobber wrote on two rows, as another property", () => {
    const { keep, repeats } = fileDuplicates(r.rows);
    expect(keep.map((x) => x.line)).toEqual([2, 4, 5]);
    expect(keep[0].extraProperties).toEqual([{ street1: "15730 87 Ave NW", street2: "", city: "Edmonton", state: "Alberta", zip: "T5R 5W9", country: "Canada" }]);
    expect(repeats).toHaveLength(1);
    expect(repeats[0].message).toMatch(/Repeats line 2 of this file \(the same email\); its address "15730 87 Ave NW" was added to that client as another property/);
  });
});

describe("readClientsCsv", () => {
  it("reads plain column names too, with a byte-order mark and quoted cells", () => {
    const r = readClientsCsv(`﻿${csv(
      "First name,Last name,Company name,Email,Main phone,Mobile phone,Street 1,City,State,Zip code,Tags,Status,Created date,Notes,Lead source",
      'Ana,Ruiz,,ana@example.com,(555) 123-4567,555.987.6543,"12 Oak St, Unit 4",Temecula,California,92592,Homeowner,Active,3/5/2024,"Likes ""early"" starts\nCall first",Referral',
    )}`);
    expect(r.problems).toEqual([]);
    expect(r.rows[0]).toMatchObject({
      line: 2, type: "homeowner", first: "Ana", last: "Ruiz", email: "ana@example.com", phone: "(555) 123-4567", street1: "12 Oak St, Unit 4", state: "CA", zip: "92592", status: "active",
      notes: 'Likes "early" starts\nCall first', tags: ["Homeowner"], createdAt: Date.UTC(2024, 2, 5),
    });
    expect(r.rows[0].extraPhones).toEqual([{ number: "555.987.6543", description: "Mobile" }]);
    expect(r.ignored).toEqual(["Lead source"]);
  });

  it("works out a name from a display name, a company, and tags", () => {
    const r = readClientsCsv(csv("Display Name,Tags,Email", "Mary Ann Smith,,a@x.com", "Cher,,b@x.com", "Turf Pros LLC,Partner Contractor,c@x.com"));
    expect(r.rows.map((x) => [x.first, x.last, x.company, x.type])).toEqual([["Mary Ann", "Smith", "", "homeowner"], ["Cher", "", "", "homeowner"], ["", "", "Turf Pros LLC", "contractor"]]);
    expect(readClientsCsv(csv("Company name,Email", "Acme Landscaping,a@x.com")).rows[0]).toMatchObject({ company: "Acme Landscaping", first: "", type: "contractor" });
    expect(readClientsCsv(csv("First name,Last name,Company name", "Al,Jones,Jones Builders")).rows[0].type).toBe("homeowner");
  });

  it("maps the status and keeps every extra phone and email", () => {
    const r = readClientsCsv(csv("First name,Email,Other email,Work phone,Home phone,Main phone,Status", "A,a@x.com,b@x.com,5551110000,5552220000,5553330000,Lead", "B,,,,,,Archived", "C,,,,,,"));
    expect(r.rows.map((x) => x.status)).toEqual(["lead", "archived", "active"]);
    expect(r.rows[0].phone).toBe("5553330000");
    expect(r.rows[0].extraPhones.map((p) => p.description).sort()).toEqual(["Home", "Work"]);
    expect(r.rows[0].extraEmails).toEqual([{ address: "b@x.com", description: "Other" }]);
  });

  it("reports a row with no name, a bad date and a bad balance, and keeps the rest", () => {
    const r = readClientsCsv(csv("First name,Last name,Created date,Account Balance", "Ana,Ruiz,last week,lots", ",,2024-01-01,", "Bo,Li,2024-01-02,5"));
    expect(r.rows.map((x) => x.first)).toEqual(["Ana", "Bo"]);
    expect(r.rows[0].createdAt).toBeUndefined();
    expect(r.rows[1].balanceCents).toBe(500);
    expect(r.problems.map((p) => [p.line, p.message])).toEqual([[2, expect.stringMatching(/not a date/)], [2, expect.stringMatching(/not an amount/)], [3, expect.stringMatching(/No name/)]]);
  });

  it("explains an empty file and a file with no name column", () => {
    expect(readClientsCsv("").headerProblem).toMatch(/empty/);
    expect(readClientsCsv(csv("Email,Phone", "a@x.com,555")).headerProblem).toMatch(/name column/);
  });

  it("copes with a short row and blank lines", () => {
    const r = readClientsCsv(csv("First name,Last name,Email", "Ana", "", "Bo,Li,bo@x.com"));
    expect(r.rows.map((x) => [x.first, x.last, x.email])).toEqual([["Ana", "", ""], ["Bo", "Li", "bo@x.com"]]);
  });
});

describe("fileDuplicates", () => {
  it("keeps the first of a repeated email or phone, says which line it repeats, and does not repeat an address it already has", () => {
    const { rows } = readClientsCsv(csv("First name,Email,Main phone,Street 1,Zip code", "A,a@x.com,5551230000,1 Main St,92592", "B,A@X.com,,1 main st,92592", "C,c@x.com,(555) 123-0000,9 Elm Rd,92879", "D,d@x.com,12345,,", "E,e@x.com,12345,,"));
    const { keep, repeats } = fileDuplicates(rows);
    expect(keep.map((x) => x.first)).toEqual(["A", "D", "E"]); // short phone numbers are not used to match
    expect(repeats.map((x) => [x.row.first, x.of, x.why])).toEqual([["B", 2, "the same email"], ["C", 2, "the same phone number"]]);
    expect(repeats[0].message).toBe("Repeats line 2 of this file (the same email). Skipped.");
    expect(keep[0].extraProperties.map((p) => p.street1)).toEqual(["9 Elm Rd"]);
  });
});
