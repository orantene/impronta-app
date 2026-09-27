/**
 * BJ-10 — EL MENÚ ticket rows must not use the cavernous `120px 1fr auto auto`
 * spreadsheet grid. Desktop packs copy↔buy; phone keeps price+CTA on one band.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = join(HERE, "../../..");

function read(rel: string): string {
  return readFileSync(join(WEB_SRC, rel), "utf8");
}

test("services_catalog CSS drops spreadsheet 1fr middle between copy and price", () => {
  const css = read("lib/site-admin/builder-node/render.tsx");
  assert.doesNotMatch(
    css,
    /services-catalog-row\{[^}]*grid-template-columns:120px 1fr auto auto/,
    "rows layout must not stretch copy with 1fr between description and price",
  );
  assert.match(css, /services-catalog-buy/, "price+CTA must share a buy cluster");
  assert.match(css, /max-width:46ch/, "description width capped like Maison DOR");
  assert.match(
    css,
    /grid-template-areas:"photo copy" "photo buy"/,
    "390 layout keeps price+Seleccionar on one band under copy",
  );
});

test("services_catalog paints soft blush ground from surface-raised token", () => {
  const css = read("lib/site-admin/builder-node/render.tsx");
  assert.match(
    css,
    /\.site-builder-node--services-catalog\{[^}]*background:var\(--token-color-surface-raised/,
    "Maison DoR idle catalog ground uses theme surface-raised (blush on pink)",
  );
});

test("catalog row chrome wraps price+CTA in buy cluster", () => {
  const filter = read("lib/site-admin/builder-node/services-catalog-filter.tsx");
  const fallback = read("lib/site-admin/builder-node/services-catalog-static-fallback.tsx");
  const loading = read("lib/site-admin/builder-node/services-catalog-loading.tsx");
  for (const [name, src] of [
    ["filter", filter],
    ["static-fallback", fallback],
    ["loading", loading],
  ] as const) {
    assert.match(src, /site-builder-node--services-catalog-buy/, `${name} must wrap buy cluster`);
  }
  assert.match(filter, /data-has-photo=/, "filter rows advertise photo presence for mobile grid");
});
