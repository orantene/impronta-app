import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { extractFontFamilies, extractKVars, extractPalettes, extractTokens, extractUnits } from "./extract.mjs";

const html = fs.readFileSync(new URL("./fixtures/mini.html", import.meta.url), "utf8");

test("units keep document order and flag dynamic labels", () => {
  const u = extractUnits(html);
  assert.deepEqual(u.map((x) => x.type), ["hero", "W-11 Category explorer", "about", "W-99 Teleporter", "${opts.w||'x'}"]);
  assert.equal(u[0].variant, "magazine-cover");
  assert.equal(u[4].dynamic, true);
});

test("palettes parse with balanced braces", () => {
  const p = extractPalettes(html);
  assert.deepEqual(Object.keys(p), ["def", "dark"]);
  assert.equal(p.def.bg, "#FFFFFF");
  assert.equal(p.dark.n, "Dark {x}");
  assert.equal(p.dark.accent, "#FFCC00");
});

test("fonts and k-vars", () => {
  assert.deepEqual(extractFontFamilies(html).map((f) => f.family), ["Playfair Display", "Inter", "Oswald"]);
  assert.equal(extractKVars(html)["--k-rad"], "12px");
});

test("font roles: display, body, label from uppercase rule", () => {
  const r = extractTokens(html).roles;
  assert.equal(r.display, "Playfair Display");
  assert.equal(r.body, "Inter");
  assert.equal(r.label, "Oswald");
});

test("no palettes yields empty object", () => {
  assert.deepEqual(extractPalettes("<html></html>"), {});
});
