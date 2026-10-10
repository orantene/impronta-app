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

test("services_catalog root CSS does not force surface-raised page ground", () => {
  const css = read("lib/site-admin/builder-node/render.tsx");
  const root = css.match(
    /\.site-builder-node--services-catalog\{[^}]+\}/,
  )?.[0];
  assert.ok(root, "services_catalog root rule must exist");
  assert.doesNotMatch(
    root,
    /background:var\(--token-color-surface-raised/,
    "shared catalog must not paint blush — Maison scopes via Design container or authored style.backgroundColor",
  );
  assert.match(
    css,
    /themedBandGround/,
    "live-bound band ground must honor authored style.backgroundColor under useWebsiteTheme",
  );
});

test("AUD-026: bare top-level catalog gets side gutter via cms-block rule", () => {
  const css = read("lib/site-admin/builder-node/render.tsx");
  assert.match(
    css,
    /\[data-cms-block\]\s*>\s*\.site-builder-node--services-catalog\{[^}]*padding-inline/,
    "top-level free-site catalog must pad horizontally like other sections",
  );
});

test("catalog row chrome wraps price+CTA in buy cluster", () => {
  // Live rows: services-catalog-row.tsx (split from filter for max-lines).
  const row = read("lib/site-admin/builder-node/services-catalog-row.tsx");
  const fallback = read("lib/site-admin/builder-node/services-catalog-static-fallback.tsx");
  const loading = read("lib/site-admin/builder-node/services-catalog-loading.tsx");
  for (const [name, src] of [
    ["row", row],
    ["static-fallback", fallback],
    ["loading", loading],
  ] as const) {
    assert.match(src, /site-builder-node--services-catalog-buy/, `${name} must wrap buy cluster`);
  }
  assert.match(row, /data-has-photo=/, "live rows advertise photo presence for mobile grid");
});
