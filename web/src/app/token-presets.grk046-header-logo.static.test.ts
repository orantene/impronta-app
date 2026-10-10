/**
 * GRK-046 / GRK-073 — header logo ≥32px and phone side pad ≥16px.
 * Static guard on the platform CSS so demos never ship a ~20px mark again.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const CSS = readFileSync(join(process.cwd(), "src/app/token-presets.css"), "utf8");
const TYPE = readFileSync(
  join(process.cwd(), "src/lib/talent-site/theme-catalog/collection/design-type-system.ts"),
  "utf8",
);

test("GRK-046: default brand-mark clamp floors at 32px", () => {
  assert.match(
    CSS,
    /\.site-header__brand-mark\s*\{\s*width:\s*clamp\(32px/,
    "brand-mark width must floor at 32px",
  );
  assert.match(
    CSS,
    /\.site-header__brand-mark\s*\{\s*width:\s*clamp\(32px[^}]*height:\s*clamp\(32px/,
    "brand-mark height must floor at 32px",
  );
  assert.doesNotMatch(
    CSS,
    /\.site-header__brand-mark\s*\{\s*width:\s*clamp\(20px/,
    "old 20px floor must be gone",
  );
});

test("GRK-046: logo-scale sm also floors at 32px", () => {
  assert.match(
    CSS,
    /data-logo-scale="sm"\]\s*\.site-header__brand-mark\s*\{\s*width:\s*clamp\(32px/,
    "sm scale must not drop below 32px",
  );
});

test("GRK-073: type-system header phone padding floors at 16px", () => {
  assert.match(
    TYPE,
    /padding:\$\{v\("layout\.header-pad-y-phone"\)\} max\(16px,\$\{v\("layout\.gutter-phone"\)\}\)/,
    "soft/utility phone header must max(16px, gutter-phone)",
  );
  assert.match(
    TYPE,
    /padding:10px max\(16px,\$\{v\("layout\.gutter-phone"\)\}\)!important/,
    "magazine phone header must max(16px, gutter-phone)",
  );
});
