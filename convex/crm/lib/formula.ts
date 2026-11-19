/* The material formula evaluator (CRM rule 8: "Formulas are data, not code"). A formula is text the client can edit, such as
   `ceil(area / 100)` or `perimeter * depth / 12 / 27`; it is read by a small parser here and never handed to eval or `new Function`.
   Pure TypeScript with no Convex or React imports, so the backend, the screens and the tests share it.

   Grammar (usual precedence, `^` is a power and binds to the right):
     expr    = term (("+" | "-") term)*
     term    = power (("*" | "/") power)*
     power   = unary ("^" power)?
     unary   = ("-" | "+") unary | primary
     primary = number | name | name "(" [expr ("," expr)*] ")" | "(" expr ")"
   Names are inputs (area, perimeter, depth...) and the functions ceil, floor, round, abs, sqrt, min and max. */

export type FormulaResult = { ok: true; value: number } | { ok: false; error: string };

const MAX_LENGTH = 500;
const MAX_DEPTH = 40;

type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "neg"; x: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node }
  | { t: "call"; fn: string; args: Node[] };

const FUNCTIONS: Record<string, { min: number; max: number; run: (a: number[]) => number }> = {
  ceil: { min: 1, max: 1, run: (a) => Math.ceil(a[0] - 1e-9) },
  floor: { min: 1, max: 1, run: (a) => Math.floor(a[0] + 1e-9) },
  round: { min: 1, max: 1, run: (a) => Math.round(a[0]) },
  abs: { min: 1, max: 1, run: (a) => Math.abs(a[0]) },
  sqrt: { min: 1, max: 1, run: (a) => Math.sqrt(a[0]) },
  min: { min: 2, max: 8, run: (a) => Math.min(...a) },
  max: { min: 2, max: 8, run: (a) => Math.max(...a) },
};

class Syntax extends Error {}

type Tok = { k: "num" | "name" | "op"; s: string; at: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    const num = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
    if (num) { out.push({ k: "num", s: num[0], at: i }); i += num[0].length; continue; }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (name) { out.push({ k: "name", s: name[0], at: i }); i += name[0].length; continue; }
    if ("+-*/^(),".includes(c)) { out.push({ k: "op", s: c, at: i }); i += 1; continue; }
    throw new Syntax(`"${c}" is not allowed in a formula.`);
  }
  return out;
}

function parse(src: string): Node {
  if (src.length > MAX_LENGTH) throw new Syntax(`A formula is up to ${MAX_LENGTH} characters.`);
  const toks = tokenize(src);
  if (toks.length === 0) throw new Syntax("The formula is empty.");
  let p = 0;
  const peek = () => toks[p];
  const eat = (s?: string) => {
    const t = toks[p];
    if (!t || (s !== undefined && t.s !== s)) throw new Syntax(s ? `Expected "${s}".` : "The formula ends too soon.");
    p += 1;
    return t;
  };
  const expr = (d: number): Node => {
    if (d > MAX_DEPTH) throw new Syntax("The formula is nested too deeply.");
    let a = term(d);
    while (peek() && (peek().s === "+" || peek().s === "-") && peek().k === "op") a = { t: "bin", op: eat().s as "+" | "-", a, b: term(d) };
    return a;
  };
  const term = (d: number): Node => {
    let a = power(d);
    while (peek() && (peek().s === "*" || peek().s === "/") && peek().k === "op") a = { t: "bin", op: eat().s as "*" | "/", a, b: power(d) };
    return a;
  };
  const power = (d: number): Node => {
    const a = unary(d);
    if (peek() && peek().s === "^" && peek().k === "op") { eat(); return { t: "bin", op: "^", a, b: power(d + 1) }; }
    return a;
  };
  const unary = (d: number): Node => {
    if (d > MAX_DEPTH) throw new Syntax("The formula is nested too deeply.");
    const t = peek();
    if (t && t.k === "op" && (t.s === "-" || t.s === "+")) { eat(); const x = unary(d + 1); return t.s === "-" ? { t: "neg", x } : x; }
    return primary(d);
  };
  const primary = (d: number): Node => {
    const t = eat();
    if (t.k === "num") return { t: "num", v: Number(t.s) };
    if (t.k === "name") {
      if (peek() && peek().s === "(" && peek().k === "op") {
        eat("(");
        const spec = FUNCTIONS[t.s];
        if (!spec) throw new Syntax(`"${t.s}" is not a function. Use ceil, floor, round, abs, sqrt, min or max.`);
        const args: Node[] = [];
        if (!(peek() && peek().s === ")")) {
          args.push(expr(d + 1));
          while (peek() && peek().s === ",") { eat(); args.push(expr(d + 1)); }
        }
        eat(")");
        if (args.length < spec.min || args.length > spec.max) throw new Syntax(`${t.s}() takes ${spec.min === spec.max ? spec.min : `${spec.min} to ${spec.max}`} value${spec.max === 1 ? "" : "s"}.`);
        return { t: "call", fn: t.s, args };
      }
      if (FUNCTIONS[t.s]) throw new Syntax(`${t.s} is a function; write ${t.s}( ... ).`);
      return { t: "var", name: t.s };
    }
    if (t.s === "(") { const x = expr(d + 1); eat(")"); return x; }
    throw new Syntax(`Unexpected "${t.s}".`);
  };
  const tree = expr(0);
  if (p < toks.length) throw new Syntax(`Unexpected "${toks[p].s}".`);
  return tree;
}

function run(n: Node, vars: Record<string, number>): number {
  switch (n.t) {
    case "num": return n.v;
    case "var": {
      const v = vars[n.name];
      if (v === undefined) throw new Syntax(`Unknown input "${n.name}".`);
      return v;
    }
    case "neg": return -run(n.x, vars);
    case "call": return FUNCTIONS[n.fn].run(n.args.map((a) => run(a, vars)));
    case "bin": {
      const a = run(n.a, vars);
      const b = run(n.b, vars);
      if (n.op === "+") return a + b;
      if (n.op === "-") return a - b;
      if (n.op === "*") return a * b;
      if (n.op === "/") { if (b === 0) throw new Syntax("The formula divides by zero."); return a / b; }
      return Math.pow(a, b);
    }
  }
}

/** The formula's value for these inputs, or why it cannot be worked out. Never throws. */
export function evaluateFormula(src: string, vars: Record<string, number>): FormulaResult {
  try {
    const value = run(parse(src), vars);
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, error: "The formula does not give a number." };
  } catch (e) {
    return { ok: false, error: e instanceof Syntax ? e.message : "The formula could not be read." };
  }
}

/** Why a formula cannot be read (a syntax problem), or null when it can. Unknown inputs are not a syntax problem; they are found when it is worked out. */
export function formulaProblem(src: string): string | null {
  try {
    parse(src);
    return null;
  } catch (e) {
    return e instanceof Syntax ? e.message : "The formula could not be read.";
  }
}

/** The inputs a formula uses, in order of first use (empty when it cannot be read). */
export function formulaInputs(src: string): string[] {
  const seen: string[] = [];
  const walk = (n: Node) => {
    if (n.t === "var") { if (!seen.includes(n.name)) seen.push(n.name); }
    else if (n.t === "neg") walk(n.x);
    else if (n.t === "bin") { walk(n.a); walk(n.b); }
    else if (n.t === "call") n.args.forEach(walk);
  };
  try { walk(parse(src)); } catch { return []; }
  return seen;
}
