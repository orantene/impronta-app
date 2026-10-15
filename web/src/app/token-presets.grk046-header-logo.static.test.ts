/**
 * GRK-046 / GRK-073 — header logo size and full-bleed side gutter.
 * Static guard on the platform CSS so demos never ship a ~20px mark again.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const CSS = readFileSync(join(process.cwd(), "src/app/token-presets.css"), "utf8");

// GRK-046 32px-square floor tests dropped: superseded on main by TUL-532 (height-led mark, min 30px, 36-44px default).

test("GRK-073: full-bleed never wipes the site_header side gutter (desktop, tablet, phone)", () => {
  for (const attr of ["data-section-container", "data-section-tablet-container", "data-section-mobile-container"]) {
    assert.match(
      CSS,
      new RegExp(`\\.site-header\\[${attr}="full-bleed"\\] > \\.site-header__inner--freeform \\{\\s*padding-inline: clamp\\(16px, 3vw, 44px\\) !important;`),
      `${attr} full-bleed keeps a ≥16px header gutter`,
    );
  }
});
