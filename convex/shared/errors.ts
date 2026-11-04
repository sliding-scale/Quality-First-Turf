/**
 * Convex wraps server errors as "[CONVEX M(fn)] [Request ID: …] Server Error Uncaught Error: …".
 * Show the part a person can act on, or the fallback when only the wrapper is left.
 */
export function friendlyError(error: unknown, fallback: string): string {
  // Errors the server threw on purpose (ConvexError) carry their message in `data`.
  const data = (error as { data?: unknown } | null)?.data;
  if (typeof data === "string" && data !== "") return data;
  if (!(error instanceof Error)) return fallback;
  const uncaught = /Uncaught Error: ([^\n]+)/.exec(error.message);
  if (uncaught !== null) return uncaught[1].trim();
  if (/^\[CONVEX|Server Error|Failed to fetch|NetworkError/i.test(error.message)) return fallback;
  return error.message || fallback;
}

/** Project codes are stored as `K7M3PQ` and read out as `K7M-3PQ`. */
export function formatShortCode(code: string | null | undefined, fallback = ""): string {
  if (!code || code.length !== 6) return fallback;
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function normalizeShortCode(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
