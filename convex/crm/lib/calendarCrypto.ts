/* Encrypts a Zoho refresh token before it is stored (D-069): AES-GCM with a key kept only in the Convex environment (CALENDAR_TOKEN_KEY,
   32 random bytes as base64). A copy of the database alone is then not enough to use anyone's calendar. */

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function keyOf(keyText: string): Promise<CryptoKey> {
  const raw = unb64(keyText.trim());
  if (raw.length !== 32) throw new Error("CALENDAR_TOKEN_KEY must be 32 bytes, base64 encoded.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(plain: string, keyText: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyOf(keyText), new TextEncoder().encode(plain)));
  return `${b64(iv)}.${b64(cipher)}`;
}

export async function decryptToken(stored: string, keyText: string): Promise<string> {
  const [iv, cipher] = stored.split(".");
  if (!iv || !cipher) throw new Error("The stored token is not in the expected form.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await keyOf(keyText), unb64(cipher));
  return new TextDecoder().decode(plain);
}
