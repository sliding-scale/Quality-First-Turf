import { describe, expect, it } from "vitest";
import { displayPhone, lastTen, normalizePhone, samePhone, twilioSignature, validTwilioSignature } from "../../convex/crm/lib/phone";
import { levelsOf } from "../../convex/crm/lib/permissions";

describe("Phone numbers (plan 2026-11-19-messages)", () => {
  it("turns what people type into E.164", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("555.123.4567")).toBe("+15551234567");
    expect(normalizePhone("1 555 123 4567")).toBe("+15551234567");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("refuses what is not a number", () => {
    for (const bad of ["", "abc", "12345", "+12", "555-1234"]) expect(normalizePhone(bad)).toBeNull();
  });
  it("recognises the same line written two ways", () => {
    expect(samePhone("(555) 123-4567", "+15551234567")).toBe(true);
    expect(samePhone("555-123-4567", "555-123-4568")).toBe(false);
    expect(samePhone("123", "123")).toBe(false); // too short to be a line
    expect(lastTen("+1 (555) 123-4567")).toBe("5551234567");
  });
  it("shows a US number the usual way", () => {
    expect(displayPhone("+15551234567")).toBe("(555) 123-4567");
    expect(displayPhone("+442079460958")).toBe("+442079460958");
  });
});

describe("Twilio's signature", () => {
  // The worked example from Twilio's own documentation for validating a request.
  const token = "12345";
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
  const expected = "0/KCTR6DLpKmkAf8muzZqo1nDgQ=";

  it("matches Twilio's documented example", async () => {
    expect(await twilioSignature(token, url, params)).toBe(expected);
  });
  it("accepts the right signature and refuses a wrong, missing or altered one", async () => {
    expect(await validTwilioSignature(token, url, params, expected)).toBe(true);
    expect(await validTwilioSignature(token, url, params, null)).toBe(false);
    expect(await validTwilioSignature(token, url, params, "AAAA")).toBe(false);
    expect(await validTwilioSignature(token, url, { ...params, Digits: "9999" }, expected)).toBe(false);
    expect(await validTwilioSignature("other", url, params, expected)).toBe(false);
    expect(await validTwilioSignature("", url, params, expected)).toBe(false);
  });
});

describe("The messages permission", () => {
  it("lets Admin do all, Office, Sales and Project Manager edit, and keeps Installers out", () => {
    expect(levelsOf(["admin"]).messages).toBe("full");
    for (const r of ["office", "sales", "pm"] as const) expect(levelsOf([r]).messages).toBe("edit");
    expect(levelsOf(["installer"]).messages).toBe("none");
  });
});
