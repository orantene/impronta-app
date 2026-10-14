/** TUL-859: /es/agencies body must be Spanish, not English under a Spanish nav. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const src = readFileSync(
  path.join(process.cwd(), "src/app/(marketing)/agencies/page.tsx"),
  "utf8",
);

test("agencies page reads the request locale", () => {
  assert.match(src, /await getRequestLocale\(\)/);
});

test("every en: string in the page has an es: sibling", () => {
  const en = (src.match(/\ben: /g) ?? []).length;
  const es = (src.match(/\bes: /g) ?? []).length;
  assert.equal(en, es);
  assert.ok(es >= 30);
});

test("hero and CTAs are not bare English literals", () => {
  assert.doesNotMatch(src, /label: "Start 14-day trial"/);
  assert.doesNotMatch(src, /eyebrow="For agencies & representation"/);
  assert.doesNotMatch(src, /rebuilt for 2026\.<\/span>/);
});
