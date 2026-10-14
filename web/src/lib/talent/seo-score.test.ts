import assert from "node:assert/strict";
import test from "node:test";

import { buildSeoScore, type SeoInput } from "./seo-score";

const full: SeoInput = {
  bioLength: 300,
  photoCount: 8,
  pricedServiceCount: 4,
  homeCity: "Cancún",
  languageCount: 2,
  published: true,
  reviewCount: 3,
  hasCustomDomain: true,
};
const only = (patch: SeoInput) => buildSeoScore(patch);
const itemOf = (s: ReturnType<typeof buildSeoScore>, id: string) => s.items.find((x) => x.id === id)!;

test("full profile scores 100 with no next action", () => {
  const s = buildSeoScore(full);
  assert.equal(s.score, 100);
  assert.equal(s.next, null);
});

test("weights sum to 100", () => {
  assert.equal(buildSeoScore(full).items.reduce((a, b) => a + b.weight, 0), 100);
});

test("empty, null and undefined profiles do not crash and score 0", () => {
  for (const x of [{}, null, undefined, { bioLength: NaN, photoCount: -1, homeCity: "   " }]) {
    const s = buildSeoScore(x as SeoInput | null);
    assert.equal(s.score, 0);
    assert.ok(s.next);
  }
});

test("bio needs 120 characters", () => {
  assert.equal(itemOf(only({ bioLength: 119 }), "bio").done, false);
  assert.equal(itemOf(only({ bioLength: 120 }), "bio").done, true);
});

test("photos need 5", () => {
  assert.equal(itemOf(only({ photoCount: 4 }), "photos").done, false);
  assert.equal(itemOf(only({ photoCount: 5 }), "photos").done, true);
});

test("services need 3 priced", () => {
  assert.equal(itemOf(only({ pricedServiceCount: 2 }), "services").done, false);
  assert.equal(itemOf(only({ pricedServiceCount: 3 }), "services").done, true);
});

test("city ignores blank strings", () => {
  assert.equal(itemOf(only({ homeCity: " " }), "city").done, false);
  assert.equal(itemOf(only({ homeCity: "Tulum" }), "city").done, true);
});

test("languages, published, reviews and domain flags", () => {
  assert.equal(itemOf(only({ languageCount: 1 }), "languages").done, true);
  assert.equal(itemOf(only({ published: true }), "published").done, true);
  assert.equal(itemOf(only({ reviewCount: 1 }), "reviews").done, true);
  assert.equal(itemOf(only({ hasCustomDomain: true }), "domain").done, true);
  assert.equal(only({ hasCustomDomain: true }).score, 5);
});

test("next is the heaviest open item and each item links to an editor", () => {
  const s = buildSeoScore({ ...full, services: undefined, pricedServiceCount: 0, published: false } as SeoInput);
  assert.equal(s.next?.id, "services");
  for (const it of s.items) assert.match(it.href, /^\/talent\//);
});

test("ES copy is localized and no copy has an em dash", () => {
  const es = buildSeoScore({}, "es");
  const en = buildSeoScore({}, "en");
  assert.notEqual(es.items[0].label, en.items[0].label);
  for (const it of [...es.items, ...en.items]) assert.ok(!/—/.test(it.label + it.fix));
});
