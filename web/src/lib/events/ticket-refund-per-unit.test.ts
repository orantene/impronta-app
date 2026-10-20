import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import { intentRefundScope } from "@/lib/events/ticket-refund-intent-scope";

/**
 * MONEY BUG 2 (TUL-1429 / TUL-1431 / TUL-1435): what an intent may refund, the
 * cron's wiring of it, and the admission_exchange function's shape.
 */

test("guest request: ONE ticket, never the line", () => {
  assert.deepEqual(
    intentRefundScope({ reason: "guest_request", source: "guest_request", requested_by_admission_id: "adm-2" }),
    { kind: "unit", admissionIds: ["adm-2"] },
  );
});

test("guest request with no admission is HELD, not widened to the line", () => {
  assert.equal(intentRefundScope({ reason: "guest_request", requested_by_admission_id: null }).kind, "hold");
});

test("exchange: only the stated difference, no ticket voided", () => {
  assert.deepEqual(
    intentRefundScope({ reason: "admission_exchange", requested_by_admission_id: "adm-1", refund_cents: "500" }),
    { kind: "amount", amountCents: 500, admissionIds: [] },
  );
});

test("exchange without an amount (old function, column not applied) is HELD, never a whole-line refund", () => {
  assert.equal(intentRefundScope({ reason: "admission_exchange" }).kind, "hold");
  assert.equal(intentRefundScope({ reason: "admission_exchange", refund_cents: 0 }).kind, "hold");
});

test("cancelled event and lost seat stay whole-line", () => {
  assert.deepEqual(intentRefundScope({ reason: "event_cancelled" }), { kind: "line" });
  assert.deepEqual(intentRefundScope({ reason: "seat_lost_after_payment" }), { kind: "line" });
});

const ROUTE = blankComments(
  readFileSync(join(process.cwd(), "src/app/api/cron/ticket-refund-intents/route.ts"), "utf8"),
);

test("cron passes the scope to refundOrderLines (admissionIds / amountCents) and holds unknown scopes", () => {
  assert.match(ROUTE, /intentRefundScope\(/);
  assert.match(ROUTE, /admissionIds: scope\.admissionIds/);
  assert.match(ROUTE, /amountCents: scope\.amountCents/);
  assert.match(ROUTE, /scope\.kind === "hold"/);
  // The buyer message states what moved, not the line total.
  assert.match(ROUTE, /const cents = res\.refundedCents/);
  assert.doesNotMatch(ROUTE, /total_cents\?: unknown/);
});

test("cron selects * so it works before the refund_cents column exists (code-first)", () => {
  assert.match(ROUTE, /\.select\("\*"\)/);
});

const SQL = blankComments(
  readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "_pending_pm", "20261231421400_admission_exchange_per_unit_atomic.sql"),
    "utf8",
  ).replace(/--[^\n]*/g, ""),
);

test("exchange SQL: old price is PER TICKET, not the line total", () => {
  assert.match(SQL, /v_line\.total_cents \/ GREATEST\(1, COALESCE\(v_line\.units, 1\)\)/);
  assert.doesNotMatch(SQL, /SELECT total_cents INTO v_old_cents/);
});

test("exchange SQL: the dearer path returns BEFORE the admission is touched", () => {
  const priceUp = SQL.indexOf("price_up_needs_payment");
  const firstUpdate = SQL.indexOf("UPDATE public.admissions");
  assert.ok(priceUp > -1 && firstUpdate > -1);
  assert.ok(priceUp < firstUpdate, "no move before payment is owed");
  assert.doesNotMatch(SQL, /'Exchange balance'/, "no unpaid balance line is left on a paid order");
});

test("exchange SQL: capacity is reserved before the move and the old seat released after", () => {
  const reserve = SQL.indexOf("reserve_resource_set_v2");
  const update = SQL.indexOf("UPDATE public.admissions");
  const release = SQL.indexOf("release_capacity");
  assert.ok(reserve > -1 && reserve < update, "reserve the target seat before moving");
  assert.ok(release > update, "release the old seat only after the move");
  assert.match(SQL, /allocation_id = COALESCE\(v_alloc, allocation_id\)/);
  assert.match(SQL, /token_version = token_version \+ 1/);
});

