import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parsePaintedRgb, themeForRgb } from "./captcha-theme";

const HERE = dirname(fileURLToPath(import.meta.url));

test("a dark surface gets the dark widget", () => {
  // The storefront's painted surface is rgb(10,10,10). A white captcha card
  // there is the glare the owner reported.
  assert.equal(themeForRgb([10, 10, 10]), "dark");
  assert.equal(themeForRgb([255, 255, 255]), "light");
});

test("luminance decides, not raw channel values", () => {
  // A saturated blue is dark to the eye even though one channel is high.
  assert.equal(themeForRgb([20, 20, 200]), "dark");
  assert.equal(themeForRgb([240, 230, 120]), "light");
});

test("transparent backgrounds are skipped, not treated as black", () => {
  // THE BUG THIS ENCODES: document.body on the storefront is rgb(249,249,251)
  // and the dark surface is an inner container. The stamper walks ancestors and
  // must SKIP non-painting ones rather than read a transparent rgba as "dark".
  assert.equal(parsePaintedRgb("rgba(0, 0, 0, 0)"), null);
  assert.equal(parsePaintedRgb("transparent"), null);
  assert.equal(parsePaintedRgb(""), null);
  assert.deepEqual(parsePaintedRgb("rgb(10, 10, 10)"), [10, 10, 10]);
  assert.deepEqual(parsePaintedRgb("rgba(20, 30, 40, 0.9)"), [20, 30, 40]);
  assert.equal(parsePaintedRgb("rgba(20, 30, 40, 0.3)"), null, "a mostly-transparent wash is not the surface");
});

test("both renderers mount the stamper, so neither can drift", () => {
  // The freeform renderer's captcha markup mirrors the section component's. A
  // capability wired into one renderer and not the other is this repo's most
  // repeated failure, so this asserts BOTH mount the single shared component -
  // once per provider branch.
  const renderer = readFileSync(join(HERE, "../../builder-node/render.tsx"), "utf8");
  const component = readFileSync(join(HERE, "Component.tsx"), "utf8");
  for (const [name, src] of [["render.tsx", renderer], ["Component.tsx", component]] as const) {
    assert.match(src, /import \{ CaptchaThemeStamper \}/, `${name} must import the shared stamper`);
    const uses = src.split("<CaptchaThemeStamper />").length - 1;
    assert.equal(uses, 2, `${name} must stamp for BOTH hcaptcha and turnstile (found ${uses})`);
  }
});

test("no renderer ships the dead inline-script variant", () => {
  // Version 1 of this fix was an inline <script> beside the widget. React
  // streams segment HTML through the RSC payload and scripts injected that way
  // never execute - it looked wired and did nothing.
  for (const f of ["../../builder-node/render.tsx", "Component.tsx"]) {
    assert.doesNotMatch(readFileSync(join(HERE, f), "utf8"), /CAPTCHA_THEME_SNIPPET/);
  }
});
