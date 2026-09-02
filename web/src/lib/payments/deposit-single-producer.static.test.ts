/**
 * ONE producer for booking deposits.
 *
 * There used to be two. The sanctioned path is a `booking_transactions` row
 * with `checkout_type='deposit'` (migration 20260614022616): it produces a
 * transaction, a commission snapshot and a payout leg, so the money is visible
 * to the whole spine.
 *
 * The second path was `lib/server-actions/bank-link.ts` →
 * `createDepositPaymentIntent`, which minted a PaymentIntent tagged
 * `metadata.purpose = 'booking_deposit'`. Its webhook consumer
 * (`markBookingDepositPaid`) writes `agency_bookings.deposit_*` DIRECTLY —
 * no transaction row, no snapshot, no transfer. Money taken that way is
 * invisible to every report and never reaches the talent. No UI ever called
 * it, but the file was `"use server"`, so all three of its exports were live
 * RPC endpoints reachable by any workspace staff member. It was deleted in
 * the 0.8a pass (0 production rows had ever used it — every
 * `agency_bookings.deposit_payment_intent_id` was null).
 *
 * The webhook CONSUMER is deliberately left in place: a PaymentIntent created
 * out-of-band in the Stripe dashboard should still be recorded rather than
 * silently dropped. Retiring the consumer and the four `deposit_*` columns is
 * a separate, Finance-owned decision (expand, then contract).
 *
 * This guard catches a re-introduced producer. It is a source scan, so a
 * dynamically-built metadata object would evade it; it is a tripwire, not a
 * proof.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

test("nothing in src/ creates a PaymentIntent tagged purpose=booking_deposit", () => {
  const offenders = walk(SRC).filter((f) => {
    const body = readFileSync(f, "utf8");
    return body.includes('purpose: "booking_deposit"') || body.includes("purpose: 'booking_deposit'");
  });

  assert.deepEqual(
    offenders.map((f) => path.relative(SRC, f)),
    [],
    "A second deposit producer is back. Deposits must go through booking_transactions " +
      "(checkout_type='deposit') so they get a commission snapshot and a payout leg.",
  );
});

test("the retired bank-link server actions are gone", () => {
  const files = walk(SRC).map((f) => path.relative(SRC, f));
  assert.equal(files.includes("lib/server-actions/bank-link.ts"), false);
});
