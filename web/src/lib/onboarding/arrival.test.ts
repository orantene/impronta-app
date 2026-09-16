import test from "node:test";
import assert from "node:assert/strict";
import { arrivalFromStamp, parseArrivalStamp } from "./arrival";

const site = { publicUrl: "https://el-paisa.tulala.digital", editorUrl: "https://el-paisa.tulala.digital/?edit=1&panel=sections", adminPath: "/el-paisa/admin" };

test("photos are claimed only for a type-level hero; menu only when items were placed", () => {
  const composed = parseArrivalStamp({ outcome: "composed", placed: { photos: { hero: "type" }, menuItems: 12, hoursPresent: true, whatsappPresent: true, logoPresent: false } });
  const a = arrivalFromStamp({ path: "business", stamp: composed, person: { name: null, city: "Cancún" }, businessName: "Parrilla El Paisa", services: 3, site, talent: null });
  assert.equal(a.variant, "business");
  assert.deepEqual(a.fact, { services: 3, city: "Cancún", logo: false, hours: true, whatsapp: true, menuItems: 12, photos: true });
  assert.equal(a.primary.label, "open_my_website");
  assert.equal(a.link?.display, "el-paisa.tulala.digital");

  const family = parseArrivalStamp({ outcome: "composed", placed: { photos: { hero: "family" }, menuItems: 0 } });
  const b = arrivalFromStamp({ path: "business", stamp: family, person: { name: null, city: null }, businessName: "X", services: 0, site, talent: null });
  assert.equal(b.fact.photos, false);
  assert.equal(b.fact.menuItems, 0);
});

test("fallback_used and failed never claim a composed site; a missing tenant is the fallback variant", () => {
  const fb = arrivalFromStamp({ path: "business", stamp: parseArrivalStamp({ outcome: "fallback_used" }), person: { name: "Mariana", city: null }, businessName: "Uñas Mariana", services: 3, site, talent: null });
  assert.equal(fb.variant, "fallback");
  assert.equal(fb.fallbackReason, "photos");
  assert.equal(fb.primary.label, "open_my_website");
  const copy = arrivalFromStamp({ path: "business", stamp: parseArrivalStamp({ outcome: "fallback_used", copySource: "defaults", placed: { photos: { hero: "type" } } }), person: { name: null, city: null }, businessName: "X", services: 0, site, talent: null });
  assert.equal(copy.fallbackReason, "copy");
  const none = arrivalFromStamp({ path: "business", stamp: null, person: { name: null, city: null }, businessName: "X", services: 0, site: null, talent: null });
  assert.equal(none.variant, "fallback");
  assert.equal(none.primary.label, "open_my_workspace");
});

test("talent arrival links to Today; both drafts the own page; an existing workspace is reopened", () => {
  const t = arrivalFromStamp({ path: "talent", stamp: null, person: { name: "Rosa", city: "Playa" }, businessName: null, services: 2, site: null, talent: { publicUrl: "https://tulala.digital/t/abc", todayUrl: "https://app.tulala.digital/talent/today" } });
  assert.equal(t.variant, "talent");
  assert.equal(t.headlineName, "Rosa");
  assert.equal(t.link?.display, "tulala.digital/t/abc");
  assert.equal(t.primary.label, "finish_my_page");
  const both = arrivalFromStamp({ path: "both", stamp: parseArrivalStamp({ outcome: "missing_logo", placed: { photos: { hero: "type" } } }), person: { name: "Mariana", city: null }, businessName: "Uñas Mariana", services: 3, site, talent: null });
  assert.equal(both.variant, "both");
  assert.equal(both.quiet, "own_page_drafted");
  const ex = arrivalFromStamp({ path: "business", stamp: null, reusedExisting: true, person: { name: null, city: null }, businessName: "X", services: 0, site, talent: null });
  assert.equal(ex.variant, "existing_workspace");
  assert.equal(ex.primary.href, "/el-paisa/admin");
  assert.equal(parseArrivalStamp({ outcome: "nope" }), null);
});
