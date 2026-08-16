/**
 * Talent payout attention — the payload behind "why did my payout not arrive?".
 *
 * Pins the three things a talent's money view must not get wrong:
 *   • reversed AND failed AND held legs all reach the payload (before this, a
 *     reversed leg reached no talent surface at all);
 *   • totals never mix currencies (a legacy EUR leg is not summed into USD);
 *   • the reversal cause is derived from the operator note WITHOUT leaking the
 *     raw Stripe ids / API errors that note contains.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadTalentPayoutAttention } from "@/lib/payments/talent-payout-attention";
import {
  payoutLegCurrency,
  payoutReversalCause,
  summarizePayoutAttention,
  type TalentPayoutAttentionLeg,
} from "@/lib/payments/talent-payout-attention-types";

type LegRow = Record<string, unknown>;

/** Fake Supabase: booking_payouts rows filtered by the recorded eq/in filters. */
function makeSupabase(legs: LegRow[], bookings: LegRow[]): SupabaseClient {
  const make = (table: string) => {
    const eqs: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];
    const rows = table === "booking_payouts" ? legs : bookings;
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      limit: () => chain,
      eq: (col: string, val: unknown) => {
        eqs.push([col, val]);
        return chain;
      },
      in: (col: string, vals: unknown[]) => {
        ins.push([col, vals]);
        return chain;
      },
    };
    (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => {
      const filtered = rows.filter(
        (r) =>
          eqs.every(([c, v]) => r[c] === v) &&
          ins.every(([c, vals]) => vals.includes(r[c] as never)),
      );
      resolve({ data: filtered, error: null });
    };
    return chain;
  };
  return { from: (table: string) => make(table) } as unknown as SupabaseClient;
}

const leg = (over: Record<string, unknown>): LegRow => ({
  id: "L1",
  booking_id: "bk_1",
  party: "talent",
  talent_profile_id: "tp1",
  amount_cents: 80000,
  currency: "usd",
  status: "held",
  last_error: null,
  created_at: "2026-06-02T06:39:05.000Z",
  updated_at: "2026-06-02T06:39:05.000Z",
  ...over,
});

test("reversed, failed and held legs all reach the talent payload", async () => {
  const sb = makeSupabase(
    [
      leg({ id: "L1", status: "held" }),
      leg({ id: "L2", status: "failed", last_error: "insufficient available funds" }),
      leg({ id: "L3", status: "reversed", last_error: "refund ch_123 trr_9" }),
      leg({ id: "L4", status: "transferred" }),
      leg({ id: "L5", status: "reversed", talent_profile_id: "tp_other" }),
      leg({ id: "L6", status: "held", party: "workspace", talent_profile_id: null }),
    ],
    [{ id: "bk_1", title: "Editorial shoot", event_date: "2026-07-15" }],
  );

  const out = await loadTalentPayoutAttention("tp1", sb);
  assert.deepEqual(
    out.legs.map((l) => l.id).sort(),
    ["L1", "L2", "L3"],
    "only this talent's non-transferred legs",
  );
  const reversed = out.legs.find((l) => l.id === "L3")!;
  assert.equal(reversed.cause, "refund");
  assert.equal(reversed.bookingTitle, "Editorial shoot");
  assert.equal(reversed.eventDate, "2026-07-15");
  assert.equal(reversed.currency, "USD");
});

test("totals group by state AND currency — a EUR leg is never summed into USD", async () => {
  const sb = makeSupabase(
    [
      leg({ id: "L1", status: "reversed", currency: "usd", amount_cents: 80000 }),
      leg({ id: "L2", status: "reversed", currency: "eur", amount_cents: 50000 }),
      leg({ id: "L3", status: "held", currency: "usd", amount_cents: 1700 }),
    ],
    [],
  );

  const out = await loadTalentPayoutAttention("tp1", sb);
  const reversed = out.totals.filter((t) => t.state === "reversed");
  assert.equal(reversed.length, 2, "one total per currency");
  assert.equal(reversed.find((t) => t.currency === "USD")?.amountCents, 80000);
  assert.equal(reversed.find((t) => t.currency === "EUR")?.amountCents, 50000);
  assert.deepEqual(
    out.totals.filter((t) => t.state === "held"),
    [{ state: "held", currency: "USD", amountCents: 1700, count: 1 }],
  );
});

test("an empty / failed read degrades to an empty payload, never a throw", async () => {
  const out = await loadTalentPayoutAttention("", null);
  assert.deepEqual(out, { legs: [], totals: [] });
});

test("reversal cause is derived from the note, and the raw note is never returned", async () => {
  assert.equal(payoutReversalCause("refund ch_1 trr_2"), "refund");
  assert.equal(payoutReversalCause("partial_refund re_1"), "refund");
  assert.equal(payoutReversalCause("dispute_lost dp_1 trr_3"), "dispute");
  assert.equal(payoutReversalCause("refund ch_1 (cancelled before transfer)"), "cancelled_before_transfer");
  assert.equal(payoutReversalCause(null), "unknown");
  assert.equal(payoutReversalCause("something else"), "unknown");

  const sb = makeSupabase([leg({ status: "reversed", last_error: "dispute_lost dp_1 trr_3" })], []);
  const out = await loadTalentPayoutAttention("tp1", sb);
  const serialized = JSON.stringify(out);
  assert.equal(out.legs[0].cause, "dispute");
  assert.ok(!serialized.includes("dp_1"), "no Stripe ids in the talent payload");
  assert.ok(!serialized.includes("trr_3"), "no Stripe ids in the talent payload");
});

test("currency falls back to USD, never to a configured default", () => {
  assert.equal(payoutLegCurrency("usd"), "USD");
  assert.equal(payoutLegCurrency(""), "USD");
  assert.equal(payoutLegCurrency(null), "USD");
  assert.equal(payoutLegCurrency("mxn"), "MXN");
});

test("summarize orders reversed first, then failed, then held", () => {
  const mk = (state: TalentPayoutAttentionLeg["state"]): TalentPayoutAttentionLeg => ({
    id: state,
    bookingId: "bk",
    state,
    amountCents: 100,
    currency: "USD",
    bookingTitle: null,
    eventDate: null,
    atIso: "2026-06-02T00:00:00.000Z",
    cause: "unknown",
  });
  assert.deepEqual(
    summarizePayoutAttention([mk("held"), mk("failed"), mk("reversed")]).map((t) => t.state),
    ["reversed", "failed", "held"],
  );
});
