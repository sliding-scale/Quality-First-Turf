// Builds CRM/app/intake.css: the forms app's stylesheet with every rule kept inside the .nrf wrapper.
// Run from the repo root:  node CRM/scripts/scope-forms-css.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SCOPE = ".nrf";
const source = fs.readFileSync(path.join(root, "forms/app/globals.css"), "utf8");
const crmCss = fs.readdirSync(path.join(root, "CRM/app")).filter((f) => f.endsWith(".css") && !f.startsWith("intake")).map((f) => fs.readFileSync(path.join(root, "CRM/app", f), "utf8")).join("\n");
const crmKeyframes = new Set([...crmCss.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));

function splitSelectors(text) {
  const out = [];
  let depth = 0, current = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(current.trim()); current = ""; } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function scope(selector) {
  // The page itself: the wrapper stands in for html, body and :root.
  const m = selector.match(/^(?::root|html|body)(?![\w-])(.*)$/s);
  if (m) {
    const rest = m[1];
    // "html body .x" style chains: keep scoping what follows.
    const again = rest.match(/^\s+(?:body)(?![\w-])(.*)$/s);
    return SCOPE + (again ? again[1] : rest);
  }
  return `${SCOPE} ${selector}`;
}

const ast = postcss.parse(source);
const renamed = new Map();
let dropped = 0;

ast.walkAtRules((rule) => {
  if (rule.name === "import" || rule.name === "theme") { rule.remove(); return; }
  if (rule.name === "keyframes" && crmKeyframes.has(rule.params.trim())) {
    const name = rule.params.trim();
    renamed.set(name, `nrf-${name}`);
    rule.params = `nrf-${name}`;
  }
});

ast.walkRules((rule) => {
  if (rule.parent && rule.parent.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
  // Page-wide view transitions belong to the forms app's own page; the CRM must not inherit them.
  if (rule.selector.includes("view-transition")) { rule.remove(); dropped++; return; }
  rule.selector = splitSelectors(rule.selector).map(scope).join(",\n");
});

if (renamed.size) {
  ast.walkDecls(/^animation(-name)?$/, (decl) => {
    for (const [from, to] of renamed) decl.value = decl.value.replace(new RegExp(`(^|[\\s,])${from}(?=$|[\\s,])`, "g"), `$1${to}`);
  });
}

const header = `/* GENERATED from forms/app/globals.css: do not edit by hand. The forms app's look, kept inside the .nrf wrapper so it only applies to
   the New Request flow (D-079) and never to the rest of the CRM. Rebuild after the forms stylesheet changes:
     node CRM/scripts/scope-forms-css.mjs
   The flow's own few rules (the wrapper, the header and the steps that the forms draw with Tailwind) are in intake-flow.css. */\n\n`;
fs.writeFileSync(path.join(root, "CRM/app/intake.css"), header + ast.toString());
console.log(`rules scoped; ${dropped} view-transition rules dropped; keyframes renamed: ${[...renamed.keys()].join(", ") || "none"}`);
