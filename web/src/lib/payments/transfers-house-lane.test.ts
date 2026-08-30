/**
 * House-lane transfers: a workspace-owned (menu) commission snapshot must
 * produce exactly ONE transfer outcome — party "workspace" — with zero talent
 * legs and zero held legs.
 *
 * Run: npm run test:money
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeBookingTransfers } from "@/lib/payments/transfers";

const TXN_ID = "txn_house_1";
const BOOKING_ID = "bk_house_1";
const TENANT = "tenant_workspace_1";
const HOUSE_PARTICIPANT = "part_house_1";

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

type LedgerWrite = { op: "insert" | "update"; row: Record<string, unknown> };

function makeSupabase(opts: {
  snapshots: Snap[];
  ledger?: LedgerWrite[];
}): SupabaseClient {
  const txn = {
    id: TXN_ID,
    booking_id: BOOKING_ID,
    status: "paid",
    currency: "usd",
  };
  const make = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      insert: (row: Record<string, unknown>) => {
        if (table === "booking_payouts") opts.ledger?.push({ op: "insert", row });
        return Promise.resolve({ data: null, error: null });
      },
      update: (row: Record<string, unknown>) => {
        if (table === "booking_payouts") opts.ledger?.push({ op: "update", row });
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
        // No talent_profile_id for house participants.
        if (table === "inquiry_participants") {
          return Promise.resolve({ data: { talent_profile_id: null }, error: null });
        }
        // booking_sub_type lookup → null → isProductPayoutDeferred returns false
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  };
  return { from: (table: string) => make(table) } as unknown as SupabaseClient;
}

function makeStripe() {
  const calls: { params: Record<string, unknown> }[] = [];
  const client = {
    transfers: {
      create: async (params: Record<string, unknown>) => {
        const transfer = { id: `tr_house_${calls.length + 1}` };
        calls.push({ params });
        return transfer;
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { calls, stripe: client as any };
}

test("house snapshot → exactly one workspace outcome, zero talent, zero held", async () => {
  // Resolver output for talent_cost=0, sellerOfRecord=workspace, $100 subtotal
  // at default 5% take (even split): platform 500, workspace 9750, talent 0.
  const snapshots: Snap[] = [
    {
      booking_id: BOOKING_ID,
      participant_id: HOUSE_PARTICIPANT,
      owning_party_type: "workspace",
      owning_party_id: TENANT,
      talent_net_cents: 0,
      workspace_fee_cents: 9750,
      platform_fee_cents: 500,
      gross_charged_cents: 10250,
      currency_code: "usd",
    },
  ];
  const { calls, stripe } = makeStripe();
  const ledger: LedgerWrite[] = [];

  const outcomes = await executeBookingTransfers(TXN_ID, {
    sb: makeSupabase({ snapshots, ledger }),
    stripe,
    resolveTalentAccount: async () => {
      throw new Error("resolveTalentAccount must not be called for house lane");
    },
    resolveWorkspaceAccount: async (t) => `acct_${t}`,
  });

  assert.equal(outcomes.length, 1, "exactly one outcome");
  assert.equal(outcomes[0]?.party, "workspace");
  assert.equal(outcomes[0]?.status, "transferred");
  assert.equal(outcomes[0]?.amountCents, 9750);
  assert.equal(outcomes[0]?.destination, `acct_${TENANT}`);

  assert.equal(
    outcomes.filter((o) => o.party === "talent").length,
    0,
    "zero talent legs",
  );
  assert.equal(
    outcomes.filter((o) => o.status !== "transferred").length,
    0,
    "zero non-transferred (held/skipped) legs",
  );

  assert.equal(calls.length, 1, "one Stripe transfer");
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]?.row.party, "workspace");
  assert.equal(ledger[0]?.row.talent_profile_id, null);
});
