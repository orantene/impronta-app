import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// TUL-1911: after a successful edit the card must say the review was updated.
const card = readFileSync(
  new URL("../../app/(workspace)/[tenantSlug]/client/_components/LeaveReviewCard.tsx", import.meta.url),
  "utf8",
);

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

test("edit save shows the updated confirmation; first save keeps the thanks copy", () => {
  assert.match(card, /setSavedWasEdit\(existing != null\)/);
  assert.match(card, /public\.reviews\.form\.updatedTitle/);
  assert.match(card, /public\.reviews\.form\.updatedBody/);
  assert.match(card, /public\.reviews\.form\.savedTitle/);
  assert.match(card, /role="status"/);
  // error path unchanged
  assert.match(card, /setState\("error"\)/);
  assert.match(card, /public\.reviews\.form\.saveError/);
});

test("updated copy exists in en, es and fr without em dashes", () => {
  for (const l of ["en", "es", "fr"]) {
    const m = JSON.parse(readFileSync(new URL(`../../../messages/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["updatedTitle", "updatedBody"]) {
      const v = getPath(m, `public.reviews.form.${k}`);
      assert.equal(typeof v, "string", `${l} ${k}`);
      assert.ok(!(v as string).includes("—"), `${l} ${k} has an em dash`);
    }
  }
  const en = JSON.parse(readFileSync(new URL("../../../messages/en.json", import.meta.url), "utf8"));
  assert.equal(getPath(en, "public.reviews.form.updatedTitle"), "Review updated.");
  const es = JSON.parse(readFileSync(new URL("../../../messages/es.json", import.meta.url), "utf8"));
  assert.equal(getPath(es, "public.reviews.form.updatedTitle"), "Reseña actualizada.");
});
