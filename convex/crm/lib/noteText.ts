/* Notes with a little formatting (D-067), kept as plain text so they stay readable anywhere and need no editor library:
     "- item"          a bullet
     "1. item"         a numbered item
     "- [ ] item"      a checkbox, and "- [x] item" once ticked
   Pure TypeScript: the screens and the backend both use it. */

export type Line =
  | { kind: "text"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "number"; text: string; n: number }
  | { kind: "check"; text: string; done: boolean };

const CHECK = /^- \[( |x|X)\] ?(.*)$/;
const BULLET = /^[-•*] (.*)$/;
const NUMBER = /^(\d{1,3})\. (.*)$/;

export function parseLine(raw: string): Line {
  const c = CHECK.exec(raw);
  if (c) return { kind: "check", done: c[1] !== " ", text: c[2] };
  const b = BULLET.exec(raw);
  if (b) return { kind: "bullet", text: b[1] };
  const n = NUMBER.exec(raw);
  if (n) return { kind: "number", n: Number(n[1]), text: n[2] };
  return { kind: "text", text: raw };
}

export function parseNote(text: string): Line[] {
  return text.split("\n").map(parseLine);
}

/** Ticks or unticks the checkbox on one line. Returns null when that line is not a checkbox. */
export function toggleCheckbox(text: string, lineIndex: number): string | null {
  const lines = text.split("\n");
  const raw = lines[lineIndex];
  const m = raw === undefined ? null : CHECK.exec(raw);
  if (!m) return null;
  lines[lineIndex] = `- [${m[1] === " " ? "x" : " "}] ${m[2]}`;
  return lines.join("\n");
}

export type ListKind = "bullet" | "number" | "check";

const strip = (raw: string) => {
  const l = parseLine(raw);
  return l.kind === "text" ? raw : l.text;
};

/** Turns the lines from `start` to `end` (character positions in `text`) into a list of this kind, or back to plain text when they all
 *  already are. Returns the new text and where the selection should be afterwards. */
export function toggleList(text: string, start: number, end: number, kind: ListKind): { text: string; start: number; end: number } {
  const from = text.lastIndexOf("\n", Math.max(0, start) - 1) + 1;
  const nl = text.indexOf("\n", Math.max(start, end));
  const to = nl === -1 ? text.length : nl;
  const lines = text.slice(from, to).split("\n");
  const allSame = lines.every((l) => parseLine(l).kind === kind);
  let n = 0;
  const next = lines.map((l) => {
    const body = strip(l);
    if (allSame) return body;
    n += 1;
    return kind === "bullet" ? `- ${body}` : kind === "check" ? `- [ ] ${body}` : `${n}. ${body}`;
  });
  const replaced = next.join("\n");
  return { text: text.slice(0, from) + replaced + text.slice(to), start: from, end: from + replaced.length };
}

/** What Enter should do at the end of a list line: keep the list going on the next line, or (on an empty list line) end the list. */
export function continueList(line: string): { insert: string } | { clear: true } | null {
  const l = parseLine(line);
  if (l.kind === "text") return null;
  if (l.text.trim() === "") return { clear: true };
  if (l.kind === "bullet") return { insert: "\n- " };
  if (l.kind === "check") return { insert: "\n- [ ] " };
  return { insert: `\n${l.n + 1}. ` };
}
