/**
 * Apps search + full listing. Trades and recommendedDesigns are recommendations
 * only: the Apps tab lists every app on any theme, and search matches name,
 * pitch and trade in EN and ES.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { APP_REGISTRY, appsForDesign } from "./apps-registry";
import { filterAddGalleryItems } from "./registry";

test("search matches apps by name, pitch and trade in EN and ES", () => {
  for (const q of ["uñas", "nails", "nail designer", "diseñador de uñas", "manicura", "booking", "reserva"]) {
    const hits = filterAddGalleryItems({ tab: "apps", query: q });
    assert.ok(hits.some((i) => i.nativeKind === "app_nail_designer"), `"${q}" finds the Nail Designer`);
  }
  assert.equal(filterAddGalleryItems({ tab: "apps", query: "zzzz-no-match" }).length, 0);
});

test("the Apps tab lists every app regardless of the site's design", () => {
  // The listing takes no design input: no filter can hide an app.
  const all = filterAddGalleryItems({ tab: "apps" });
  assert.equal(all.length, APP_REGISTRY.length);
  for (const app of APP_REGISTRY) assert.ok(all.some((i) => i.id === app.id));
  // A design with no recommended app still sees the whole list.
  assert.equal(appsForDesign("folio").length, 0);
});
