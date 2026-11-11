/* Zoho Mail, read only (D-064). Parsing and matching only: no fetch, and no URL that sends, replies, deletes,
   archives or changes read state. The sync calls Zoho with GET, and only with READ scopes. */

export const OFFICE_MAILBOX = "office@qualityfirstturf.com";

export const ZOHO_READ_SCOPES = ["ZohoMail.accounts.READ", "ZohoMail.folders.READ", "ZohoMail.messages.READ"] as const;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export class ZohoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ZohoError";
  }
}

export class ZohoAuthError extends ZohoError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "ZohoAuthError";
  }
}

export class ZohoRateLimitError extends ZohoError {
  constructor(message: string, status = 429) {
    super(message, status);
    this.name = "ZohoRateLimitError";
  }
}

export type MailDirection = "incoming" | "outgoing";
export type SearchField = "sender" | "to" | "cc";

export type ListedMessage = {
  messageId: string;
  folderId: string;
  threadId: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  receivedAt: number;
  preview: string;
  hasAttachment: boolean;
};

type AddressOwner<T> = T & { clientId: string };

/** Zoho ids are larger than a JavaScript number can hold. Quote them before JSON.parse so the id survives. */
export function parseZohoJson(text: string): unknown {
  const safe = text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"');
  try {
    return JSON.parse(safe) as unknown;
  } catch {
    throw new ZohoError("Zoho returned something that was not JSON.", 502);
  }
}

export function unwrapZoho(httpStatus: number, body: unknown): unknown {
  if (httpStatus === 429) throw new ZohoRateLimitError("Zoho Mail is limiting requests. Sync will continue shortly.");
  const status = isRecord(body) && isRecord(body.status) ? body.status : null;
  const code = status && typeof status.code === "number" ? status.code : 0;
  if (code && code !== 200) {
    const description = typeof status?.description === "string" && status.description ? status.description : `Zoho error ${code}`;
    if (code === 401 || code === 403) throw new ZohoAuthError(description, code);
    if (code === 429) throw new ZohoRateLimitError(description);
    throw new ZohoError(description, code);
  }
  if (httpStatus === 401 || httpStatus === 403) throw new ZohoAuthError("Zoho refused the token.", httpStatus);
  if (httpStatus >= 400) throw new ZohoError(`Zoho request failed (${httpStatus}).`, httpStatus);
  if (isRecord(body) && typeof body.errorCode === "string") {
    const message = typeof body.errorMessage === "string" && body.errorMessage ? body.errorMessage : body.errorCode;
    throw new ZohoError(message, httpStatus || 400);
  }
  if (isRecord(body) && "data" in body) return body.data;
  return body;
}

export function extractAddresses(raw: string | undefined): string[] {
  if (!raw || raw.trim().toLowerCase() === "not provided") return [];
  const found = raw.match(EMAIL) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of found) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Every address saved on a client: the main one, the extra ones, and company contacts. */
export function addressesOnClient(client: {
  email?: string;
  emails?: { address: string }[];
  contacts?: { email: string }[];
}): string[] {
  const seen = new Set<string>();
  const add = (raw: string | undefined) => {
    for (const address of extractAddresses(raw)) seen.add(address);
  };
  add(client.email);
  for (const row of client.emails ?? []) add(row.address);
  for (const row of client.contacts ?? []) add(row.email);
  return [...seen];
}

/** Outgoing means the office mailbox sent it. Everything else that landed in the mailbox is incoming. */
export function mailDirection(fromAddress: string, mailbox: string): MailDirection {
  return fromAddress.trim().toLowerCase() === mailbox.trim().toLowerCase() ? "outgoing" : "incoming";
}

/** One Zoho search for a single role. OR across roles is easy to get wrong, so the sync runs sender, to and cc separately. */
export function fieldSearchKey(field: SearchField, address: string): string {
  return `${field}:${address.trim().toLowerCase()}`;
}

export function matchingClients<T>(addresses: string[], byAddress: Map<string, AddressOwner<T>[]>, mailbox: string): AddressOwner<T>[] {
  const skip = mailbox.trim().toLowerCase();
  const found = new Map<string, AddressOwner<T>>();
  for (const address of addresses) {
    const key = address.trim().toLowerCase();
    if (!key || key === skip) continue;
    for (const row of byAddress.get(key) ?? []) found.set(row.clientId, row);
  }
  return [...found.values()];
}

export function previewText(summary: string): string {
  const text = summary
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 240 ? `${text.slice(0, 239)}…` : text;
}

export function readListedMessages(data: unknown, fallbackFolderId: string): { messages: ListedMessage[]; total: number } {
  const rows = listedRows(data);
  if (!rows) throw new ZohoError("Zoho returned an unexpected message list.", 502);
  const messages: ListedMessage[] = [];
  for (const row of rows) {
    const message = normalizeListed(row, fallbackFolderId);
    if (message) messages.push(message);
  }
  return { messages, total: rows.length };
}

