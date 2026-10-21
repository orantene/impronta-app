/**
 * TUL-1468: only the FINAL lines of docs/plans/fee-copy-en-es-2026-10-20.md are live. The refunds page says the full amount
 * includes the Tulala service fee (section 5e, EN + ES); the lines that wait for Oran or legal (F1, F2, F5, F6) are not
 * shipped, and the TODO that says so is in the source, never in the rendered page.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const en = readFileSync(join(process.cwd(), "src/app/(marketing)/legal/refunds/page.tsx"), "utf8");
const es = readFileSync(join(process.cwd(), "src/app/(marketing)/legal/refunds/refunds-es.tsx"), "utf8");

test("the refunds page says the full amount includes the Tulala service fee, in EN and ES", () => {
  assert.match(en.replace(/\s+/g, " "), /is always shown before the customer pays\. This includes the Tulala service fee\./);
  assert.match(es.replace(/\s+/g, " "), /antes de que el cliente pague\. Esto incluye el cargo por servicio de Tulala\./);
});

test("held lines are not shipped: no subsection 3b and no customer-cancels line yet", () => {
  for (const src of [en, es]) {
    assert.doesNotMatch(src, /heading: "3b/);
    assert.doesNotMatch(src, /returned in the same proportion|en la misma proporción que tu reembolso/);
  }
  assert.match(en, /TODO\(TUL-1468\)/);
});
