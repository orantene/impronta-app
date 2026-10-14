import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveVisitInquiryId } from "./visit-id";

function fake(tables: Record<string, Record<string, unknown> | null>) {
  return {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: tables[table] ?? null }),
      };
      return q;
    },
  };
}

test("an inquiry id passes through", async () => {
  assert.equal(await resolveVisitInquiryId(fake({ inquiries: { id: "i1" } }), "t", "i1"), "i1");
});

test("a booking id resolves to its source inquiry", async () => {
  assert.equal(
    await resolveVisitInquiryId(fake({ inquiries: null, agency_bookings: { source_inquiry_id: "i9" } }), "t", "b1"),
    "i9",
  );
});

test("an unknown id (or a booking with no inquiry) is returned unchanged, so the loader 404s as before", async () => {
  assert.equal(await resolveVisitInquiryId(fake({ inquiries: null, agency_bookings: null }), "t", "x"), "x");
  assert.equal(await resolveVisitInquiryId(fake({ inquiries: null, agency_bookings: { source_inquiry_id: null } }), "t", "b"), "b");
});
