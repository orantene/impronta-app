/**
 * TUL-1129: the /start wizard keeps its words in the es/en dictionaries. save-step-consent.static
 * guards one line of save-step.tsx; this scans EVERY wizard component (src/components/onboarding
 * and src/app/start, non-test .tsx) for hardcoded user-facing literals, and checks every literal
 * "public.onboarding.*" key resolves, non-empty, in BOTH dictionaries.
 *
 * Allowed literals: a bare 3-letter UPPERCASE currency code (MXN, USD) is a code, not a word.
 * Not covered: strings built inside .ts helpers or passed through variables; copy rendered
 * dynamically from a prefix key (those keys end in "." or are built at runtime).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const ROOT = process.cwd();
const DIRS = ["src/components/onboarding", "src/app/start"];
const USER_FACING_ATTRS = new Set([
  "placeholder", "title", "alt", "label", "aria-label", "aria-description", "hint", "description",
  "pendingLabel", "failedLabel", "idle", "busy", "submitLabel", "eyebrow",
]);
const HAS_LETTER = /\p{L}/u;
const CURRENCY_CODE = /^[A-Z]{3}$/;

function* tsxFiles(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* tsxFiles(p);
    else if (e.name.endsWith(".tsx") && !/\.test\./.test(e.name)) yield p;
  }
}

const words = (s: string) => HAS_LETTER.test(s) && !CURRENCY_CODE.test(s.trim());

export function hardcodedCopy(src: string): string[] {
  const sf = ts.createSourceFile("x.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n)) {
      const text = n.getText(sf).replace(/\s+/g, " ").trim();
      if (words(text)) found.push(`line ${at(n)}: JSX text "${text}"`);
    } else if (ts.isJsxAttribute(n) && USER_FACING_ATTRS.has(n.name.getText(sf))) {
      const init = n.initializer;
      const lit =
        init && ts.isStringLiteral(init)
          ? init.text
          : init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)
            ? init.expression.text
            : null;
      if (lit !== null && words(lit)) found.push(`line ${at(n)}: ${n.name.getText(sf)}="${lit}"`);
    } else if (
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isStringLiteralLike(n.expression) &&
      !ts.isJsxAttribute(n.parent) &&
      words(n.expression.text)
    ) {
      found.push(`line ${at(n)}: JSX string child "${n.expression.text}"`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

const files = DIRS.flatMap((d) => [...tsxFiles(join(ROOT, d))]);
const rel = (p: string) => relative(ROOT, p);

test("TUL-1129: the scan really covers the wizard (steps exist)", () => {
  const names = files.map(rel);
  for (const must of ["save-step.tsx", "entry-step.tsx", "setup-hours.tsx", "setup-services.tsx"]) {
    assert.ok(names.some((n) => n.endsWith(`/steps/${must}`)), `${must} is scanned`);
  }
  assert.ok(files.length >= 15, `scanned ${files.length} files`);
});

test("TUL-1129: no /start wizard component holds a hardcoded user-facing string", () => {
  const bad: string[] = [];
  for (const f of files) for (const hit of hardcodedCopy(readFileSync(f, "utf8"))) bad.push(`${rel(f)} ${hit}`);
  assert.deepEqual(bad, []);
});

test("TUL-1129: every literal public.onboarding.* key in the wizard exists, non-empty, in en AND es", () => {
  const lookup = (dict: unknown, key: string): unknown =>
    key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), dict);
  const en = JSON.parse(readFileSync(join(ROOT, "messages/en.json"), "utf8"));
  const es = JSON.parse(readFileSync(join(ROOT, "messages/es.json"), "utf8"));
  const missing: string[] = [];
  let seen = 0;
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(/["'`](public\.onboarding\.[A-Za-z0-9_.]*[A-Za-z0-9_])["'`]/g)) {
      seen++;
      for (const [name, d] of [["en", en], ["es", es]] as const) {
        const v = lookup(d, m[1]);
        if (typeof v !== "string" || !v.trim()) missing.push(`${rel(f)} ${name} ${m[1]}`);
      }
    }
  }
  assert.ok(seen > 50, `found ${seen} keys`);
  assert.deepEqual([...new Set(missing)], []);
});

test("TUL-1129: guard bites (self-test of the scanner)", () => {
  assert.equal(hardcodedCopy(`const a = <button>Continue</button>;`).length, 1);
  assert.equal(hardcodedCopy(`const a = <input placeholder="Your name" />;`).length, 1);
  assert.deepEqual(hardcodedCopy(`const a = <option>MXN</option>;`), []);
  assert.deepEqual(hardcodedCopy(`const a = <p>{t("public.onboarding.x")}</p>;`), []);
});
