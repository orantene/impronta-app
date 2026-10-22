import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { legLastError, type TransferDeps, type TransferOutcome } from "./transfers";
import { retryFeeUnknownPayouts } from "./retry-fee-unknown-payouts";

function fakeSb(rows: Array<{ transaction_id: string | null }>, filters: string[]) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "like", "or", "order", "not", "limit"]) {
    q[m] = (...args: unknown[]) => {
      filters.push(`${m}:${args.map(String).join(",")}`);
      return m === "limit" ? Promise.resolve({ data: rows, error: null }) : q;
    };
  }
  return { from: (t: string) => (filters.push(`from:${t}`), q) } as unknown as SupabaseClient;
}

const out = (status: TransferOutcome["status"]): TransferOutcome =>
  ({ party: "talent", participantId: "p", amountCents: 1, currency: "usd", rail: "connect_transfer", status }) as TransferOutcome;

test("retries each fee-unknown transaction once, in skipTransferredLegs mode", async () => {
  const filters: string[] = [];
  const calls: Array<[string, TransferDeps]> = [];
  const sb = fakeSb([{ transaction_id: "t1" }, { transaction_id: "t1" }, { transaction_id: "t2" }, { transaction_id: null }], filters);
  const res = await retryFeeUnknownPayouts(sb, {
    execute: async (id, deps) => {
      calls.push([id, deps]);
      return id === "t1" ? [out("transferred"), out("transferred")] : [out("skipped_fee_unknown")];
    },
  });
  assert.deepEqual(calls.map((c) => c[0]), ["t1", "t2"]);
  assert.ok(calls.every((c) => c[1].skipTransferredLegs === true && c[1].sb === sb));
  assert.deepEqual(res, { transactions: 2, paid: 2, stillHeld: 1, failed: 0 });
  // Only zero-amount held legs whose reason is the fee hold or a refund in flight (TUL-1746), never cross-platform.
  assert.ok(filters.includes("eq:status,held"));
  assert.ok(filters.includes("eq:amount_cents,0"));
  assert.ok(
    filters.includes('or:last_error.like."processing fee%",last_error.like."refund pending%",last_error.like."ledger unreadable%"'),
    "fee-unknown, refund-pending and ledger-unreadable holds are all retried",
  );
  // TUL-1746: oldest touch first, so the 200-row cap cannot starve the same rows forever.
  const orderAt = filters.findIndex((f) => f.startsWith("order:updated_at"));
  assert.ok(orderAt >= 0 && filters[orderAt] === "order:updated_at,[object Object]", "ordered by updated_at");
  assert.ok(orderAt < filters.indexOf("limit:200"), "ordered before the cap");
});

test("legLastError records why a cross-platform leg is held; failures keep their detail", () => {
  assert.match(legLastError({ status: "skipped_cross_platform", detail: "recipient_on_mx" }) ?? "", /^cross-platform hold: recipient_on_mx/);
  assert.equal(legLastError({ status: "failed", detail: "boom" }), "boom");
  assert.equal(legLastError({ status: "transferred" }), null);
  assert.equal(legLastError({ status: "skipped_no_account" }), null);
});
