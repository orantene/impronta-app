import test from "node:test";
import assert from "node:assert/strict";

import { appsForDemo, appsForDesign, appsForTrade, APP_REGISTRY, tradesForDemoCode } from "@/lib/site-admin/add-gallery/apps-registry";
import { THEME_DEMOS } from "@/lib/talent-site/theme-catalog/theme-demos";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { NAIL_BAND_ID, nailBand, placeDemoApps } from "./app-placement";
import { sameStable } from "./stable";

const node = (id: string, layerLabel: string) => ({ id, kind: "container", props: { layerLabel }, children: [] }) as unknown as BuilderNode;
const home = () => ["Hero", "Work", "Menu", "Reviews", "About"].map((l) => node(l.toLowerCase(), l));

test("library: trades, designs, premium flag", () => {
  assert.deepEqual(appsForTrade("nails").map((a) => a.nativeKind), ["app_nail_designer"]);
  assert.equal(appsForTrade("barber").length, 0);
  assert.equal(appsForDesign("maison-v2").length, 1);
  assert.equal(appsForDesign("folio").length, 0);
  for (const a of APP_REGISTRY) {
    assert.equal(a.premium, false);
    assert.ok(a.name.en && a.name.es && a.pitch.en && a.pitch.es && a.trades.length);
  }
});

test("library: appsForDemo follows trade, includes Alba", () => {
  assert.equal(appsForDemo({ profileCode: "TAL-93020" }).length, 1);
  assert.equal(appsForDemo({ profileCode: "TAL-93003" }).length, 1);
  assert.equal(appsForDemo({ profileCode: "TAL-93107" }).length, 0);
});

test("placement: only Maison v2 nails demos, right after Menu", () => {
  const placed: string[] = [];
  for (const d of THEME_DEMOS) {
    const r = placeDemoApps(home(), d);
    if (r.placed) {
      placed.push(d.profileCode);
      assert.equal(d.design, "maison-v2");
      const i = r.tree.findIndex((n) => n.id === NAIL_BAND_ID);
      assert.equal(r.tree[i - 1]!.id, "menu");
    } else assert.equal(r.tree.length, 5);
  }
  assert.deepEqual(placed.sort(), ["TAL-93003", "TAL-93103"]);
  assert.equal(placeDemoApps(home(), { design: "maison-v2", profileCode: "TAL-93020" }).placed, true);
  assert.equal(placeDemoApps(home(), { design: "maison-v2", profileCode: "TAL-93107" }).placed, false);
  assert.equal(placeDemoApps(home(), { design: "folio", profileCode: "TAL-93020" }).placed, false);
});

test("placement: idempotent, even on an already-placed tree", () => {
  const demo = { design: "maison-v2", profileCode: "TAL-93003" };
  const a = placeDemoApps(home(), demo).tree;
  const b = placeDemoApps(a, demo).tree;
  assert.ok(sameStable(a, b));
  assert.equal(b.filter((n) => n.id === NAIL_BAND_ID).length, 1);
});

test("band: ES/EN copy, design tokens only (no hex)", () => {
  const json = JSON.stringify(nailBand());
  assert.doesNotMatch(json, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(json, /Pruébalo/);
  assert.match(json, /Diseña tus uñas antes de tu cita/);
  assert.match(json, /token:color\.surface-raised/);
  assert.doesNotMatch(json, /—/);
});

test("Andrés (TAL-93006) is a recorded chef: no app recommended, never nails", () => {
  assert.deepEqual(tradesForDemoCode("TAL-93006"), ["chef"]);
  assert.equal(appsForDemo({ profileCode: "TAL-93006" }).length, 0);
});
