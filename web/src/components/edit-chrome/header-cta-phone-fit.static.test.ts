import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * TUL-79: header CTA must fit inside a 390 phone frame without blanket
 * ellipsis truncation (wrap + shrink instead).
 */
test("token-presets phone CTA wraps and shrinks at <=560 without ellipsis", () => {
  const css = readFileSync(join(process.cwd(), "src/app/token-presets.css"), "utf8");
  const ctaBase = css.indexOf(".site-header__cta { margin-left: auto");
  assert.ok(ctaBase >= 0, "base .site-header__cta rule missing");
  const phoneAt = css.indexOf("@media (max-width: 560px)", ctaBase);
  assert.ok(phoneAt >= 0, "phone reflow media query missing");
  const phoneBlock = css.slice(phoneAt, phoneAt + 1100);
  assert.doesNotMatch(
    phoneBlock,
    /\.site-header__cta\s*\{[^}]*text-overflow:\s*ellipsis/,
  );
  assert.doesNotMatch(
    phoneBlock,
    /\.site-header__cta\s*\{[^}]*max-width:\s*min\(9\.5rem/,
  );
  assert.match(phoneBlock, /\.site-header__cta\s*\{[^}]*white-space:\s*normal/);
  assert.match(phoneBlock, /\.site-header__cta\s*\{[^}]*flex:\s*0\s+1\s+auto/);
});
