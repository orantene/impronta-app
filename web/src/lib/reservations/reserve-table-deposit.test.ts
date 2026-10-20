/**
 * MONEY BUG 3: an online table was charged the catalog item's deposit_pct (or
 * refused with engine_error when it had none), while the POS floor showed
 * `depositCentsForParty`. The shown and the charged amount must be one figure:
 * deposit_cents_per_person x party, in the workspace currency.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createReservation } from "@/lib/reservations/reserve";
import { depositCentsForParty, parseServiceRules } from "@/lib/reservations/rules";
import type { PurchaseInput, PurchaseResult } from "@/lib/orders/purchase-types";
import type { OfferedTime } from "@/lib/reservations/availability";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OFFERING = "33333333-3333-3333-3333-333333333333";

function rules(over: Record<string, unknown> = {}) {
  return parseServiceRules(
    {
      is_active: true,
      deposit_from_party: 6,
      deposit_cents_per_person: 10_000,
      reservation_offering_id: OFFERING,
      ...over,
    },
    "venue_1",
  );
}

/** An admin whose only readable row is the workspace's settings. */
function fakeAdmin(settings: unknown): SupabaseClient {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: { settings }, error: null }),
  };
  return { from: () => q } as unknown as SupabaseClient;
}

const offered = {
  startsAt: new Date("2026-11-01T01:00:00Z"),
  endsAt: new Date("2026-11-01T03:00:00Z"),
  band: { poolId: "pool_1" },
} as unknown as OfferedTime;

async function sentToPipeline(r: ReturnType<typeof rules>, partySize: number, settings: unknown) {
  let seen: PurchaseInput | null = null;
  const refusal: PurchaseResult = { ok: false, reason: "sold_out" };
  await createReservation(
    fakeAdmin(settings),
    {
      tenantId: TENANT,
      venueId: "venue_1",
      rules: r,
      offered,
      partySize,
      clientOrderKey: "key_1",
      actorUserId: null,
      contact: { email: "g@example.com" },
    },
    {
      createPurchase: async (_a, input) => {
        seen = input;
        return refusal;
      },
    },
  );
  assert.ok(seen, "the pipeline was called");
  return seen as PurchaseInput;
}

test("party of 6 at MXN 100 per person is charged MXN 600, the figure the floor shows", async () => {
  const r = rules();
  const sent = await sentToPipeline(r, 6, { display_currency: "MXN" });
  assert.equal(depositCentsForParty(r, 6), 60_000);
  assert.equal(sent.paymentChoice, "deposit");
  assert.deepEqual(sent.tableDeposit, { cents: depositCentsForParty(r, 6), currency: "MXN" });
});

test("the deposit currency is the workspace currency, not a hard-coded USD", async () => {
  const mxn = await sentToPipeline(rules(), 6, { display_currency: "MXN" });
  assert.equal(mxn.tableDeposit?.currency, "MXN");
  const unset = await sentToPipeline(rules(), 6, {});
  assert.equal(unset.tableDeposit?.currency, "USD", "a workspace that never chose is USD");
});

test("a large party is priced from the venue rules, so it needs no catalog deposit_pct", async () => {
  const sent = await sentToPipeline(rules({ deposit_from_party: 2 }), 40, { display_currency: "MXN" });
  assert.equal(sent.tableDeposit?.cents, 400_000);
  assert.equal(sent.paymentChoice, "deposit");
});

test("a party under the threshold pays nothing online", async () => {
  const sent = await sentToPipeline(rules(), 5, { display_currency: "MXN" });
  assert.equal(sent.paymentChoice, "in_person");
  assert.equal(sent.tableDeposit, undefined);
});

test("a threshold with 0 per person collects nothing online", async () => {
  const sent = await sentToPipeline(rules({ deposit_cents_per_person: 0 }), 8, {});
  assert.equal(sent.paymentChoice, "in_person");
  assert.equal(sent.tableDeposit, undefined);
});
