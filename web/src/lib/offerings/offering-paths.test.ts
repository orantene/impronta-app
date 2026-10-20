import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalOfferingHost,
  canonicalOfferingPath,
  catalogWordForLocale,
  isReservedOfferingSlug,
  normalizeOfferingSlug,
  resolveOfferingPath,
  uniqueOfferingSlug,
  type OfferingIndex,
} from "./offering-paths";

const EN_DEFAULT = { defaultLocale: "en", publicLocales: ["en", "es"] };
const ES_DEFAULT = { defaultLocale: "es", publicLocales: ["es", "en"] };
const ID = "0f3a9c21-1111-4111-8111-111111111111";
const OTHER = "9b8c7d6e-2222-4222-8222-222222222222";

/** One offering: es slug current + one history entry; en slug current. */
function index(over: Partial<OfferingIndex> = {}): OfferingIndex {
  const slugs: Record<string, { offeringId: string; current: boolean }> = {
    "es:masaje-profundo": { offeringId: ID, current: true },
    "es:masaje-viejo": { offeringId: ID, current: false },
    "en:deep-massage": { offeringId: ID, current: true },
    "es:pase-del-viernes": { offeringId: OTHER, current: true },
  };
  return {
    findBySlug: (l, s) => slugs[`${l}:${s}`] ?? null,
    findByIdPrefix: (p) => (ID.startsWith(p) ? ID : OTHER.startsWith(p) ? OTHER : null),
    currentSlug: (id, l) => (id === ID ? (l === "es" ? "masaje-profundo" : "deep-massage") : id === OTHER && l === "es" ? "pase-del-viernes" : null),
    primarySlug: (id) => (id === ID ? "masaje-profundo" : id === OTHER ? "pase-del-viernes" : null),
    nonPageTarget: (id) => (id === "evt" ? { kind: "event", to: "/events/noche" } : null),
    ...over,
  };
}

const r = (pathname: string, settings = EN_DEFAULT, ownerWord: Parameters<typeof resolveOfferingPath>[0]["host"]["ownerWord"] = null, idx = index()) =>
  resolveOfferingPath({ pathname, host: { hostKind: "talent", settings, ownerWord }, index: idx });

test("words: closed list, Spanish pair, canonical path applies the tenant grammar", () => {
  assert.equal(catalogWordForLocale("classes", "es"), "clases");
  assert.equal(catalogWordForLocale("tours", "es"), "tours");
  assert.equal(canonicalOfferingPath({ slug: "deep-massage", locale: "en", settings: EN_DEFAULT }), "/services/deep-massage");
  assert.equal(canonicalOfferingPath({ slug: "masaje-profundo", locale: "es", settings: EN_DEFAULT }), "/es/servicios/masaje-profundo");
  assert.equal(canonicalOfferingPath({ slug: "x", locale: "es", settings: ES_DEFAULT }), "/servicios/x");
  assert.equal(canonicalOfferingPath({ slug: "x", locale: "en", settings: ES_DEFAULT }), "/en/services/x");
  assert.equal(canonicalOfferingPath({ word: "tours", slug: "x", locale: "es", settings: EN_DEFAULT, pathPrefix: "/w/acme" }), "/es/w/acme/tours/x");
  assert.equal(canonicalOfferingPath({ word: "classes", slug: "x", locale: "es", settings: EN_DEFAULT, pathPrefix: "/t/ab12" }), "/es/t/ab12/clases/x");
});

test("current: the canonical English path is served as is", () => {
  assert.deepEqual(r("/services/deep-massage"), { kind: "current", offeringId: ID, locale: "en" });
});

test("current: the canonical Spanish path is rewritten onto the English route on disk", () => {
  assert.deepEqual(r("/es/servicios/masaje-profundo"), {
    kind: "rewrite",
    offeringId: ID,
    locale: "es",
    to: "/services/masaje-profundo",
  });
  assert.deepEqual(r("/servicios/masaje-profundo", ES_DEFAULT), {
    kind: "rewrite",
    offeringId: ID,
    locale: "es",
    to: "/services/masaje-profundo",
  });
});

test("the Spanish word pins Spanish: 301 to the prefixed canonical, not a 308", () => {
  assert.deepEqual(r("/servicios/masaje-profundo"), { kind: "redirect", status: 301, to: "/es/servicios/masaje-profundo" });
});

test("slug history 301s to the current slug, in the same language", () => {
  assert.deepEqual(r("/es/servicios/masaje-viejo"), { kind: "redirect", status: 301, to: "/es/servicios/masaje-profundo" });
});

test("a locale without its own slug uses the primary slug under its own word, never a 404", () => {
  const idx = index({ currentSlug: (id, l) => (id === ID && l === "es" ? "masaje-profundo" : null) });
  assert.deepEqual(r("/services/masaje-profundo", EN_DEFAULT, null, idx), { kind: "current", offeringId: ID, locale: "en" });
});

