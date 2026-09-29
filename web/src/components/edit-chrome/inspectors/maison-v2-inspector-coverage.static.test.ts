/**
 * Maison v2 inspector coverage: every variant / option a Maison v2 page sets and
 * the renderer reads must be switchable in the builder's inspector. Two were
 * missing (2026-09-28 audit on demo talent Alba): the `next_free_chip` block had
 * no content inspector at all, and `services_catalog.showModeChip` had no
 * control. File-text pins, same rationale as the sibling *.static.test.ts guards.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(resolve(THIS_DIR, f), "utf8");

test("next_free_chip dispatches to its own content inspector", () => {
  const src = read("builder-node-content.tsx");
  assert.match(src, /node\.kind === "next_free_chip"\) \{\s*return <NextFreeChipContentInspector/);
});

test("the next_free_chip inspector offers both render variants and both labels", () => {
  const src = read("next-free-chip-inspector.tsx");
  assert.ok(src.includes('["inline", "stacked"]'));
  assert.ok(src.includes("labelEn:"));
  assert.ok(src.includes("labelEs:"));
});

test("services_catalog exposes showModeChip", () => {
  const src = read("services-catalog-inspector.tsx");
  assert.ok(src.includes("showModeChip: e.target.checked"));
});

test("the Maison v2 variants already offered stay offered", () => {
  const portfolio = readFileSync(
    resolve(THIS_DIR, "../../../lib/site-admin/builder-node/portfolio-defaults.ts"),
    "utf8",
  );
  assert.ok(portfolio.includes('"staggered"'), "portfolio Staggered strip");
  const fields = readFileSync(
    resolve(THIS_DIR, "../../../lib/site-admin/builder-node/builder-2027-fields.ts"),
    "utf8",
  );
  assert.ok(fields.includes('{ value: "serif", label: "Serif italic" }'), "marquee Serif italic");
  const services = read("services-catalog-inspector.tsx");
  for (const v of ['"rail"', '"rows"', '"pill"', 'pricePlacement: e.target.checked ? "meta"']) {
    assert.ok(services.includes(v), `services_catalog ${v}`);
  }
  assert.ok(read("builder-node-content.tsx").includes("startClosed: next"), "accordion start closed");
});
