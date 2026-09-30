import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

test("F79: the site header CTA and right-cluster items never wrap (every design)", () => {
  const css = read("app/token-presets.css");
  const cta = css.match(/^\.site-header__cta \{[^}]*\}/m);
  assert.ok(cta, "base .site-header__cta rule");
  assert.match(cta![0], /white-space:\s*nowrap/);
  assert.match(cta![0], /flex:\s*none/);
  const ritem = css.match(/\.site-header\[data-variant="freeform"\] \.site-header__ritem \{[^}]*\}/);
  assert.ok(ritem);
  assert.match(ritem![0], /white-space:\s*nowrap/);
});

test("F80: the top-bar Publish control sticks to the right edge and the row tightens at 1100px", () => {
  const src = read("components/edit-chrome/topbar.tsx");
  assert.match(src, /className="sticky right-\[20px\][^"]*"\s+data-publish-split/);
  assert.match(src, /max-\[1100px\]:gap-\[6px\]/);
});

test("F81: the text toolbar positions its bottom from the HUD-aware resolver", () => {
  const src = read("components/edit-chrome/canvas-text-toolbar.tsx");
  assert.match(src, /resolveTextToolbarBottom\(/);
  assert.match(src, /bottom: position\.bottom/);
});

test("F79 audit: no design-specific header CSS re-enables wrapping on the CTA", () => {
  const css = read("app/token-presets.css");
  const dts = read("lib/talent-site/theme-catalog/collection/design-type-system.ts");
  for (const src of [css, dts]) {
    const rules = src.match(/[^{}\n]*site-header__(?:cta|ritem)[^{}]*\{[^}]*\}/g) ?? [];
    for (const r of rules) assert.doesNotMatch(r, /white-space:\s*(normal|wrap|pre-wrap)/, r.slice(0, 80));
  }
});
