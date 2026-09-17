import assert from "node:assert/strict";
import { test } from "node:test";

import {
  includesLines, mergeTierPresentation, normalizeTierPresentation, tierPresentationSchema, toStoredTierPresentation,
  TIER_BADGE_MAX, TIER_INCLUDES_MAX_LINES,
} from "./tier-presentation";

const MEDIA = "55555555-5555-4555-8555-555555555555";

test("normalize: undefined, null, non-objects and arrays read as empty (the column may be absent for one deploy)", () => {
  for (const raw of [undefined, null, "x", 3, [], [1]]) {
    assert.deepEqual(normalizeTierPresentation(raw), { imageMediaId: null, badge: null, includes: [], description: null });
  }
});

test("normalize: reads the stored snake_case shape and the camelCase wire shape", () => {
  const stored = normalizeTierPresentation({ image_media_id: MEDIA.toUpperCase(), badge: " VIP ", includes: ["Copa", " ", "Acceso 18:00"], description: " Front row " });
  assert.deepEqual(stored, { imageMediaId: MEDIA, badge: "VIP", includes: ["Copa", "Acceso 18:00"], description: "Front row" });
  const wire = normalizeTierPresentation({ imageMediaId: MEDIA, includes: "a\nb\n\nc" });
  assert.deepEqual(wire, { imageMediaId: MEDIA, badge: null, includes: ["a", "b", "c"], description: null });
});

test("normalize: a non-uuid image id is dropped, unknown keys are ignored, lengths are capped", () => {
  const p = normalizeTierPresentation({ image_media_id: "not-a-uuid", badge: "x".repeat(99), includes: Array.from({ length: 30 }, (_, i) => `l${i}`), colour: "red" });
  assert.equal(p.imageMediaId, null);
  assert.equal(p.badge?.length, TIER_BADGE_MAX);
  assert.equal(p.includes.length, TIER_INCLUDES_MAX_LINES);
  assert.equal("colour" in p, false);
});

test("toStored: only the keys that carry something, in snake_case; round-trips through normalize", () => {
  assert.deepEqual(toStoredTierPresentation(normalizeTierPresentation({})), {});
  const p = normalizeTierPresentation({ imageMediaId: MEDIA, badge: "VIP", includes: ["a"], description: "d" });
  const stored = toStoredTierPresentation(p);
  assert.deepEqual(stored, { image_media_id: MEDIA, badge: "VIP", includes: ["a"], description: "d" });
  assert.deepEqual(normalizeTierPresentation(stored), p);
});

test("schema: refuses a bad image id and an over-long badge; accepts null image (clear)", () => {
  assert.equal(tierPresentationSchema.safeParse({ imageMediaId: "nope" }).success, false);
  assert.equal(tierPresentationSchema.safeParse({ badge: "x".repeat(TIER_BADGE_MAX + 1) }).success, false);
  assert.equal(tierPresentationSchema.safeParse({ imageMediaId: null, badge: "VIP", includes: ["a"], description: "" }).success, true);
});

test("includesLines: one per line, trimmed, blanks dropped", () => {
  assert.deepEqual(includesLines(" a \r\n\n b\n"), ["a", "b"]);
});

test("merge: the builder override wins per field; a blank override leaves the tier's own value", () => {
  const base = { imageSrc: "https://cdn/tier.jpg", badge: "VIP", includes: ["Copa"], description: "Own" };
  assert.deepEqual(mergeTierPresentation(base, undefined), { imageSrc: "https://cdn/tier.jpg", badge: "VIP", includes: ["Copa"], description: "Own" });
  assert.deepEqual(mergeTierPresentation(base, { badge: "  ", includes: "", imageSrc: " " }), { imageSrc: "https://cdn/tier.jpg", badge: "VIP", includes: ["Copa"], description: "Own" });
  assert.deepEqual(
    mergeTierPresentation(base, { badge: "Early", includes: "x\ny", imageSrc: "https://cdn/page.jpg", description: "Page" }),
    { imageSrc: "https://cdn/page.jpg", badge: "Early", includes: ["x", "y"], description: "Page" },
  );
  // Override only some fields: the rest stay the tier's own.
  assert.deepEqual(mergeTierPresentation(base, { badge: "Early" }), { imageSrc: "https://cdn/tier.jpg", badge: "Early", includes: ["Copa"], description: "Own" });
});

test("merge: no image anywhere → imageSrc null (the card renders no image column)", () => {
  assert.equal(mergeTierPresentation(null, null).imageSrc, null);
  assert.equal(mergeTierPresentation({ badge: "VIP" }, { includes: "a" }).imageSrc, null);
});
