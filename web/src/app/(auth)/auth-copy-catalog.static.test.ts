/**
 * TUL-1102: email-code-form and register must not hold hardcoded user-facing strings; every
 * visible string goes through the message catalog (`t("...")`, ES + EN). #3831 moved the last
 * literals out but added no test. This scans the TSX AST: no JSX text with letters, no
 * user-facing string-literal attribute, and every static `t("key")` resolves in BOTH dictionaries.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const ROOT = process.cwd();
const FILES = [
  "src/components/auth/email-code-form.tsx",
  "src/app/(auth)/register/register-form.tsx",
  "src/app/(auth)/register/page.tsx",
];
/** Props whose string value a visitor reads or hears. */
const USER_FACING_ATTRS = new Set([
  "placeholder", "title", "alt", "label", "aria-label", "aria-description", "hint", "description",
  "pendingLabel", "failedLabel", "idle", "busy", "submitLabel", "eyebrow",
]);

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const HAS_LETTER = /\p{L}/u;

export function hardcodedCopy(src: string, fileName = "x.tsx"): string[] {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n)) {
      const text = n.getText(sf).replace(/\s+/g, " ").trim();
      if (HAS_LETTER.test(text)) found.push(`line ${at(n)}: JSX text "${text}"`);
    } else if (ts.isJsxAttribute(n) && USER_FACING_ATTRS.has(n.name.getText(sf))) {
      const init = n.initializer;
      const lit =
        init && ts.isStringLiteral(init)
          ? init.text
          : init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)
            ? init.expression.text
            : null;
      if (lit !== null && HAS_LETTER.test(lit)) found.push(`line ${at(n)}: ${n.name.getText(sf)}="${lit}"`);
    } else if (
      ts.isJsxExpression(n) &&
      n.expression &&
      ts.isStringLiteralLike(n.expression) &&
      !ts.isJsxAttribute(n.parent) &&
      HAS_LETTER.test(n.expression.text)
    ) {
      found.push(`line ${at(n)}: JSX string child "${n.expression.text}"`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/** Static first-argument keys of `t("a.b.c")` calls. */
export function staticKeys(src: string): string[] {
  return [...src.matchAll(/\bt\(\s*["']([A-Za-z0-9_.]+)["']/g)].map((m) => m[1]);
}

function lookup(dict: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), dict);
}

test("TUL-1102: email-code-form and register hold no hardcoded user-facing strings", () => {
  for (const f of FILES) assert.deepEqual(hardcodedCopy(read(f)), [], f);
});

test("TUL-1102: every static t() key in those files exists, non-empty, in en AND es", () => {
  const en = JSON.parse(read("messages/en.json"));
  const es = JSON.parse(read("messages/es.json"));
  const missing: string[] = [];
  for (const f of FILES) {
    const keys = staticKeys(read(f));
    assert.ok(keys.length > 0, `${f} should use t() keys`);
    for (const k of keys) {
      for (const [name, d] of [["en", en], ["es", es]] as const) {
        const v = lookup(d, k);
        if (typeof v !== "string" || !v.trim()) missing.push(`${f} ${name} ${k}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("TUL-1102: guard bites (self-test of the scanner)", () => {
  assert.equal(hardcodedCopy(`const a = <p>Email me a code</p>;`).length, 1);
  assert.equal(hardcodedCopy(`const a = <input placeholder="Your name" />;`).length, 1);
  assert.equal(hardcodedCopy(`const a = <p>{"Hello there"}</p>;`).length, 1);
  assert.deepEqual(hardcodedCopy(`const a = <p>{t("a.b")}{" · "}</p>;`), []);
  assert.deepEqual(hardcodedCopy(`const a = <input placeholder="••••••••" name="x" />;`), []);
  assert.deepEqual(staticKeys(`t("a.b") + t('c.d') + t(keys.x)`), ["a.b", "c.d"]);
});
