/**
 * executeBookingTransfers — integration test (fake Stripe + fake Supabase).
 *
 * transfers.ts previously had ZERO coverage. This pins the money-critical
 * behaviour so a refactor can't silently break payouts:
 *   • N-way fan-out: each talent gets their full protected quote; the
 *     workspace/agency gets its margin share; the platform transfers nothing.
 *   • Held-skip: a payee with no enabled connected account is skipped
 *     (status "skipped_no_account") — funds stay on the platform, no Stripe
 *     call, the rest still pay.
 *   • Zero amounts are skipped.
 *   • Idempotency: a re-run reuses the per-(booking,participant,party) Stripe
 *     idempotency key, so no double-pay.
 *
 * Deps are injected via the new TransferDeps seam — no live Stripe/DB.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeBookingTransfers } from "@/lib/payments/transfers";

const TXN_ID = "txn_1";
const BOOKING_ID = "bk_1";
const TENANT = "tenant_agency_1";

type Snap = {
  booking_id: string;
  participant_id: string;
  owning_party_type: "talent" | "agency" | "workspace";
  owning_party_id: string;
  talent_net_cents: number;
  workspace_fee_cents: number;
  platform_fee_cents: number;
  gross_charged_cents: number;
  currency_code: string;
};

/** Fake Supabase serving the exact reads executeBookingTransfers makes. */
function makeSupabase(opts: {
  txnStatus?: string;
  snapshots: Snap[];
  participants?: Record<string, string>; // participant_id -> talent_profile_id
}): SupabaseClient {
  const txn = {
    id: TXN_ID,
    booking_id: BOOKING_ID,
    status: opts.txnStatus ?? "paid",
    currency: "mxn",
  };
  const make = (table: string) => {
    let lastVal: unknown = null;
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (_col: string, val: unknown) => {
        lastVal = val;
        return chain;
      },
      order: () =>
        Promise.resolve(
          table === "booking_commission_snapshot"
            ? { data: opts.snapshots, error: null }
            : { data: [], error: null },
        ),
      maybeSingle: () => {
        if (table === "booking_transactions") return Promise.resolve({ data: txn, error: null });
        if (table === "inquiry_participants") {
          const tpid = opts.participants?.[String(lastVal)] ?? null;
          return Promise.resolve({ data: tpid ? { talent_profile_id: tpid } : null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  };
  return { from: (table: string) => make(table) } as unknown as SupabaseClient;
}

type TransferCall = { params: Record<string, unknown>; idempotencyKey?: string };

/** Fake Stripe that records transfers + honours the idempotency key. */
function makeStripe() {
  const calls: TransferCall[] = [];
  const seen = new Map<string, { id: string }>();
  const client = {
    transfers: {
      create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        const key = options?.idempotencyKey;
        if (key && seen.has(key)) return seen.get(key); // replay — no new money
        const transfer = { id: `tr_${calls.length + 1}` };
        calls.push({ params, idempotencyKey: key });
        if (key) seen.set(key, transfer);
        return transfer;
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { calls, stripe: client as any };
}

function snap(p: Partial<Snap> & Pick<Snap, "participant_id">): Snap {
  return {
    booking_id: BOOKING_ID,
    owning_party_type: "agency",
    owning_party_id: TENANT,
    talent_net_cents: 0,
    workspace_fee_cents: 0,
    platform_fee_cents: 0,
    gross_charged_cents: 0,
    currency_code: "mxn",
    ...p,
  };
}

test("N-way split: each talent gets full quote, agency gets each margin share, platform transfers nothing", async () => {
  const snapshots: Snap[] = [
    snap({ participant_id: "p1", talent_net_cents: 120000, workspace_fee_cents: 30000 }),
    snap({ participant_id: "p2", talent_net_cents: 80000, workspace_fee_cents: 20000 }),
    snap({ participant_id: "p3", talent_net_cents: 60000, workspace_fee_cents: 10000 }),
  ];
  const participants = { p1: "tp1", p2: "tp2", p3: "tp3" };
  const { calls, stripe } = makeStripe();

  const outcomes = await executeBookingTransfers(TXN_ID, {
    sb: makeSupabase({ snapshots, participants }),
    stripe,
    resolveTalentAccount: async (tp) => `acct_talent_${tp}`,
    resolveWorkspaceAccount: async (t) => `acct_${t}`,
  });

  const talent = outcomes.filter((o) => o.party === "talent");
  const ws = outcomes.filter((o) => o.party === "workspace");
  assert.equal(talent.length, 3, "3 talent transfers");
  assert.equal(ws.length, 3, "3 workspace transfers");
  assert.ok(outcomes.every((o) => o.status === "transferred"), "all transferred");

  // talent paid their FULL protected quote, to their own account
  assert.deepEqual(
    talent.map((o) => o.amountCents).sort((a, b) => a - b),
    [60000, 80000, 120000],
  );
  assert.equal(
    talent.find((o) => o.amountCents === 120000)?.destination,
    "acct_talent_tp1",
  );
  // agency got each margin share, all to the one agency account
  assert.equal(ws.reduce((a, o) => a + o.amountCents, 0), 60000);
  assert.ok(ws.every((o) => o.destination === `acct_${TENANT}`));
  // platform transfers nothing — no "platform" party outcome exists
  assert.equal(outcomes.filter((o) => (o.party as string) === "platform").length, 0);

  // 6 distinct Stripe transfers, keyed per (booking, participant, party)
  assert.equal(calls.length, 6);
  const keys = calls.map((c) => c.idempotencyKey);
  assert.equal(new Set(keys).size, 6, "all idempotency keys distinct");
  assert.ok(keys.includes(`transfer_${BOOKING_ID}_p1_talent`));
  assert.ok(keys.includes(`transfer_${BOOKING_ID}_p1_workspace`));
});

test("held-skip: a talent with no enabled account is skipped (funds held), the rest still pay", async () => {
  const snapshots: Snap[] = [
    snap({ participant_id: "p1", talent_net_cents: 100000, workspace_fee_cents: 25000 }),
    snap({ participant_id: "p2", talent_net_cents: 90000, workspace_fee_cents: 15000 }),
  ];
  const participants = { p1: "tp1", p2: "tp2" };
  const { calls, stripe } = makeStripe();

  const outcomes = await executeBookingTransfers(TXN_ID, {
    sb: makeSupabase({ snapshots, participants }),
    stripe,
    // tp2 has NOT onboarded → no transfer-enabled account
    resolveTalentAccount: async (tp) => (tp === "tp2" ? null : `acct_talent_${tp}`),
    resolveWorkspaceAccount: async (t) => `acct_${t}`,
  });

  const tp2 = outcomes.find((o) => o.party === "talent" && o.amountCents === 90000);
  assert.equal(tp2?.status, "skipped_no_account", "unonboarded talent held");
  assert.match(tp2?.detail ?? "", /held on platform/i);

  const tp1 = outcomes.find((o) => o.party === "talent" && o.amountCents === 100000);
  assert.equal(tp1?.status, "transferred", "onboarded talent still paid");
  // both agency shares still transfer
  assert.equal(outcomes.filter((o) => o.party === "workspace" && o.status === "transferred").length, 2);

  // Stripe was called only for the 3 real transfers (tp1 + 2 workspace), NOT the held one
  assert.equal(calls.length, 3);
  assert.ok(!calls.some((c) => c.idempotencyKey === `transfer_${BOOKING_ID}_p2_talent`));
});

test("zero amounts are skipped (no Stripe call)", async () => {
  const snapshots: Snap[] = [
    snap({ participant_id: "p1", talent_net_cents: 0, workspace_fee_cents: 0 }),
  ];
  const { calls, stripe } = makeStripe();
  const outcomes = await executeBookingTransfers(TXN_ID, {
    sb: makeSupabase({ snapshots, participants: { p1: "tp1" } }),
    stripe,
    resolveTalentAccount: async () => "acct_x",
    resolveWorkspaceAccount: async () => "acct_y",
  });
  // talent_net 0 → the talent branch is skipped entirely (no outcome pushed);
  // workspace_fee 0 → workspace branch skipped. No Stripe calls either way.
  assert.equal(calls.length, 0);
  assert.ok(outcomes.every((o) => o.status !== "transferred"));
});

test("idempotency: re-running the same booking does NOT double-pay", async () => {
  const snapshots: Snap[] = [
    snap({ participant_id: "p1", talent_net_cents: 100000, workspace_fee_cents: 20000 }),
  ];
  const participants = { p1: "tp1" };
  const { calls, stripe } = makeStripe();
  const deps = {
    sb: makeSupabase({ snapshots, participants }),
    stripe,
    resolveTalentAccount: async (tp: string) => `acct_talent_${tp}`,
    resolveWorkspaceAccount: async (t: string) => `acct_${t}`,
  };

  await executeBookingTransfers(TXN_ID, deps);
  const afterFirst = calls.length;
  // second delivery of the same webhook → same idempotency keys → replays
  await executeBookingTransfers(TXN_ID, { ...deps, sb: makeSupabase({ snapshots, participants }) });
  assert.equal(afterFirst, 2, "first run made 2 transfers");
  assert.equal(calls.length, 2, "re-run created NO new transfers");
});

test("does not fan out before the charge settles (status guard)", async () => {
  const { calls, stripe } = makeStripe();
  const outcomes = await executeBookingTransfers(TXN_ID, {
    sb: makeSupabase({
      txnStatus: "payment_requested",
      snapshots: [snap({ participant_id: "p1", talent_net_cents: 100000 })],
      participants: { p1: "tp1" },
    }),
    stripe,
    resolveTalentAccount: async () => "acct_x",
    resolveWorkspaceAccount: async () => "acct_y",
  });
  assert.equal(outcomes.length, 0);
  assert.equal(calls.length, 0);
});