export function readAccounts(data: unknown): { accountId: string; email: string }[] {
  const rows = listedRows(data);
  if (!rows) throw new ZohoError("Zoho returned an unexpected account list.", 502);
  return rows
    .map((row) => ({ accountId: asString(row.accountId), email: accountEmail(row) }))
    .filter((row) => row.accountId && row.email);
}

export function readFolders(data: unknown): { folderId: string; path: string; name: string }[] {
  const rows = listedRows(data);
  if (!rows) throw new ZohoError("Zoho returned an unexpected folder list.", 502);
  return rows
    .map((row) => ({ folderId: asString(row.folderId), path: asString(row.path), name: asString(row.folderName) }))
    .filter((row) => row.folderId);
}

/** Match the real Inbox and Sent paths. A custom folder can also report folderType Inbox, so the path is what counts. */
export function pickFolder(folders: { folderId: string; path: string }[], path: "/Inbox" | "/Sent"): string | null {
  const want = path.toLowerCase();
  return folders.find((folder) => folder.path.toLowerCase() === want)?.folderId ?? null;
}

export function readContent(data: unknown): string {
  if (!isRecord(data)) throw new ZohoError("Zoho returned an unexpected message.", 502);
  const content = typeof data.content === "string" ? data.content : "";
  const block = typeof data.blockContent === "string" ? data.blockContent : "";
  return content || block;
}

const ALLOWED = new Set(["p", "br", "div", "span", "b", "strong", "i", "em", "u", "a", "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "hr", "font", "center", "small", "sub", "sup"]);
const DROPPED = "script|style|iframe|object|embed|form|link|meta|base|svg|math|video|audio|img|picture|source|canvas|input|button|textarea|select|option|noscript|applet";

/** Keeps readable formatting and drops anything that could run, track or load a remote image. */
export function sanitizeEmailHtml(html: string): { html: string; imagesHidden: boolean } {
  const imagesHidden = /<img\b/i.test(html);
  let source = html.replace(/\0/g, "").replace(/<!--[\s\S]*?-->/g, "");
  source = source.replace(new RegExp(`<\\s*(${DROPPED})\\b[^>]*>[\\s\\S]*?<\\s*/\\s*\\1\\s*>`, "gi"), "");
  source = source.replace(new RegExp(`<\\s*(${DROPPED})\\b[^>]*\\/?\\s*>`, "gi"), "");
  source = source.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, tag: string, attrs: string) => {
    const name = tag.toLowerCase();
    if (!ALLOWED.has(name)) return "";
    if (full.startsWith("</")) return `</${name}>`;
    return `<${name}${name === "a" ? anchorAttrs(attrs) : ""}>`;
  });
  if (source.length > 200_000) source = `${source.slice(0, 200_000)}<p>This message was shortened for the CRM.</p>`;
  return { html: source, imagesHidden };
}

function anchorAttrs(attrs: string): string {
  const match = attrs.match(/\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const raw = (match?.[2] ?? match?.[3] ?? match?.[4] ?? "").trim();
  const href = decodeHref(raw);
  if (!/^(https?:|mailto:)/i.test(href)) return "";
  return ` href="${escapeAttr(href)}" rel="noopener noreferrer" target="_blank"`;
}

function decodeHref(value: string): string {
  return value
    .replace(/&colon;/gi, ":")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*58;/g, ":")
    .replace(/&#x0*3a;/gi, ":")
    .trim();
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function normalizeListed(raw: Record<string, unknown>, fallbackFolderId: string): ListedMessage | null {
  const messageId = asString(raw.messageId);
  if (!messageId) return null;
  const receivedAt = Number(raw.receivedTime ?? raw.receivedtime ?? raw.sentDateInGMT);
  if (!Number.isFinite(receivedAt) || receivedAt <= 0) return null;
  const fromAddress = extractAddresses(asString(raw.fromAddress))[0] ?? extractAddresses(asString(raw.sender))[0] ?? "";
  const thread = asString(raw.threadId);
  const attachment = raw.hasAttachment;
  return {
    messageId,
    folderId: asString(raw.folderId) || fallbackFolderId,
    // Zoho uses 0 when a message is not in a conversation. Sharing that id would glue unrelated mail into one thread.
    threadId: !thread || thread === "0" ? messageId : thread,
    subject: (asString(raw.subject).trim() || "(no subject)").slice(0, 300),
    fromName: asString(raw.sender).trim().slice(0, 200),
    fromAddress,
    toAddresses: extractAddresses(asString(raw.toAddress)).slice(0, 50),
    ccAddresses: extractAddresses(asString(raw.ccAddress)).slice(0, 50),
    receivedAt,
    preview: previewText(asString(raw.summary)),
    hasAttachment: attachment === true || attachment === 1 || attachment === "1",
  };
}

function accountEmail(row: Record<string, unknown>): string {
  for (const key of ["primaryEmailAddress", "mailboxAddress", "incomingUserName", "emailAddress", "accountName"]) {
    const found = extractAddresses(asString(row[key]))[0];
    if (found) return found;
  }
  return "";
}

function listedRows(data: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return null;
  for (const key of ["messages", "accounts", "folders"]) {
    if (Array.isArray(data[key])) return data[key].filter(isRecord);
  }
  return null;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
