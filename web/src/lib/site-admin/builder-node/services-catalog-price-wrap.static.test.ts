/**
 * Maison v2 release 2.1 (code item): the menu price line must be allowed to
 * wrap on narrow phones. The base rule keeps `white-space:nowrap` for the
 * desktop rows; a narrow-width override lets the price wrap and shrink.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "render.tsx"), "utf8");

test("services_catalog price wraps on narrow phones", () => {
  const m = css.match(
    /@media\(max-width:480px\)\{\.site-builder-node--services-catalog-price\{([^}]*)\}\}/,
  );
  assert.ok(m, "narrow-width price override is missing");
  const body = m[1]!;
  assert.match(body, /white-space:normal/);
  assert.match(body, /overflow-wrap:anywhere/);
  assert.match(body, /min-width:0/);
  assert.match(body, /flex:0 1 auto/, "price must be allowed to shrink");
});

test("the price override comes after the base nowrap rule", () => {
  const base = css.indexOf(".site-builder-node--services-catalog-price{display:flex;flex-direction:column;align-items:flex-start");
  const narrow = css.indexOf("@media(max-width:480px){.site-builder-node--services-catalog-price{");
  assert.ok(base >= 0 && narrow > base, "override must follow the base rule to win the cascade");
});
