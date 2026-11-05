/* Input rules for client fields (D-038). The form uses the cleaners so a wrong character never lands in a field; the
   server runs the same checks, because the UI is never enough (CRM/CLAUDE.md rule 3). Pure TypeScript, shared with the app. */

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

export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
