/* Checks that a webhook really came from Clerk. Clerk sends webhooks through Svix, which signs each one: HMAC-SHA256, with the endpoint's
   signing secret ("whsec_" plus base64), over "<message id>.<timestamp>.<body>". Written with the platform's own crypto so no package is
   needed. Pure functions, no Convex imports, so it can be tested on its own. */

const TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** `signatures` is the svix-signature header: space-separated "v1,<base64>" entries (more than one while a secret is being rotated). */
export async function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signatures: string | null },
  body: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const { id, timestamp, signatures } = headers;
  if (!id || !timestamp || !signatures) return false;
  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(nowSeconds - sent) > TOLERANCE_SECONDS) return false; // also stops an old message being replayed

  let key: CryptoKey;
  try {
    const keyBytes = base64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
    key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  } catch {
    return false;
  }
  const data = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  for (const entry of signatures.split(" ")) {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) continue;
    try {
      // `verify` compares in constant time.
      if (await crypto.subtle.verify("HMAC", key, base64ToBytes(value) as BufferSource, data)) return true;
    } catch {
      // A malformed entry: try the next one.
    }
  }
  return false;
}
