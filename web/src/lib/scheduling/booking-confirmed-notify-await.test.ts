/** TUL-93: the free-path confirmation is awaited and never rejects. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { notifyBookingConfirmed } from "@/lib/notifications/producers/booking-confirmed-notify";

test("notifyBookingConfirmed returns a promise that resolves, never rejects", async () => {
  const p = notifyBookingConfirmed({ tenantId: "t", inquiryId: "i", bookingId: "b" });
  assert.ok(p instanceof Promise);
  assert.equal(await p, undefined);
});

test("instant-book-action awaits the dispatch and logs a booking with no inquiry", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/instant-book-action.ts"), "utf8");
  assert.match(src, /await notifyBookingConfirmed\(\{/);
  assert.match(src, /booking.confirmed not dispatched/);
});
