import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildTalentProfileJsonLd } from "./talent-json-ld";

const base = { canonicalUrl: "https://morena.tulala.digital/", name: "Morena" };
const person = (ld: ReturnType<typeof buildTalentProfileJsonLd>) =>
  (ld as { mainEntity: Record<string, unknown> }).mainEntity;

test("JSON-LD reviews: zero reviews -> no aggregateRating or review", () => {
  const p = person(buildTalentProfileJsonLd({ ...base, reviews: { average: 0, count: 0, items: [] } }));
  assert.equal(p.aggregateRating, undefined);
  assert.equal(p.review, undefined);
  assert.equal(person(buildTalentProfileJsonLd(base)).aggregateRating, undefined);
});

test("JSON-LD reviews: real reviews emit AggregateRating + Review", () => {
  const p = person(
    buildTalentProfileJsonLd({
      ...base,
      reviews: {
        average: 4.66,
        count: 3,
        items: [
          { rating: 5, body: "Great", authorName: "Ana", createdAt: "2026-01-01" },
          { rating: 9, body: "bad rating dropped" },
          { rating: 4, authorName: null },
        ],
      },
    }),
  );
  const agg = p.aggregateRating as Record<string, unknown>;
  assert.equal(agg.ratingValue, 4.7);
  assert.equal(agg.reviewCount, 3);
  const rv = p.review as Record<string, unknown>[];
  assert.equal(rv.length, 2);
  assert.equal((rv[1].author as { name: string }).name, "Verified client");
});

test("JSON-LD reviews: the profile only passes reviews through the demo-gated loader", () => {
  const view = readFileSync("src/app/t/[profileCode]/profile-view.tsx", "utf8");
  assert.match(view, /reviews: await loadProfileReviewsJsonLd\(/);
  const loader = readFileSync("src/lib/seo/talent-profile-reviews-ld.server.ts", "utf8");
  assert.match(loader, /!args\.reviewsEnabled \|\| args\.summary\.count < 1 \|\| args\.rows\.length === 0/);
  assert.match(loader, /\.select\("is_demo"\)/);
  assert.match(loader, /is_demo !== false\) return null/);
});
