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
import { releaseHeldPayouts, payoutIdempotencyKey } from "@/lib/payments/booking-payouts-ledger";

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
