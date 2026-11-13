/* Tagging a person in a note with @ (D-073). A tag is written in the note as "@" and the person's name exactly as it is on Manage Team
   ("@Sam Sales"), which is what the picker types in. Pure rules only (no Convex, no React): the backend works out who was tagged from the
   text itself, so a tag cannot be faked by the browser, and the screen uses the same code to colour the names. */

export type Person = { id: string; name: string };

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_]/u.test(c);

/** Where each person is tagged in `text`: the "@Name" ranges, longest names first so "@Ann Lee" is not read as "@Ann". Not found inside a
 *  longer word on either side (an email address, "x@Sam", "@Samuel" for Sam). Case does not matter. */
export function findTags(text: string, people: readonly Person[]): { start: number; end: number; person: Person }[] {
  const lower = text.toLowerCase();
  const found: { start: number; end: number; person: Person }[] = [];
  const taken: [number, number][] = [];
  const byLength = [...people].filter((p) => p.name.trim()).sort((a, b) => b.name.length - a.name.length);
  for (const person of byLength) {
    const token = `@${person.name.trim().toLowerCase()}`;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(token, from);
      if (at === -1) break;
      from = at + 1;
      const end = at + token.length;
      if (isWordChar(text[at - 1]) || isWordChar(text[end])) continue;
      if (taken.some(([s, e]) => at < e && s < end)) continue;
      taken.push([at, end]);
      found.push({ start: at, end, person });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** The people tagged in a note, each once, in the order first tagged. */
export function mentionedIds(text: string, people: readonly Person[]): string[] {
  return [...new Set(findTags(text, people).map((t) => t.person.id))];
}

/** The text cut into plain pieces and tags, for showing a tag in colour. */
export function splitTags(text: string, people: readonly Person[]): { text: string; tag: boolean }[] {
  const out: { text: string; tag: boolean }[] = [];
  let at = 0;
  for (const t of findTags(text, people)) {
    if (t.start > at) out.push({ text: text.slice(at, t.start), tag: false });
    out.push({ text: text.slice(t.start, t.end), tag: true });
    at = t.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), tag: false });
  return out;
}

/** A short piece of the note for the notification, around the first tag, with line breaks flattened. */
export function excerpt(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** What the picker is being asked for: the text typed after an "@" that starts a word right before the cursor, or null when the cursor is
 *  not in one. Spaces are allowed so a two-word name can be narrowed down, up to a few words. */
export function tagQuery(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && isWordChar(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.includes("\n") || query.split(/\s+/).length > 3) return null;
  return { start: at, query };
}
