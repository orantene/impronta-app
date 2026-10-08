import test from "node:test";
import assert from "node:assert/strict";
import {
  DOOR_SECTIONS,
  formatDoorLocalTime,
  isDoorPreview,
  matchOrderFromQuery,
  nextOpenOrderId,
  primaryActionForStatus,
  shortOrderCode,
} from "./orders-door-mock";

test("door mock is gated behind ?door=preview only", () => {
  assert.equal(isDoorPreview("preview"), true);
  assert.equal(isDoorPreview("Preview"), true);
  assert.equal(isDoorPreview("preview "), true);
  assert.equal(isDoorPreview(""), false);
  assert.equal(isDoorPreview(null), false);
  assert.equal(isDoorPreview("live"), false);
  assert.equal(isDoorPreview("1"), false);
});

const ROWS = [
  { id: "c365920b-1111-2222-3333-444455556666" },
  { id: "a1b2c3d4-aaaa-bbbb-cccc-ddddeeeeffff" },
  { id: "c365920b-9999-8888-7777-666655554444" },
] as const;

test("shortOrderCode is the first 8 chars, uppercased", () => {
  assert.equal(shortOrderCode("c365920b-1111-2222-3333-444455556666"), "C365920B");
});

test("deep link matches a unique short code or uuid prefix", () => {
  assert.equal(
    matchOrderFromQuery(ROWS.slice(0, 2), "C365920B"),
    "c365920b-1111-2222-3333-444455556666",
  );
  assert.equal(
    matchOrderFromQuery(ROWS.slice(0, 2), "a1b2c3d4-aaaa-bbbb-cccc-ddddeeeeffff"),
    "a1b2c3d4-aaaa-bbbb-cccc-ddddeeeeffff",
  );
  assert.equal(matchOrderFromQuery(ROWS.slice(0, 2), "a1b2"), "a1b2c3d4-aaaa-bbbb-cccc-ddddeeeeffff");
});

test("an ambiguous short code does not open a row", () => {
  // Two rows share the C365920B prefix when sliced to 8.
  assert.equal(matchOrderFromQuery(ROWS, "C365920B"), null);
});

test("empty or blank order param opens nothing", () => {
  assert.equal(matchOrderFromQuery(ROWS, null), null);
  assert.equal(matchOrderFromQuery(ROWS, "   "), null);
});

test("row toggle opens one at a time and closes on re-click", () => {
  assert.equal(nextOpenOrderId(null, "o1"), "o1");
  assert.equal(nextOpenOrderId("o1", "o1"), null);
  assert.equal(nextOpenOrderId("o1", "o2"), "o2");
});

test("primary action follows status and POS channel", () => {
  assert.equal(primaryActionForStatus("pending_payment", "messages"), "send_pay_link");
  assert.equal(primaryActionForStatus("pending_payment", "pos"), "collect_pos");
  assert.equal(primaryActionForStatus("paid", "menu"), "send_receipt");
  assert.equal(primaryActionForStatus("fulfilled", "menu"), "send_receipt");
  assert.equal(primaryActionForStatus("refunded", "pos"), "view_refund");
  assert.equal(primaryActionForStatus("cancelled", "menu"), "view_refund");
  assert.equal(primaryActionForStatus("draft", "menu"), "none");
});

test("Resumen and Artículos default open; the other seven start closed", () => {
  assert.equal(DOOR_SECTIONS.length, 9);
  const open = DOOR_SECTIONS.filter((s) => s.defaultOpen).map((s) => s.id);
  assert.deepEqual(open, ["summary", "items"]);
});

test("local time formatting is stable for a known UTC instant", () => {
  const out = formatDoorLocalTime("2027-03-15T18:30:00.000Z", "en", "UTC");
  assert.match(out, /2026/);
  assert.match(out, /6:30|18:30/);
});
