import test from "node:test";
import assert from "node:assert/strict";

import { shownServiceReviews } from "./service-page-reviews";

const rev = (id: string, o: object = {}) => ({ id, body: `Muy bien ${id}`, clientName: "Ana", rating: 5, createdAt: "2026-09-01T10:00:00Z", ...o });

test("TUL-795 reviews: up to 3 with a body; aggregate only with a real count; nothing -> null", () => {
  const s = shownServiceReviews({ average: 4.8, count: 12, reviews: [rev("a"), rev("b", { body: " " }), rev("c"), rev("d"), rev("e")] });
  assert.deepEqual(s?.reviews.map((r) => r.id), ["a", "c", "d"]);
  assert.equal(s?.count, 12);
  assert.equal(shownServiceReviews({ average: 0, count: 0, reviews: [] }), null);
  assert.equal(shownServiceReviews(null), null);
  assert.equal(shownServiceReviews({ average: 0, count: 0, reviews: [rev("a")] })?.count, 0);
});

