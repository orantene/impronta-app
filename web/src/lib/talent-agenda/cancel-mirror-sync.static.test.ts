import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// cancel_booking_set syncs talent_bookings only by source_inquiry_id. An
// agenda-made booking has no inquiry, so the talent action must cancel the
// shared-id mirror itself or the public slot stays blocked (QA on Jor, 2026-10-01).
test("cancelBookingWithRefund cancels the talent_bookings mirror by shared id", () => {
  const src = readFileSync(new URL("./cancel-actions.ts", import.meta.url), "utf8");
  const syncAt = src.indexOf('.from("talent_bookings")');
  assert.ok(syncAt > 0, "cancel must touch the talent_bookings mirror");
  const tail = src.slice(syncAt, syncAt + 400);
  assert.match(tail, /status: "cancelled"/);
  assert.match(tail, /\.eq\("id", mirror\.id\)/);
  assert.match(tail, /\.eq\("talent_profile_id", mirror\.talent_profile_id\)/);
  assert.ok(src.indexOf("talentBookingMirrorEq(input.bookingId, own.talentId)") > 0);
  // It must run after the RPC succeeded, never before.
  assert.ok(src.indexOf("cancelBookingSet(admin") < syncAt);
});
