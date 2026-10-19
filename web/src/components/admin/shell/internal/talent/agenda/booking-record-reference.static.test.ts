import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { catalogBookingRef } from "../../../../../public-booking/catalog-booking-confirm";

// TUL-434 (Batch 6): the guest's confirmation said TUL-3F0F30B8 and the owner's
// booking record said "#5F36D71F". Same booking, two shapes (and a different
// id when the record was opened from a row whose id is not the booking's). The
// owner header now prints the client's reference from the booking id.

test("the owner reference has the same shape as the one the client holds", () => {
  assert.equal(catalogBookingRef("3f0f30b8-1111-2222-3333-444444444444"), "TUL-3F0F30B8");
});

test("the booking record header prints the shared reference from the booking id", () => {
  const src = readFileSync(join(process.cwd(), "src", "components", "admin", "shell", "internal", "talent", "agenda", "AgendaBookingRecord.tsx"), "utf8");
  assert.match(src, /catalogBookingRef\(bookingId \?\? item\.id\)/);
  assert.doesNotMatch(src, /`#\$\{item\.id\.slice\(0, 8\)/, "bare # + row id reference is back");
});
