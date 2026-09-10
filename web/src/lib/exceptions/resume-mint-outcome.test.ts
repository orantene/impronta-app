/**
 * The one line the row is about, and what a mint pass means for it.
 *
 * PROVEN AGAINST THE LIVE QA HOST FIRST. Pressing "Issue the missing tickets"
 * on a shortfall whose seat had been lost after payment answered "Already
 * handled - nothing to do." while the row stayed critical, no admission was
 * written, and a `ticket_refund_intents` row appeared in the same inbox that
 * nobody was told about. These are the four shapes that decision has to keep
 * apart.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { mintOutcomeForLine } from "./resume";

const LINE = "line-a";
const SIBLING = "line-b";

test("a fresh mint is done", () => {
  const out = mintOutcomeForLine(LINE, { rowsInserted: 2, skipped: [] });
  assert.deepEqual(out, { ok: true, outcome: "done" });
});

test("nothing inserted and nothing refused is genuinely already handled", () => {
  const out = mintOutcomeForLine(LINE, { rowsInserted: 0, skipped: [] });
  assert.deepEqual(out, { ok: true, outcome: "already" });
});

test("a seat lost after payment is NOT already handled", () => {
  const out = mintOutcomeForLine(LINE, {
    rowsInserted: 0,
    skipped: [{ lineId: LINE, reason: "seat_lost_after_payment" }],
  });
  assert.equal(out.ok, false);
  assert.equal(out.ok === false && out.reason, "seat_lost");
  // The answer has to reach a Spanish or French operator too, so it travels
  // as a key rather than as the English the server would otherwise compose.
  assert.equal(out.ok === false && out.messageKey, "seatLostAfterPayment");
});

test("a sibling line's lost seat does not steal this row's answer", () => {
  // The mint re-drives the whole ORDER, so a pass can insert for one line and
  // refuse another. Reading the total alone is what made these the same.
  const out = mintOutcomeForLine(LINE, {
    rowsInserted: 1,
    skipped: [{ lineId: SIBLING, reason: "seat_lost_after_payment" }],
  });
  assert.deepEqual(out, { ok: true, outcome: "done" });
});

test("a lost seat still refuses even when a sibling minted in the same pass", () => {
  const out = mintOutcomeForLine(LINE, {
    rowsInserted: 3,
    skipped: [{ lineId: LINE, reason: "seat_lost_after_payment" }],
  });
  assert.equal(out.ok, false);
});

test("another skip reason is not a lost seat", () => {
  // `planAdmissions` refuses malformed lines for reasons of its own. Those are
  // not "the seat is gone" and must not borrow its sentence.
  const out = mintOutcomeForLine(LINE, {
    rowsInserted: 0,
    skipped: [{ lineId: LINE, reason: "units_not_a_whole_number" }],
  });
  assert.deepEqual(out, { ok: true, outcome: "already" });
});
