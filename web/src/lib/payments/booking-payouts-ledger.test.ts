/**
 * releaseHeldPayouts — held-funds release (the P0 fix).
 *
 * Pins: a held leg → 'transferred' once the payee's account is enabled (with a
 * real Stripe transfer, reusing the original idempotency key); stays held when
 * the account still isn't enabled; idempotent — a leg already transferred is
 * never re-paid (and a re-run reuses the key so Stripe replays, no double-pay).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  releaseHeldPayouts,
  payoutIdempotencyKey,
  syncBookingPayoutLifecycle,
  reverseBookingPayouts,
  computeTalentProtectiveClawback,
  reversalLegKey,
  partialReversalIdempotencyKey,
} from "@/lib/payments/booking-payouts-ledger";

type Row = {
  id: string;
  booking_id: string;
  participant_id: string;
  party: "talent" | "workspace";
  talent_profile_id: string | null;
  tenant_id: string | null;
  amount_cents: number;
  currency: string;
  attempts: number;
  status: string;
  payout_rail?: string | null;
};

type Update = { id: string; patch: Record<string, unknown> };

/** Fake Supabase over an in-memory set of held rows; records updates. */
function makeSupabase(rows: Row[], updates: Update[]): SupabaseClient {
  const make = () => {
    const filters: Array<[string, unknown]> = [];
    let pendingPatch: Record<string, unknown> | null = null;
    const chain: Record<string, unknown> = {
      select: () => chain,
      in: () => chain,
      eq: (col: string, val: unknown) => {
        if (pendingPatch) {
          // terminal .update(...).eq('id', X)
          const target = rows.find((r) => r.id === val);
          if (target) {
            Object.assign(target, pendingPatch);
            updates.push({ id: String(val), patch: pendingPatch });
          }
          pendingPatch = null;
          return Promise.resolve({ data: null, error: null });
        }
        filters.push([col, val]);
        return chain;
      },
      update: (patch: Record<string, unknown>) => {
        pendingPatch = patch;
        return chain;
      },
      then: undefined,
    };
    // make the select chain awaitable → filtered held rows
    (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => {
      const filtered = rows.filter(
        (r) =>
          (r.status === "held" || r.status === "failed") &&
          filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v),
      );
      resolve({ data: filtered, error: null });
    };
    return chain;
  };
  return { from: () => make() } as unknown as SupabaseClient;
}

