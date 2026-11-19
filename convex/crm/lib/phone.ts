/* Phone numbers and Twilio's request signature (plan 2026-11-19-messages). Pure TypeScript with no Convex or React imports (it uses the standard
   Web Crypto API, which both the Convex runtime and the tests have), so the backend, the screens and the tests share one set of rules. */

/** A phone number as the CRM keeps it for texting: E.164 (+15551234567). Ten digits are taken as US numbers, as is eleven starting with 1. Null when it is not a number. */
export function normalizePhone(input: string): string | null {
  const t = input.trim();
  const digits = t.replace(/\D/g, "");
  if (t.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** The last ten digits, which is how a typed number "(555) 123-4567" and Twilio's "+15551234567" are recognised as the same line. */
export const lastTen = (input: string): string => input.replace(/\D/g, "").slice(-10);

export const samePhone = (a: string, b: string): boolean => lastTen(a).length === 10 && lastTen(a) === lastTen(b);

/** The digits WhatsApp's link wants (wa.me/<digits>): the E.164 number with no plus. Null when it is not a number. */
export function whatsAppDigits(input: string): string | null {
  const e164 = normalizePhone(input);
  return e164 === null ? null : e164.slice(1);
}

/** "(555) 123-4567" for a US number, else the number as it is. */
export function displayPhone(input: string): string {
  const d = lastTen(input);
  return d.length === 10 && input.replace(/\D/g, "").length <= 11 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : input;
}

/** Twilio signs each webhook: base64 of HMAC-SHA1 (key: the auth token) over the full request URL followed by every POST parameter, sorted by name, as name and value. */
export async function twilioSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Whether a request really came from Twilio. A missing signature is never valid. */
export async function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | null): Promise<boolean> {
  if (!signature || !authToken) return false;
  const expected = await twilioSignature(authToken, url, params);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
