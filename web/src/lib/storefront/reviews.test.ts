import assert from "node:assert/strict";
import { test } from "node:test";

import { readReviewsCore } from "./reviews.core";
import { fakeAdmin, uuid } from "./__fixtures__/fake-admin";

const TENANT = uuid(1);

test("read: published testimonials only, shaped, with an average over the rated ones and a count cap", async () => {
  const { admin } = fakeAdmin({
    tenant_testimonials: [
      { id: uuid(10), tenant_id: TENANT, author_name: "Ana", author_role: "Bride", body: "Perfect.", rating: 5, status: "published", created_at: "2026-09-10T00:00:00Z" },
      { id: uuid(11), tenant_id: TENANT, author_name: "Bob", author_role: null, body: "Good.", rating: 4, status: "published", created_at: "2026-09-11T00:00:00Z" },
      { id: uuid(12), tenant_id: TENANT, author_name: "Cy", author_role: null, body: "Unrated.", rating: null, status: "published", created_at: "2026-09-12T00:00:00Z" },
      { id: uuid(13), tenant_id: TENANT, author_name: "Eve", author_role: null, body: "Hidden.", rating: 1, status: "hidden", created_at: "2026-09-13T00:00:00Z" },
    ],
  });
  const r = await readReviewsCore({ admin }, TENANT, { count: 2, layout: "grid" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.data.reviews.map((x) => x.authorName), ["Cy", "Bob"]);
  assert.deepEqual(r.data.summary, { count: 3, average: 4.5 });
  assert.equal(r.data.layout, "grid");
  assert.deepEqual(Object.keys(r.data.reviews[0]!).sort(), ["authorName", "authorRole", "body", "createdAtIso", "id", "rating"]);
  assert.deepEqual(await readReviewsCore({ admin }, "x", {}), { ok: false, reason: "invalid_request" });
});