function makeStripe() {
  const calls: Array<{ params: Record<string, unknown>; key?: string }> = [];
  const seen = new Map<string, { id: string }>();
  const stripe = {
    transfers: {
      create: async (params: Record<string, unknown>, opts?: { idempotencyKey?: string }) => {
        const key = opts?.idempotencyKey;
        if (key && seen.has(key)) return seen.get(key);
        const t = { id: `tr_${calls.length + 1}` };
        calls.push({ params, key });
        if (key) seen.set(key, t);
        return t;
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { calls, stripe };
}

const heldRow = (over: Partial<Row> & Pick<Row, "id" | "party">): Row => ({
  booking_id: "bk_1",
  participant_id: "p1",
  talent_profile_id: over.party === "talent" ? "tp1" : null,
  tenant_id: over.party === "workspace" ? "tn1" : null,
  amount_cents: 100000,
  currency: "mxn",
  attempts: 1,
  status: "held",
  ...over,
});

test("released: held talent leg → transferred once the account is enabled", async () => {
  const rows = [heldRow({ id: "L1", party: "talent" })];
  const updates: Update[] = [];
  const { calls, stripe } = makeStripe();

  const out = await releaseHeldPayouts(
    { talentProfileId: "tp1" },
    { sb: makeSupabase(rows, updates), stripe, resolveTalentAccount: async () => "acct_talent_tp1" },
  );

  assert.equal(out.length, 1);
  assert.equal(out[0].result, "released");
  assert.equal(calls.length, 1, "one real transfer");
  assert.equal(calls[0].key, payoutIdempotencyKey("bk_1", "p1", "talent"), "reuses original key");
  assert.equal(calls[0].params.destination, "acct_talent_tp1");
  const patch = updates.find((u) => u.id === "L1")?.patch;
  assert.equal(patch?.status, "transferred");
  assert.equal(patch?.stripe_transfer_id, "tr_1");
});

test("still_held: stays held when the account is NOT yet enabled (no transfer)", async () => {
  const rows = [heldRow({ id: "L1", party: "talent" })];
  const updates: Update[] = [];
  const { calls, stripe } = makeStripe();

  const out = await releaseHeldPayouts(
    { talentProfileId: "tp1" },
    { sb: makeSupabase(rows, updates), stripe, resolveTalentAccount: async () => null },
  );

  assert.equal(out[0].result, "still_held");
  assert.equal(calls.length, 0, "no transfer attempted");
  assert.equal(rows[0].status, "held", "still held");
  assert.equal(updates.find((u) => u.id === "L1")?.patch.attempts, 2, "attempts bumped");
});

test("workspace held leg releases on its own tenant account", async () => {
  const rows = [heldRow({ id: "L2", party: "workspace", participant_id: "p9", amount_cents: 25000 })];
  const updates: Update[] = [];
  const { calls, stripe } = makeStripe();

  const out = await releaseHeldPayouts(
    { tenantId: "tn1" },
    { sb: makeSupabase(rows, updates), stripe, resolveWorkspaceAccount: async () => "acct_tn1" },
  );

  assert.equal(out[0].result, "released");
  assert.equal(calls[0].key, payoutIdempotencyKey("bk_1", "p9", "workspace"));
  assert.equal(calls[0].params.destination, "acct_tn1");
});

test("still_held: a global_payouts leg is NOT released via the Connect rail (no transfer)", async () => {
  // The double-pay guard: releaseHeldPayouts only does Connect transfers. A GP leg
  // released here would pay twice (Connect now + the GP outbound-payment retry).
  const rows = [heldRow({ id: "L1", party: "talent", payout_rail: "global_payouts" })];
  const updates: Update[] = [];
  const { calls, stripe } = makeStripe();

  const out = await releaseHeldPayouts(
    { talentProfileId: "tp1" },
    { sb: makeSupabase(rows, updates), stripe, resolveTalentAccount: async () => "acct_talent_tp1" },
  );

  assert.equal(out[0].result, "still_held");
  assert.match(String(out[0].detail ?? ""), /global_payouts/);
  assert.equal(calls.length, 0, "GP leg must NOT be released via a Connect transfer");
  assert.equal(rows[0].status, "held", "stays held for the GP release path");
});

test("released: an explicit connect_transfer leg still releases via Connect", async () => {
  const rows = [heldRow({ id: "L1", party: "talent", payout_rail: "connect_transfer" })];
  const updates: Update[] = [];
  const { calls, stripe } = makeStripe();

  const out = await releaseHeldPayouts(
    { talentProfileId: "tp1" },
    { sb: makeSupabase(rows, updates), stripe, resolveTalentAccount: async () => "acct_talent_tp1" },
  );

  assert.equal(out[0].result, "released");
  assert.equal(calls.length, 1, "Connect leg releases normally");
});

test("idempotent: a re-run reuses the key so Stripe replays — no double-pay", async () => {
  const rows = [heldRow({ id: "L1", party: "talent" })];
  const updates: Update[] = [];
  const { calls, stripe } = makeStripe();
  const deps = { sb: makeSupabase(rows, updates), stripe, resolveTalentAccount: async () => "acct_talent_tp1" };

  await releaseHeldPayouts({ talentProfileId: "tp1" }, deps);
  // row is now 'transferred' → second run finds no held/failed rows for it
  rows[0].status = "transferred";
  const out2 = await releaseHeldPayouts({ talentProfileId: "tp1" }, deps);
  assert.equal(out2.length, 0, "nothing left to release");
  assert.equal(calls.length, 1, "still exactly one transfer");
});

test("no target → no-op", async () => {
  const { calls, stripe } = makeStripe();
  const out = await releaseHeldPayouts({}, { sb: makeSupabase([], []), stripe });
  assert.equal(out.length, 0);
  assert.equal(calls.length, 0);
});

// ── syncBookingPayoutLifecycle — flips agency_bookings to payout_lifecycle=paid
//    once every TALENT leg for the booking is transferred. This is the link that
//    moves the talent dashboard from "pending" to "paid".

/** Fake sb: booking_payouts talent legs (read) + agency_bookings (update sink). */
function makeLifecycleSupabase(
  talentLegs: Array<{ status: string }>,
  bookingUpdates: Array<Record<string, unknown>>,
): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === "agency_bookings") {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: (_c: string, _v: unknown) => {
              bookingUpdates.push(patch);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      // booking_payouts: .select(...).eq(...).eq(...) → awaitable talent legs
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: talentLegs, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

test("lifecycle: all talent legs transferred → booking flips to payout_lifecycle=paid", async () => {
  const updates: Array<Record<string, unknown>> = [];
  await syncBookingPayoutLifecycle(
    makeLifecycleSupabase([{ status: "transferred" }, { status: "transferred" }], updates),
    "bk_1",
  );
  assert.equal(updates.length, 1, "agency_bookings updated once");
  assert.equal(updates[0].payout_lifecycle, "paid");
});

test("lifecycle: a still-held talent leg → booking is NOT flipped to paid", async () => {
  const updates: Array<Record<string, unknown>> = [];
  await syncBookingPayoutLifecycle(
    makeLifecycleSupabase([{ status: "transferred" }, { status: "held" }], updates),
    "bk_1",
  );
  assert.equal(updates.length, 0, "not flipped while a talent leg is unpaid");
});

test("lifecycle: no talent legs recorded → no-op (never blocks, never falsely pays)", async () => {
  const updates: Array<Record<string, unknown>> = [];
  await syncBookingPayoutLifecycle(makeLifecycleSupabase([], updates), "bk_1");
  assert.equal(updates.length, 0);
});

// ── Audit #14: reverseBookingPayouts + computeTalentProtectiveClawback ───────

type PayoutLegRow = {
  id: string;
  booking_id: string;
  participant_id: string;
  party: "talent" | "workspace";
  amount_cents: number;
  currency: string;
  status: string;
  stripe_transfer_id: string | null;
  attempts: number;
};

/** Fake sb over booking_payouts: select-by-booking returns legs; update-by-id mutates in place. */
function makeReversalSupabase(legs: PayoutLegRow[]): SupabaseClient {
  const make = () => {
    let pendingPatch: Record<string, unknown> | null = null;
    const filters: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (patch: Record<string, unknown>) => {
        pendingPatch = patch;
        return chain;
      },
      eq: (col: string, val: unknown) => {
        if (pendingPatch) {
          const target = legs.find((l) => l.id === val);
          if (target) Object.assign(target, pendingPatch);
          pendingPatch = null;
          return Promise.resolve({ data: null, error: null });
        }
        filters.push([col, val]);
        return chain;
      },
      then: (resolve: (v: unknown) => void) => {
        const filtered = legs.filter((l) =>
          filters.every(([c, v]) => (l as unknown as Record<string, unknown>)[c] === v),
        );
        resolve({ data: filtered, error: null });
      },
    };
    return chain;
  };
  return { from: () => make() } as unknown as SupabaseClient;
}

type FakeTransfer = { id: string; amount: number; amount_reversed: number };
function makeReversalStripe(transfers: FakeTransfer[]) {
  const reversals: Array<{ transferId: string; amount: number; key?: string }> = [];
  const seen = new Map<string, { id: string }>();
  const stripe = {
    transfers: {
      list: async () => ({ data: transfers }),
      createReversal: async (transferId: string, params: { amount: number }, opts?: { idempotencyKey?: string }) => {
        const key = opts?.idempotencyKey;
        if (key && seen.has(key)) return seen.get(key);
        const r = { id: `trr_${reversals.length + 1}` };
        reversals.push({ transferId, amount: params.amount, key });
        if (key) seen.set(key, r);
        return r;
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { reversals, stripe };
}

const legRow = (over: Partial<PayoutLegRow> & Pick<PayoutLegRow, "id" | "party">): PayoutLegRow => ({
  booking_id: "bk_1",
  participant_id: "p1",
  amount_cents: 100000,
  currency: "usd",
  status: "transferred",
  stripe_transfer_id: over.party === "talent" ? "tr_t" : "tr_w",
  attempts: 1,
  ...over,
});

test("full reversal: every transferred leg is reversed for its remaining + marked reversed", async () => {
  const legs = [
    legRow({ id: "L1", party: "talent", amount_cents: 80000, stripe_transfer_id: "tr_t" }),
    legRow({ id: "L2", party: "workspace", amount_cents: 20000, stripe_transfer_id: "tr_w" }),
  ];
  const { reversals, stripe } = makeReversalStripe([
    { id: "tr_t", amount: 80000, amount_reversed: 0 },
    { id: "tr_w", amount: 20000, amount_reversed: 0 },
  ]);
  const out = await reverseBookingPayouts(
    "bk_1",
    { mode: "full", reference: "dispute_lost dp_1" },
    { sb: makeReversalSupabase(legs), stripe },
  );
  assert.equal(reversals.length, 2, "both legs reversed at Stripe");
  assert.deepEqual(reversals.map((r) => r.amount).sort((a, b) => a - b), [20000, 80000]);
  assert.ok(reversals.every((r) => r.key?.startsWith("reverse_tr")), "stable full-reversal key");
  assert.ok(legs.every((l) => l.status === "reversed"), "both legs marked reversed");
  assert.equal(out.filter((o) => o.result === "reversed").length, 2);
});

test("full reversal: held leg is cancelled (no Stripe call); already-reversed is a noop", async () => {
  const legs = [
    legRow({ id: "L1", party: "talent", status: "held", stripe_transfer_id: null }),
    legRow({ id: "L2", party: "workspace", status: "reversed", stripe_transfer_id: "tr_w" }),
  ];
  const { reversals, stripe } = makeReversalStripe([]);
  const out = await reverseBookingPayouts(
    "bk_1",
    { mode: "full", reference: "refund ch_1" },
    { sb: makeReversalSupabase(legs), stripe },
  );
  assert.equal(reversals.length, 0, "no Stripe reversal for held/already-reversed");
  assert.equal(legs.find((l) => l.id === "L1")!.status, "reversed", "held leg cancelled so it can never release");
  assert.equal(out.find((o) => o.legId === "L1")?.result, "cancelled_held");
  assert.equal(out.find((o) => o.legId === "L2")?.result, "noop");
});

test("full reversal: reverses ONLY the remaining un-reversed amount", async () => {
  const legs = [legRow({ id: "L1", party: "workspace", amount_cents: 30000, stripe_transfer_id: "tr_w" })];
  const { reversals, stripe } = makeReversalStripe([{ id: "tr_w", amount: 30000, amount_reversed: 12000 }]);
  await reverseBookingPayouts(
    "bk_1",
    { mode: "full", reference: "dispute_lost dp_1" },
    { sb: makeReversalSupabase(legs), stripe },
  );
  assert.equal(reversals.length, 1);
  assert.equal(reversals[0].amount, 18000, "30000 transferred − 12000 already reversed");
});

test("full reversal is idempotent: a second run reverses nothing more", async () => {
  const legs = [legRow({ id: "L1", party: "talent", amount_cents: 50000, stripe_transfer_id: "tr_t" })];
  const sb = makeReversalSupabase(legs);
  const { reversals, stripe } = makeReversalStripe([{ id: "tr_t", amount: 50000, amount_reversed: 0 }]);
  await reverseBookingPayouts("bk_1", { mode: "full", reference: "dispute_lost dp_1" }, { sb, stripe });
  await reverseBookingPayouts("bk_1", { mode: "full", reference: "dispute_lost dp_1" }, { sb, stripe });
  assert.equal(reversals.length, 1, "leg already reversed on the 2nd run → no new reversal");
});

test("partial reversal: only the workspace leg is clawed; talent leg untouched", async () => {
  const legs = [
    legRow({ id: "L1", party: "talent", amount_cents: 80000, stripe_transfer_id: "tr_t" }),
    legRow({ id: "L2", party: "workspace", participant_id: "p1", amount_cents: 20000, stripe_transfer_id: "tr_w" }),
  ];
  const { reversals, stripe } = makeReversalStripe([]);
  const out = await reverseBookingPayouts(
    "bk_1",
    {
      mode: "partial",
      reference: "partial_refund ch_1",
      workspaceClawbackByLeg: new Map([[reversalLegKey("p1", "workspace"), 5000]]),
    },
    { sb: makeReversalSupabase(legs), stripe },
  );
  assert.equal(reversals.length, 1, "only the workspace leg reversed");
  assert.equal(reversals[0].transferId, "tr_w");
  assert.equal(reversals[0].amount, 5000);
  assert.equal(reversals[0].key, "reverse_partial_tr_w");
  assert.equal(legs.find((l) => l.id === "L1")!.status, "transferred", "talent leg untouched");
  assert.equal(legs.find((l) => l.id === "L2")!.status, "transferred", "workspace leg stays transferred (partial)");
  assert.equal(out.find((o) => o.legId === "L2")?.result, "reversed_partial");
});

// ── Task 1: unique-per-refund partial-reversal idempotency key ───────────────

test("partialReversalIdempotencyKey: anchored is unique per refund, null falls back to legacy", () => {
  assert.equal(partialReversalIdempotencyKey("tr_w", "re_a"), "reverse_partial_tr_w_re_a");
  assert.equal(partialReversalIdempotencyKey("tr_w", "re_b"), "reverse_partial_tr_w_re_b");
  assert.notEqual(
    partialReversalIdempotencyKey("tr_w", "re_a"),
    partialReversalIdempotencyKey("tr_w", "re_b"),
    "distinct refunds → distinct keys",
  );
  // No anchor (legacy/trimmed payload) → the original per-transfer key.
  assert.equal(partialReversalIdempotencyKey("tr_w", null), "reverse_partial_tr_w");
});

test("partial reversal: the supplied anchor is used as the idempotency key", async () => {
  const legs = [legRow({ id: "L2", party: "workspace", participant_id: "p1", amount_cents: 20000, stripe_transfer_id: "tr_w" })];
  const { reversals, stripe } = makeReversalStripe([]);
  await reverseBookingPayouts(
    "bk_1",
    {
      mode: "partial",
      reference: "partial_refund re_a",
      workspaceClawbackByLeg: new Map([[reversalLegKey("p1", "workspace"), 5000]]),
      partialReversalAnchor: "re_a",
    },
    { sb: makeReversalSupabase(legs), stripe },
  );
  assert.equal(reversals.length, 1);
  assert.equal(reversals[0].key, "reverse_partial_tr_w_re_a", "anchored unique-per-refund key");
});

test("Task 1: two DISTINCT partial refunds on the SAME transfer → two reversals, distinct keys", async () => {
  // The bug: with the old `reverse_partial_<transferId>` key, a 2nd distinct
  // partial reused the SAME key with a different amount and Stripe rejected the
  // 2nd reversal (never applied). With per-refund anchors, both are applied.
  const legs = [legRow({ id: "L2", party: "workspace", participant_id: "p1", amount_cents: 20000, stripe_transfer_id: "tr_w" })];
  const sb = makeReversalSupabase(legs);
  const { reversals, stripe } = makeReversalStripe([]);

  const plan = (anchor: string, amount: number) => ({
    mode: "partial" as const,
    reference: `partial_refund ${anchor}`,
    workspaceClawbackByLeg: new Map([[reversalLegKey("p1", "workspace"), amount]]),
    partialReversalAnchor: anchor,
  });

  await reverseBookingPayouts("bk_1", plan("re_a", 5000), { sb, stripe });
  await reverseBookingPayouts("bk_1", plan("re_b", 3000), { sb, stripe });

  assert.equal(reversals.length, 2, "both distinct partials applied (not rejected on key reuse)");
  assert.deepEqual(reversals.map((r) => r.key), ["reverse_partial_tr_w_re_a", "reverse_partial_tr_w_re_b"]);
  assert.equal(new Set(reversals.map((r) => r.key)).size, 2, "keys are distinct");
});

test("Task 1: a RE-DELIVERED same partial refund replays the SAME reversal (no double-claw)", async () => {
  const legs = [legRow({ id: "L2", party: "workspace", participant_id: "p1", amount_cents: 20000, stripe_transfer_id: "tr_w" })];
  const sb = makeReversalSupabase(legs);
  const { reversals, stripe } = makeReversalStripe([]);

  const plan = {
    mode: "partial" as const,
    reference: "partial_refund re_a",
    workspaceClawbackByLeg: new Map([[reversalLegKey("p1", "workspace"), 5000]]),
    partialReversalAnchor: "re_a",
  };
  await reverseBookingPayouts("bk_1", plan, { sb, stripe });
  await reverseBookingPayouts("bk_1", plan, { sb, stripe }); // same refund re-delivered

  assert.equal(reversals.length, 1, "same anchor → same key → Stripe replays, no 2nd reversal");
  assert.equal(reversals[0].key, "reverse_partial_tr_w_re_a");
});

// ── M2: partial reversal caps at the leg's REMAINING (un-reversed) amount ────
//
// Each partial reversal must be capped at `amount_cents − already_reversed` (the
// leg's residual, read live from the transfer's `amount_reversed`), NOT the leg's
// full transferred amount. Two additive partials on one leg must reverse the
// correct remaining amounts and never sum past the leg total — correct even if
// the talent-protective split didn't already bound it.

/** Like makeReversalStripe but `createReversal` ACCRUES onto the transfer's
 *  `amount_reversed`, so a later `transfers.list` reflects the running total —
 *  this is what lets a second partial see how much the first already reversed. */
function makeAccruingReversalStripe(transfers: FakeTransfer[]) {
  const reversals: Array<{ transferId: string; amount: number; key?: string }> = [];
  const seen = new Map<string, { id: string }>();
  const byId = new Map(transfers.map((t) => [t.id, t]));
  const stripe = {
    transfers: {
      list: async () => ({ data: transfers }),
      createReversal: async (transferId: string, params: { amount: number }, opts?: { idempotencyKey?: string }) => {
        const key = opts?.idempotencyKey;
        if (key && seen.has(key)) return seen.get(key);
        const r = { id: `trr_${reversals.length + 1}` };
        reversals.push({ transferId, amount: params.amount, key });
        if (key) seen.set(key, r);
        const t = byId.get(transferId);
        if (t) t.amount_reversed += params.amount; // Stripe accrues amount_reversed
        return r;
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { reversals, stripe };
}

test("M2 partial: clawback is capped at the leg's REMAINING amount, not its full amount", async () => {
  // 20000 leg, 15000 already reversed by a prior partial → only 5000 left.
  const legs = [legRow({ id: "L2", party: "workspace", participant_id: "p1", amount_cents: 20000, stripe_transfer_id: "tr_w" })];
  const { reversals, stripe } = makeReversalStripe([{ id: "tr_w", amount: 20000, amount_reversed: 15000 }]);
  const out = await reverseBookingPayouts(
    "bk_1",
    {
      mode: "partial",
      reference: "partial_refund re_b",
      // ask to claw 9000, but only 5000 remains un-reversed
      workspaceClawbackByLeg: new Map([[reversalLegKey("p1", "workspace"), 9000]]),
      partialReversalAnchor: "re_b",
    },
    { sb: makeReversalSupabase(legs), stripe },
  );
  assert.equal(reversals.length, 1);
  assert.equal(reversals[0].amount, 5000, "capped at remaining (20000 − 15000), NOT the requested 9000 or the full 20000");
  assert.equal(out.find((o) => o.legId === "L2")?.amountCents, 5000);
});

test("M2 partial: a fully-reversed leg → no further reversal (remaining is 0)", async () => {
  const legs = [legRow({ id: "L2", party: "workspace", participant_id: "p1", amount_cents: 20000, stripe_transfer_id: "tr_w" })];
  const { reversals, stripe } = makeReversalStripe([{ id: "tr_w", amount: 20000, amount_reversed: 20000 }]);
  const out = await reverseBookingPayouts(
    "bk_1",
    {
      mode: "partial",
      reference: "partial_refund re_c",
      workspaceClawbackByLeg: new Map([[reversalLegKey("p1", "workspace"), 5000]]),
      partialReversalAnchor: "re_c",
    },
    { sb: makeReversalSupabase(legs), stripe },
  );
  assert.equal(reversals.length, 0, "nothing left to reverse on an already fully-reversed leg");
  assert.equal(out.find((o) => o.legId === "L2")?.result, "noop");
});

test("M2 partial: two ADDITIVE partials on one leg reverse the correct remaining + never exceed the leg total", async () => {
  // One 20000 workspace leg. Two distinct partial refunds claw 12000 then 15000.
  // The 1st reverses 12000 (remaining was 20000). The 2nd is REQUESTED for 15000
  // but only 8000 remains (20000 − 12000) → it must cap at 8000. Cumulative = the
  // full 20000 and never a cent more, even though each request alone was ≤ 20000.
  const legs = [legRow({ id: "L2", party: "workspace", participant_id: "p1", amount_cents: 20000, stripe_transfer_id: "tr_w" })];
  const sb = makeReversalSupabase(legs);
  const { reversals, stripe } = makeAccruingReversalStripe([{ id: "tr_w", amount: 20000, amount_reversed: 0 }]);

  const plan = (anchor: string, amount: number) => ({
    mode: "partial" as const,
    reference: `partial_refund ${anchor}`,
    workspaceClawbackByLeg: new Map([[reversalLegKey("p1", "workspace"), amount]]),
    partialReversalAnchor: anchor,
  });

  await reverseBookingPayouts("bk_1", plan("re_a", 12000), { sb, stripe });
  await reverseBookingPayouts("bk_1", plan("re_b", 15000), { sb, stripe });

  assert.equal(reversals.length, 2, "both distinct partials applied");
  assert.equal(reversals[0].amount, 12000, "1st partial reverses its full requested amount (fits in remaining)");
  assert.equal(reversals[1].amount, 8000, "2nd partial capped at the REMAINING 8000, not its requested 15000");
  const total = reversals.reduce((s, r) => s + r.amount, 0);
  assert.equal(total, 20000, "cumulative reversed == leg total");
  assert.ok(total <= 20000, "cumulative reversed never exceeds the leg total");
});

test("clawback: refund within the platform fee → platform absorbs all, nobody clawed", () => {
  const r = computeTalentProtectiveClawback({
    platformFeeCents: 10000,
    workspaceLegs: [{ key: "p1:workspace", amountCents: 20000 }],
    talentTotalCents: 80000,
    refundedCents: 6000,
  });
  assert.equal(r.platformAbsorbedCents, 6000);
  assert.equal(r.workspaceClawbackTotalCents, 0);
  assert.equal(r.talentResidualCents, 0);
});

test("clawback: refund within platform+workspace → workspace clawed for the excess, talent safe", () => {
  const r = computeTalentProtectiveClawback({
    platformFeeCents: 10000,
    workspaceLegs: [{ key: "p1:workspace", amountCents: 20000 }],
    talentTotalCents: 80000,
    refundedCents: 25000,
  });
  assert.equal(r.platformAbsorbedCents, 10000);
  assert.equal(r.workspaceClawbackTotalCents, 15000);
  assert.equal(r.workspaceClawbackByLeg.get("p1:workspace"), 15000);
  assert.equal(r.talentResidualCents, 0, "talent protected");
});

test("clawback: refund exceeding platform+workspace → talent residual escalated (capped)", () => {
  const r = computeTalentProtectiveClawback({
    platformFeeCents: 10000,
    workspaceLegs: [{ key: "p1:workspace", amountCents: 20000 }],
    talentTotalCents: 80000,
    refundedCents: 40000,
  });
  assert.equal(r.platformAbsorbedCents, 10000);
  assert.equal(r.workspaceClawbackTotalCents, 20000, "all workspace margin clawed");
  assert.equal(r.talentResidualCents, 10000, "40000 − 10000 − 20000 = 10000 left for the talent (escalated)");
});

test("clawback: talent residual never exceeds what the talent actually got", () => {
  const r = computeTalentProtectiveClawback({
    platformFeeCents: 0,
    workspaceLegs: [],
    talentTotalCents: 5000,
    refundedCents: 999999,
  });
  assert.equal(r.talentResidualCents, 5000);
});

test("clawback: multi workspace-leg split sums EXACTLY to the workspace clawback (no drift)", () => {
  const r = computeTalentProtectiveClawback({
    platformFeeCents: 0,
    workspaceLegs: [
      { key: "a:workspace", amountCents: 10000 },
      { key: "b:workspace", amountCents: 20000 },
      { key: "c:workspace", amountCents: 3333 },
    ],
    talentTotalCents: 0,
    refundedCents: 10001, // not evenly divisible → exercises the rounding remainder
  });
  const sum = [...r.workspaceClawbackByLeg.values()].reduce((a, b) => a + b, 0);
  assert.equal(sum, r.workspaceClawbackTotalCents);
  assert.equal(sum, 10001);
  assert.ok(r.workspaceClawbackByLeg.get("a:workspace")! <= 10000);
  assert.ok(r.workspaceClawbackByLeg.get("b:workspace")! <= 20000);
  assert.ok(r.workspaceClawbackByLeg.get("c:workspace")! <= 3333);
});
