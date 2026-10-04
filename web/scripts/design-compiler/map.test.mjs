import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildComposition, buildTickets, buildTokens, parseGate } from "./compile.mjs";
import { extractUnits } from "./extract.mjs";
import { kvarsToTokenDefaults, loadRegistry, mapUnit, normaliseUnit, paletteToLookTokens } from "./map.mjs";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const html = fs.readFileSync(new URL("./fixtures/mini.html", import.meta.url), "utf8");
// Small synthetic registry so the tests do not depend on repo drift.
const reg = {
  slots: ["hero", "about", "tasks", "gallery"],
  nodeKinds: ["accordion", "stats"],
  tokenKeys: new Set(["button.radius", "shape.card-radius", "radius.scale-preset", "type.display-weight"]),
  corpus: "magazine-cover portrait_arch task_picker",
};

test("real registry loads slots, kinds, tokens", () => {
  const r = loadRegistry(webRoot);
  assert.ok(r.slots.includes("hero") && r.slots.includes("comp_card"));
  assert.ok(r.nodeKinds.includes("accordion"));
  assert.ok(r.tokenKeys.has("button.radius"));
});

test("normaliseUnit strips W-nn and Section preset", () => {
  assert.deepEqual(normaliseUnit({ type: "W-11 Category explorer", variant: "x" }), { type: "category explorer", variant: "x" });
  assert.deepEqual(normaliseUnit({ type: "Section preset", variant: "alert band · urgency" }), { type: "alert band", variant: "urgency" });
});

test("exact when variant evidenced, near when not, none when no type match", () => {
  const u = (raw) => extractUnits(`<i data-w="${raw}">`)[0];
  assert.equal(mapUnit(u("hero · magazine-cover"), reg).confidence, "exact");
  assert.equal(mapUnit(u("hero · never-seen"), reg).confidence, "near");
  assert.equal(mapUnit(u("W-99 Teleporter · warp"), reg).confidence, "none");
  assert.equal(mapUnit(u("faq · accordion"), reg).target.node, "accordion");
});

test("composition order, stats and tickets", () => {
  const c = buildComposition(extractUnits(html), reg);
  assert.deepEqual(c.homeSlotOrder, ["hero", "tasks", "about"]);
  assert.equal(c.stats.skippedDynamic, 1);
  assert.equal(c.stats.none, 1);
  const gate = parseGate("| Theme | a |\n| Zed | 5 | 1 | 1 | 3 | W-99 Teleporter · warp drive |\n- other: 7 themes (x)\n");
  const t = buildTickets("mini", c, gate);
  assert.match(t, /## W-99 Teleporter · warp drive/);
  assert.match(t, /Other themes that list this unit: Zed/);
  assert.match(t, /Add-gallery/);
});

test("tokens: palette mapping and shape defaults", () => {
  const t = buildTokens(html, reg);
  assert.equal(t.palettes.def.tokens["color.background"], "#FFFFFF");
  assert.equal(t.palettes.def.tokens["color.accent"], "#AA2200");
  assert.equal(t.palettes.def.tokens["color.primary-on"], "#FFFFFF");
  assert.equal(t.tokenDefaults["button.radius"], "999px");
  assert.equal(t.tokenDefaults["radius.scale-preset"], "soft");
  assert.deepEqual(t.unmappedKVars, { "--k-odd": "3px" });
  assert.deepEqual(paletteToLookTokens({}, {}), {});
  assert.deepEqual(kvarsToTokenDefaults({}, reg).defaults, {});
});