test("another language's slug on this language's path 301s to this language's slug", () => {
  assert.deepEqual(r("/services/masaje-profundo"), { kind: "redirect", status: 301, to: "/services/deep-massage" });
});

test("the permanent id: id8 suffix and the legacy servicio-<title>-<id8> resolve forever and 301", () => {
  assert.deepEqual(r("/services/deep-massage-0f3a9c21"), { kind: "redirect", status: 301, to: "/services/deep-massage" });
  assert.deepEqual(r("/servicio-masaje-profundo-0f3a9c21"), { kind: "redirect", status: 301, to: "/services/deep-massage" });
  assert.deepEqual(r("/es/servicio-lo-que-sea-0f3a9c21"), { kind: "redirect", status: 301, to: "/es/servicios/masaje-profundo" });
  assert.deepEqual(r("/services/0f3a9c21"), { kind: "redirect", status: 301, to: "/services/deep-massage" });
});

test("a changed owner word redirects every old form to the new word (301)", () => {
  assert.deepEqual(r("/services/deep-massage", EN_DEFAULT, "classes"), { kind: "redirect", status: 301, to: "/classes/deep-massage" });
  assert.deepEqual(r("/classes/deep-massage", EN_DEFAULT, "classes"), { kind: "current", offeringId: ID, locale: "en" });
  assert.deepEqual(r("/tours/deep-massage", EN_DEFAULT, "classes"), { kind: "redirect", status: 301, to: "/classes/deep-massage" });
});

test("308 is only the locale prefix: the default locale's own prefix is stripped", () => {
  assert.deepEqual(r("/en/services/deep-massage"), { kind: "redirect", status: 308, to: "/services/deep-massage" });
  assert.deepEqual(r("/es/servicios/masaje-profundo", ES_DEFAULT), { kind: "redirect", status: 308, to: "/servicios/masaje-profundo" });
});

test("path tenant and hub prefixes are kept", () => {
  assert.deepEqual(r("/es/w/acme/servicios/masaje-profundo"), {
    kind: "rewrite",
    offeringId: ID,
    locale: "es",
    to: "/w/acme/services/masaje-profundo",
  });
  assert.deepEqual(r("/t/ab12/services/masaje-viejo"), { kind: "redirect", status: 301, to: "/t/ab12/services/deep-massage" });
});

test("the list page: the owner's word; another word 301s to it", () => {
  assert.deepEqual(r("/services"), { kind: "list", word: "services", locale: "en" });
  assert.deepEqual(r("/es/servicios"), { kind: "list", word: "services", locale: "es" });
  assert.deepEqual(r("/tours", EN_DEFAULT, "services"), { kind: "redirect", status: 301, to: "/services" });
});

test("events and reservations have no service page: 301 to the event or booking flow", () => {
  const idx = index({ findBySlug: (l, s) => (s === "noche" ? { offeringId: "evt", current: true } : null) });
  assert.deepEqual(r("/services/noche", EN_DEFAULT, null, idx), { kind: "redirect", status: 301, to: "/events/noche" });
});

test("unknown slug is missing; non-offering paths are none", () => {
  assert.deepEqual(r("/services/nope"), { kind: "missing" });
  assert.deepEqual(r("/about"), { kind: "none" });
  assert.deepEqual(r("/services/a/b"), { kind: "none" });
  assert.deepEqual(r("/services/Bad_Slug"), { kind: "none" });
});

test("canonical owner is the seller of record", () => {
  assert.equal(canonicalOfferingHost({ soldBy: "talent", talentHasSite: true }), "talent_site");
  assert.equal(canonicalOfferingHost({ soldBy: "talent", talentHasSite: false }), "hub");
  assert.equal(canonicalOfferingHost({ soldBy: "workspace", talentHasSite: true }), "workspace");
  assert.equal(canonicalOfferingHost({ soldBy: "workspace", workspaceMirrorsUnchanged: true, talentHasSite: true }), "talent_site");
});

test("slugs: accents and spaces converted, collisions get -2 and -3, list words are reserved", () => {
  assert.equal(normalizeOfferingSlug("  Masaje Profundo & Relajación! "), "masaje-profundo-and-relajacion");
  assert.equal(normalizeOfferingSlug("!!!"), "");
  assert.equal(uniqueOfferingSlug("yoga", new Set(["yoga"])), "yoga-2");
  assert.equal(uniqueOfferingSlug("yoga", new Set(["yoga", "yoga-2"])), "yoga-3");
  assert.equal(uniqueOfferingSlug("yoga", new Set()), "yoga");
  for (const w of ["tours", "clases", "espacios", "classes", "spaces", "services", "servicios", "menu"]) assert.ok(isReservedOfferingSlug(w), w);
  assert.ok(isReservedOfferingSlug("0f3a9c21"));
  assert.ok(isReservedOfferingSlug("servicio-x-0f3a9c21"));
  assert.ok(!isReservedOfferingSlug("deep-massage"));
});
