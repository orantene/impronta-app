/**
 * kit-tokens.static.test.ts: the owner rulings and the kit's own rules,
 * checked against the files rather than remembered.
 *
 *   1. tokens.css never uses #0f4f3e (the old dark green) as anything, and
 *      never paints a control black (#000 / #111 / #18181b).
 *   2. Every colour literal in tokens.css lives in the token block; every
 *      rule after it reads a var(--msgv5-*).
 *   3. No component file carries a colour literal or an inline style.
 *   4. No kit file imports from components/admin/shell/**.
 *   5. The barrel imports the stylesheet once.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const KIT = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(KIT, "tokens.css"), "utf8");

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "");
}

const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i;

test("tokens.css: no #0f4f3e, no black control backgrounds", () => {
  const flat = stripComments(css).replace(/\s+/g, "");
  assert.doesNotMatch(flat, /#0f4f3e/i, "the dark green is not a background, border or text colour anywhere in the kit");
  assert.doesNotMatch(flat, /background(-color)?:#(000|111|18181b)\b/i);
  assert.doesNotMatch(flat, /--msgv5-[\w-]*:#(000000|000|111111|111|18181b);/i, "no black token exists to paint a control with");
});

test("tokens.css: every colour literal is inside the token block; the rules read vars", () => {
  const clean = stripComments(css);
  const start = clean.indexOf(".msgv5 {");
  const end = clean.indexOf("}", start);
  assert.ok(start >= 0 && end > start, "token block found");
  const tokenBlock = clean.slice(start, end);
  const rules = clean.slice(0, start) + clean.slice(end + 1);
  const tokens = tokenBlock.match(/--msgv5-[\w-]+:/g) ?? [];
  assert.ok(tokens.length > 60, `expected a full token set, got ${tokens.length}`);
  const offenders = rules
    .split("\n")
    .map((line, i) => [i + 1, line] as const)
    .filter(([, line]) => COLOUR_LITERAL.test(line));
  assert.deepEqual(
    offenders.map(([n, l]) => `${n}: ${l.trim()}`),
    [],
    "colour literals outside the token block",
  );
  // Every var read exists.
  const declared = new Set(tokens.map((t) => t.slice(0, -1)));
  const read = new Set((rules.match(/var\(--msgv5-[\w-]+/g) ?? []).map((v) => v.slice(4)));
  const missing = [...read].filter((v) => !declared.has(v));
  assert.deepEqual(missing, [], "vars read but never declared");
});

test("primary is solid green with white text; destructive is solid red; disabled is grey", () => {
  const flat = stripComments(css).replace(/\s+/g, "");
  assert.match(flat, /\.msgv5\.btn\.primary\{background:var\(--msgv5-green\);color:var\(--msgv5-on-green\)/);
  assert.match(flat, /\.msgv5\.btn\.danger\{background:var\(--msgv5-red\);color:var\(--msgv5-on-red\)/);
  assert.match(flat, /\.msgv5\.btn\.disabled,\.msgv5\.btn:disabled\{background:var\(--msgv5-gray-bg\);color:var\(--msgv5-gray-ink\)/);
  assert.match(flat, /--msgv5-green:#2b8a63;/);
  assert.match(flat, /--msgv5-green-strong:#1f6e4e;/);
  assert.match(flat, /--msgv5-red:#b3261e;/);
});

test("every kit rule is scoped under .msgv5", () => {
  const clean = stripComments(css);
  const selectors = clean.match(/^[^@\s{}][^{}]*\{/gm) ?? [];
  const unscoped = selectors.map((s) => s.trim()).filter((s) => !s.startsWith(".msgv5"));
  assert.deepEqual(unscoped, [], "selectors that could leak into the admin");
});

const componentFiles = readdirSync(KIT).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith("test-"));

test("components: no colour literals, no inline styles, no admin/shell imports", () => {
  assert.ok(componentFiles.length > 20, `expected the kit's component files, got ${componentFiles.length}`);
  for (const f of componentFiles) {
    const src = stripComments(readFileSync(join(KIT, f), "utf8"));
    assert.doesNotMatch(src, /style=\{\{|style=["']/, `${f} has an inline style`);
    assert.doesNotMatch(src, /components\/admin\/shell/, `${f} imports from components/admin/shell`);
    const colours = src.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b(?![\w-])|\brgba?\(/gi) ?? [];
    assert.deepEqual(colours, [], `${f} carries a colour literal`);
  }
});

test("the barrel imports the stylesheet exactly once and re-exports every component", () => {
  const index = readFileSync(join(KIT, "index.ts"), "utf8");
  assert.equal((index.match(/import "\.\/tokens\.css";/g) ?? []).length, 1);
  for (const name of ["StateTags", "InboxRowV5", "InboxSegments", "FilterChips", "FilterSheet", "ThreadHeader", "EssentialsStrip", "MessageBubble", "SystemLine", "DaySeparator", "UnreadDivider", "Card", "OfferCard", "PaymentCard", "OrderCard", "AppointmentCard", "TimesCard", "ChangeRequestCard", "IdentityCaptureCard", "NextStepBar", "NextStepBlock", "Composer", "RefusalLine", "OkLine", "AlertLine", "SummaryBlock", "PanelSection", "OptionRow", "Sheet", "Tray", "LineEditorRow", "PaymentLadder", "Skeleton", "EmptyState"]) {
    assert.match(index, new RegExp(`\\b${name}\\b`), `index.ts does not export ${name}`);
  }
});
