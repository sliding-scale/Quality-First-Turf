/* Input rules (D-038). Each function takes what the user typed and returns what the field should hold, so a wrong
   character never lands in the field. Validation on submit (red fields, D-035) is separate and still applies. */

/** US phone numbers: digits only, formatted as you type: (951) 555-0178. A leading country code 1 is dropped. */
export function formatPhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length > 10 && d[0] === "1") d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export const phoneDigits = (s: string) => s.replace(/\D/g, "").length;

/** Names and cities: letters, spaces, apostrophes, periods and hyphens. No digits or symbols. */
export const cleanName = (s: string) => s.replace(/[^\p{L}\p{M}\s'’.-]/gu, "");

/** ZIP code: digits only, five of them. */
export const cleanZip = (s: string) => s.replace(/\D/g, "").slice(0, 5);

/** Email: no spaces. */
export const cleanEmail = (s: string) => s.replace(/\s/g, "");
