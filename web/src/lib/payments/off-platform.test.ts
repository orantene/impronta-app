/**
 * off-platform.test.ts — the invariant is a PAIR, and half of it lives in SQL.
 *
 * accrued as a receivable  ⟺  no payout leg
 *
 * The left half is the snapshot-persist RPC's `IN (...)` list; the right half is
 * OFF_PLATFORM_PAYMENT_METHODS in TypeScript. If they ever disagree, the failure
 * is silent and expensive in one direction: a method that accrues a fee but
 * still pays a leg wires real money for a charge that was never collected, AND
 * bills the tenant the fee. So the list is pinned against the migration text
 * rather than restated by hand.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  OFF_PLATFORM_PAYMENT_METHODS,
  isOffPlatformPaymentMethod,
  resolvePaymentSettings,
  acceptsCardPayment,
  DEFAULT_PAYMENT_SETTINGS,
} from "./off-platform";

/**
 * The RPC that decides whether a booking accrues a platform receivable.
 * Read from disk: a copy pasted into the test would drift with the thing it
 * is meant to pin.
 */
const RPC_SQL = readFileSync(
  path.join(
    process.cwd(),
    "../supabase/migrations/20260708161912_fix_snapshot_persist_rpc_extended_lanes.sql",
  ),
  "utf8",
);

test("THE LIST MATCHES THE RPC THAT ACCRUES THE RECEIVABLE", () => {
  // The guard clause, verbatim from the migration:
  //   IF (v_row->>'payment_method') IN ('cash','wire','venue_paid','crypto','other')
  const match = RPC_SQL.match(/payment_method'\)\s*IN\s*\(([^)]*)\)/);
  assert.ok(match, "could not find the payment_method IN (...) guard in the RPC");
  const fromSql = match[1]!
    .split(",")
    .map((s) => s.trim().replace(/^'|'$/g, ""))
    .sort();

  assert.deepEqual(
    [...OFF_PLATFORM_PAYMENT_METHODS].sort(),
    fromSql,
    "the payout gate and the accrual RPC disagree — a method would be billed AND paid out",
  );
});

test("bank_transfer is NOT off-platform, because the RPC does not accrue it", () => {
  // It is in the PaymentMethod union and reads like off-platform money, which
  // is exactly why it is worth a test: the platform collects it, so it must
  // keep its payout leg. Adding it here without adding it to the RPC would
  // strand every bank-transfer talent unpaid.
  assert.equal(isOffPlatformPaymentMethod("bank_transfer"), false);
  assert.equal(isOffPlatformPaymentMethod("card"), false);
  assert.equal(isOffPlatformPaymentMethod("apple_pay"), false);
});

test("cash, wire, venue_paid, crypto and other suppress a payout", () => {
  for (const m of ["cash", "wire", "venue_paid", "crypto", "other"]) {
    assert.equal(isOffPlatformPaymentMethod(m), true, `${m} must suppress its payout leg`);
  }
});

test("AN UNKNOWN METHOD PAYS OUT — the failure directions are not symmetric", () => {
  // Wrongly skipping a payout: a talent is not paid, and someone complains.
  // Wrongly paying one: the platform sends money it never collected, silently.
  // So only a RECOGNISED method suppresses.
  for (const junk of [null, undefined, "", "CASH", "Cash", 0, {}, ["cash"]]) {
    assert.equal(isOffPlatformPaymentMethod(junk), false, `${JSON.stringify(junk)} must not suppress`);
  }
});

test("a workspace takes cards unless it says otherwise", () => {
  assert.deepEqual(resolvePaymentSettings(undefined), DEFAULT_PAYMENT_SETTINGS);
  assert.deepEqual(resolvePaymentSettings({}), DEFAULT_PAYMENT_SETTINGS);
  assert.deepEqual(resolvePaymentSettings({ payments: {} }), DEFAULT_PAYMENT_SETTINGS);
  assert.equal(acceptsCardPayment(undefined), true);
});

test("A MALFORMED SETTINGS BLOB MUST NOT TURN CARDS OFF", () => {
  // The dangerous direction: a tenant that sells on cards silently losing the
  // card field because its settings JSON was garbage.
  for (const junk of [null, "off_platform", 42, { payments: "off_platform" }, { payments: null }]) {
    assert.equal(acceptsCardPayment(junk), true, `${JSON.stringify(junk)} must stay on cards`);
  }
});

test("the switch resolves, and an unknown method falls back to cash", () => {
  assert.deepEqual(resolvePaymentSettings({ payments: { mode: "off_platform", method: "wire" } }), {
    mode: "off_platform",
    method: "wire",
  });
  assert.equal(acceptsCardPayment({ payments: { mode: "off_platform", method: "wire" } }), false);
  // A method the RPC would not accrue must not be stored as one, or the fee
  // would go uncollected.
  assert.deepEqual(
    resolvePaymentSettings({ payments: { mode: "off_platform", method: "bank_transfer" } }),
    { mode: "off_platform", method: "cash" },
  );
});

test("THE PAYOUT GATE IS WIRED — transfers.ts skips off-platform legs", () => {
  // A predicate nobody calls is the failure this whole module exists to stop.
  // Comments stripped first: an explanatory mention is not a call site.
  const src = readFileSync(path.join(process.cwd(), "src/lib/payments/transfers.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.match(src, /isOffPlatformPaymentMethod\(\s*snap\.payment_method\s*\)/);
  assert.match(src, /transfers\.off_platform_no_payout/);
});
