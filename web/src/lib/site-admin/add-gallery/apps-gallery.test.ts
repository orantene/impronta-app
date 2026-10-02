/**
 * Apps gallery tab: data-driven from APP_REGISTRY, offered only on talent
 * surfaces, insertable and draggable like any block, and fully bilingual.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ES_TEXT } from "@/components/edit-chrome/editor-i18n-es";
import { createBuilderNode } from "@/lib/site-admin/builder-node/create";

import { APP_REGISTRY } from "./apps-registry";
import { getAddGalleryCardInfoTooltip, getAddGalleryCardShortDescription } from "./card-display";
import { CODE_TAB_LABELS, GALLERY_TAB_IDS, normalizeAllowedTabs } from "./gallery-tab-ids";
import { galleryItemSupportsDrag, resolveAddGalleryInsertAction } from "./insert";
import { PARITY_SURFACES } from "./parity-surface-descriptors";
import { ADD_GALLERY_CATEGORIES, ADD_GALLERY_ITEMS } from "./registry";
import { codeGalleryItemsForPolicy } from "./registry-db-merge";

const APP_ITEMS = ADD_GALLERY_ITEMS.filter((i) => i.tab === "apps");

test("every registry entry becomes exactly one Apps item (data-driven)", () => {
  assert.equal(APP_ITEMS.length, APP_REGISTRY.length);
  for (const app of APP_REGISTRY) {
    const item = APP_ITEMS.find((i) => i.id === app.id);
    assert.ok(item, `${app.id} listed`);
    assert.equal(item.nativeKind, app.nativeKind);
    assert.equal(item.category, "apps");
    assert.equal(item.availability, "available");
  }
  assert.ok(APP_ITEMS.some((i) => i.label === "Nail Designer"));
  assert.ok(ADD_GALLERY_CATEGORIES.some((c) => c.tab === "apps" && c.id === "apps"));
});

test("Apps is a fifth tab labelled Apps", () => {
  assert.ok(GALLERY_TAB_IDS.includes("apps"));
  assert.equal(CODE_TAB_LABELS.apps, "Apps");
});

test("the app is listed on the talent profile surface and nowhere on the agency surfaces", () => {
  for (const surface of PARITY_SURFACES) {
    const visible = codeGalleryItemsForPolicy({
      allowedTabs: surface.allowedTabs,
      allowDbTemplates: surface.allowDbTemplates,
    }).filter((i) => i.tab === "apps");
    if (surface.key === "talent_profile") {
      assert.equal(visible.length, APP_REGISTRY.length, "talent profile offers every app");
    } else {
      assert.equal(visible.length, 0, `${surface.key} must not offer apps`);
    }
  }
});

test("the real surface configs: only talent page and theme template list the Apps tab", () => {
  const src = readFileSync(new URL("../builder-core/config.ts", import.meta.url), "utf8");
  const lists = [...src.matchAll(/allowedTabs: (\[[^\]]*\])/g)].map((m) => m[1]);
  const withApps = lists.filter((l) => l.includes('"apps"'));
  assert.equal(withApps.length, 2, "talent page + theme template");
  for (const l of withApps) assert.ok(l.includes('"page_templates"') && l.includes('"blocks"'));
  assert.equal(normalizeAllowedTabs(["blocks", "apps"]).includes("apps"), true);
  assert.equal(normalizeAllowedTabs(["blocks", "designs", "data", "shell"]).includes("apps"), false);
});

test("every app inserts a real node on click and supports drag-and-drop", () => {
  for (const item of APP_ITEMS) {
    assert.equal(galleryItemSupportsDrag(item), true);
    const action = resolveAddGalleryInsertAction(item);
    assert.equal(action.type, "nativeNode");
    if (action.type === "nativeNode") {
      assert.equal(action.node.kind, item.nativeKind);
      assert.equal(createBuilderNode(item.nativeKind!).kind, item.nativeKind);
    }
  }
});

test("i18n parity: tab, category, titles, descriptions and inspector copy all have Spanish", () => {
  assert.equal(ES_TEXT["Apps"], "Apps");
  assert.equal(ES_TEXT["Add Apps"], "Agregar apps");
  assert.equal(ES_TEXT["Nail Designer"], "Diseñador de uñas");
  const missing = new Set<string>();
  for (const cat of ADD_GALLERY_CATEGORIES.filter((c) => c.tab === "apps")) {
    if (!(cat.label in ES_TEXT)) missing.add(cat.label);
  }
  for (const item of APP_ITEMS) {
    for (const s of [item.label, getAddGalleryCardShortDescription(item), getAddGalleryCardInfoTooltip(item)]) {
      if (s && !(s in ES_TEXT)) missing.add(s);
    }
  }
  const inspector = readFileSync(
    new URL("../../../components/edit-chrome/inspectors/nail-designer-inspector.tsx", import.meta.url),
    "utf8",
  );
  for (const m of inspector.matchAll(/\bt\(\s*"([^"]+)"\s*\)/g)) {
    if (!(m[1] in ES_TEXT)) missing.add(m[1]);
  }
  assert.deepEqual([...missing], []);
});

test("no em dashes in the Spanish or English Apps copy", () => {
  const es = readFileSync(new URL("../../../components/edit-chrome/editor-i18n-es-apps.ts", import.meta.url), "utf8");
  const model = readFileSync(new URL("../builder-node/nail-designer-model.ts", import.meta.url), "utf8");
  const island = readFileSync(new URL("../builder-node/nail-designer-frame.tsx", import.meta.url), "utf8");
  for (const [name, text] of [["es catalog", es], ["model", model], ["island", island]] as const) {
    // Comments may use dashes; only string literals are user-facing.
    const literals = text.match(/"[^"\n]*"|`[^`\n]*`/g) ?? [];
    for (const lit of literals) assert.doesNotMatch(lit, /—/, `${name}: ${lit}`);
  }
});
