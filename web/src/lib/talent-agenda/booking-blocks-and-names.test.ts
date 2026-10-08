/**
 * TUL-450: a booking blocks its time and names its guest.
 * Run: node_modules/.bin/tsx --test src/lib/talent-agenda/booking-blocks-and-names.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { weekChipKind } from "@/components/admin/shell/internal/talent/agenda/present";
import { chipTag } from "@/components/admin/shell/internal/talent/agenda/calendar-view";

import { blocksTime } from "./derive";
import { pickBookingClient } from "./load-map";

const booking = (over: Record<string, unknown> = {}) =>
  ({ kind: "booking", booking: "confirmed", blocksTime: true, allDay: false, tradeSection: undefined, managedBy: undefined, holdUntil: undefined, ...over }) as never;

test("a confirmed booking blocks time, draws as a booking (not a request) and reads Confirmed", () => {
  assert.equal(blocksTime(booking()), true);
  assert.equal(weekChipKind(booking()), "booking");
  assert.equal(chipTag(booking()).key, "Confirmed");
});

test("cancelled, expired and requested STATES still do not block", () => {
  for (const state of ["cancelled", "hold_expired", "requested"]) assert.equal(blocksTime(booking({ booking: state })), false, state);
});

test("the old default (blocksTime false) is what drew every booking as a request: pinned out of the loader", () => {
  assert.equal(weekChipKind(booking({ blocksTime: false })), "request", "documents the failure mode");
  const src = readFileSync("src/lib/talent-agenda/load.ts", "utf8");
  const start = src.indexOf('kind: "booking",');
  const block = src.slice(start, src.indexOf("item.blocksTime = blocksTime(item);", start));
  assert.match(block, /blocksTime: true,/);
  assert.doesNotMatch(block, /blocksTime: false,/);
});

test("an instant-booked guest takes the inquiry's name when the booking carries none; blanks are skipped", () => {
  const guest = pickBookingClient({
    agency: { contact_name: null, contact_email: "  ", contact_phone: null },
    clientLabel: "   ",
    inquiry: { contact_name: "Live QA Tester", contact_email: "q@x.test", contact_phone: "+52 55" },
  });
  assert.deepEqual(guest, { name: "Live QA Tester", email: "q@x.test", phone: "+52 55" });
});

test("agency contact wins over the label, the label over the inquiry; nothing at all stays null (UI says Untitled client)", () => {
  assert.equal(pickBookingClient({ agency: { contact_name: "Ana" }, clientLabel: "Label", inquiry: { contact_name: "Inq" } }).name, "Ana");
  assert.equal(pickBookingClient({ agency: null, clientLabel: "Label", inquiry: { contact_name: "Inq" } }).name, "Label");
  assert.equal(pickBookingClient({}).name, null);
});