test("exchange SQL: the intent names the admission and the difference", () => {
  assert.match(SQL, /requested_by_admission_id, refund_cents/);
  assert.match(SQL, /'admission_exchange', v_adm\.id, -v_delta/);
});

test("exchange SQL: the ORDER LINE is locked FOR UPDATE, after the admission and before any write", () => {
  // Two exchanges on one line, or a guest request racing an exchange, used to
  // see no intent, both move, and the second refund vanished in ON CONFLICT DO
  // NOTHING after its ticket had already moved. FOR UPDATE (not NO KEY UPDATE)
  // also blocks the guest request's FK key-share on the same line until commit.
  const admLock = SQL.search(/FROM public\.admissions WHERE id = p_admission_id FOR UPDATE/);
  const lineLock = SQL.search(/FROM public\.order_lines ol WHERE ol\.id = v_adm\.order_line_id\s+FOR UPDATE/);
  const pendingCheck = SQL.indexOf("'refund_pending'");
  const reserve = SQL.indexOf("reserve_resource_set_v2");
  const move = SQL.indexOf("UPDATE public.admissions");
  assert.ok(admLock > -1, "admission row lock");
  assert.ok(lineLock > -1, "order line row lock");
  assert.ok(admLock < lineLock, "lock order admission -> line, the order every other writer uses");
  assert.ok(lineLock < pendingCheck && lineLock < reserve && lineLock < move, "the line is held for the whole operation");
});

test("exchange SQL: an intent insert that returns no row FAILS the exchange and undoes the move", () => {
  assert.match(SQL, /ON CONFLICT \(order_line_id\) DO NOTHING\s+RETURNING id INTO v_intent/);
  assert.match(SQL, /IF v_intent IS NULL THEN\s+RAISE EXCEPTION 'refund_pending'/);
  // The raise lands in the block's handler, which rolls the reserve, commit,
  // move and release back to the block's savepoint and answers refund_pending.
  assert.match(SQL, /EXCEPTION\s+WHEN raise_exception THEN[\s\S]{0,200}'reason', 'refund_pending'/);
  assert.doesNotMatch(SQL, /ON CONFLICT \(order_line_id\) DO NOTHING;/, "a silent DO NOTHING is the lost refund");
});

test("exchange SQL: target must be the SAME offering, in the order's currency, on the line's own tier", () => {
  assert.match(SQL, /'reason', 'different_offering'/);
  assert.match(SQL, /'reason', 'currency_mismatch'/);
  assert.match(SQL, /'reason', 'tier_mismatch'/);
  // The tier is the line's variant, checked against the target's offering;
  // never "the first variant by sort_order".
  assert.match(SQL, /WHERE tov\.id = v_line\.variant_id AND tov\.offering_id = v_to\.offering_id/);
  assert.doesNotMatch(SQL, /ORDER BY tov\.sort_order/);
  // And the seat comes from that tier's pool on the target night.
  assert.match(SQL, /cp\.pool_key = v_pool_key/);
  // All three refusals come before anything moves.
  const move = SQL.indexOf("UPDATE public.admissions");
  for (const word of ["'different_offering'", "'currency_mismatch'", "'tier_mismatch'"]) {
    assert.ok(SQL.indexOf(word) < move, `${word} refuses before the move`);
  }
});

test("exchange SQL: contract kept (same signature, service_role only, additive column)", () => {
  assert.match(SQL, /admission_exchange\(\s*p_tenant_id uuid,\s*p_admission_id uuid,\s*p_to_session_id uuid,\s*p_operation_key text,\s*p_expected_version integer\s*\)/);
  assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.admission_exchange\(uuid, uuid, uuid, text, integer\) TO service_role/);
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS refund_cents bigint/);
});
