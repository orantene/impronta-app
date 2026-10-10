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

test("talent arrival with a published own site opens that URL; without one it is unchanged", () => {
  const base = { path: "talent" as const, stamp: null, person: { name: "Rosa", city: null }, businessName: null, services: 0, site: null };
  const live = arrivalFromStamp({ ...base, talent: { publicUrl: "https://tulala.digital/t/abc", todayUrl: "/talent/today", siteUrl: "https://rosa.tulala.digital" } });
  assert.equal(live.siteLive, true);
  assert.equal(live.primary.label, "open_my_site");
  assert.equal(live.primary.href, "https://rosa.tulala.digital");
  assert.equal(live.link?.display, "rosa.tulala.digital");
  const none = arrivalFromStamp({ ...base, talent: { publicUrl: "https://tulala.digital/t/abc", todayUrl: "/talent/today", siteUrl: null } });
  assert.equal(none.siteLive, undefined);
  assert.equal(none.primary.label, "finish_my_page");
});

const liveBase = {
  person: { name: "Rosa Díaz", city: "CDMX" },
  businessName: null,
  services: 2,
  site: null,
  talent: { publicUrl: "https://tulala.digital/t/TAL-1", todayUrl: "https://app.tulala.digital/talent/today", siteUrl: "https://rosa.tulala.digital" },
} as const;

test("1D: a verified talent site says ready and carries editor + panel targets", () => {
  const a = arrivalFromStamp({ path: "talent", stamp: null, ...liveBase, liveCheck: { ok: true } });
  assert.equal(a.variant, "talent");
  assert.equal(a.verified, true);
  assert.equal(a.siteLive, true);
  assert.equal(a.panelHref, "https://app.tulala.digital/talent/today");
});

test("1D: a failed live check is the honest draft state, never ready", () => {
  const a = arrivalFromStamp({ path: "talent", stamp: null, ...liveBase, liveCheck: { ok: false } });
  assert.equal(a.variant, "draft_saved");
  assert.equal(a.verified, false);
  assert.equal(a.siteLive, false);
});

test("1D: a studio whose page does not verify becomes draft_saved with its editor link", () => {
  const a = arrivalFromStamp({
    path: "business", stamp: { outcome: "composed" }, person: { name: "Ana", city: null }, businessName: "Casa Ana", services: 3,
    site: { publicUrl: "https://casa-ana.tulala.digital", editorUrl: "https://casa-ana.tulala.digital/edit", adminPath: "https://app.tulala.digital/admin" },
    talent: null, liveCheck: { ok: false }, urlDiffers: true,
  });
  assert.equal(a.variant, "draft_saved");
  assert.equal(a.editorHref, "https://casa-ana.tulala.digital/edit");
  assert.equal(a.urlDiffers, true);
});

test("onb1-15: Free path URL that verifies is ready, never draft_saved", () => {
  const a = arrivalFromStamp({
    path: "business",
    stamp: { outcome: "composed", placed: { photos: { hero: "type" }, hoursPresent: true } },
    person: { name: "QA Grok Uno", city: "Cancún" },
    businessName: "QA Grok Salon",
    services: 2,
    site: {
      publicUrl: "https://tulala.digital/w/qa-grok-salon",
      editorUrl: "https://tulala.digital/w/qa-grok-salon/?edit=1",
      adminPath: "https://app.tulala.digital/qa-grok-salon/admin",
    },
    talent: null,
    liveCheck: { ok: true },
  });
  assert.equal(a.variant, "business");
  assert.equal(a.verified, true);
  assert.notEqual(a.variant, "draft_saved");
  assert.equal(a.link?.href, "https://tulala.digital/w/qa-grok-salon");
  assert.equal(a.link?.display, "tulala.digital/w/qa-grok-salon");
});

test("1D: unchecked callers keep the old behaviour", () => {
  const a = arrivalFromStamp({ path: "talent", stamp: null, ...liveBase });
  assert.equal(a.verified, undefined);
  assert.equal(a.variant, "talent");
});
