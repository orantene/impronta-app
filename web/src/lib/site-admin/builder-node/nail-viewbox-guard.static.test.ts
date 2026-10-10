import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const appJs = readFileSync(join(process.cwd(), "design-references/apps/nail-designer-v2/src/app.js"), "utf8");
const styleCss = readFileSync(
  join(process.cwd(), "design-references/apps/nail-designer-v2/src/style.css"),
  "utf8",
);

// Catches: SVG viewBox "NaN …" when the stage measures 0×N during layout.
test("nail designer refuses non-finite viewBox writes", () => {
  assert.match(appJs, /function finiteVB\(/);
  assert.match(appJs, /w > 0 && h > 0/);
  assert.match(appJs, /if \(!finiteVB\(next\) \|\| !svg\) return;/);
});

// Catches: sticky surprise button masking the last nail tab on phone.
test("nail designer tabs scroll without a sticky mask on the last tab", () => {
  assert.doesNotMatch(styleCss, /\.nd-tabs \.nd-rand\{[^}]*position:sticky/);
  assert.match(styleCss, /\.nd-tab\{flex:0 0 auto/);
});
