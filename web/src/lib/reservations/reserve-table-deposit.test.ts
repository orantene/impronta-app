/**
 * MONEY BUG 3: an online table was charged the catalog item's deposit_pct (or
 * refused with engine_error when it had none), while the POS floor showed
 * `depositCentsForParty`. The shown and the charged amount must be one figure:
 * deposit_cents_per_person x party, in the workspace currency.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createReservation, workspaceCurrency, type ReserveOutcome } from "@/lib/reservations/reserve";
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
function fakeAdmin(settings: unknown, error: unknown = null): SupabaseClient {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => (error ? { data: null, error } : { data: { settings }, error: null }),
  };
  return { from: () => q } as unknown as SupabaseClient;
}

const offered = {
  startsAt: new Date("2026-11-01T01:00:00Z"),
  endsAt: new Date("2026-11-01T03:00:00Z"),
  band: { poolId: "pool_1" },
} as unknown as OfferedTime;

async function attempt(r: ReturnType<typeof rules>, partySize: number, admin: SupabaseClient) {
  let seen: PurchaseInput | null = null;
  const refusal: PurchaseResult = { ok: false, reason: "sold_out" };
  const outcome: ReserveOutcome = await createReservation(
    admin,
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
  return { seen: seen as PurchaseInput | null, outcome };
}

async function sentToPipeline(r: ReturnType<typeof rules>, partySize: number, settings: unknown) {
  const { seen } = await attempt(r, partySize, fakeAdmin(settings));
  assert.ok(seen, "the pipeline was called");
  return seen;
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
  const usd = await sentToPipeline(rules(), 6, { display_currency: "usd" });
  assert.equal(usd.tableDeposit?.currency, "USD", "an explicit choice is normalised, not replaced");
});

// P0 (consultant FIX FIRST): never charge in a guessed currency. A deposit with
// no explicitly chosen, valid display currency is REFUSED before the pipeline.
for (const [label, admin] of [
  ["never chosen", fakeAdmin({})],
  ["settings null", fakeAdmin(null)],
  ["malformed (pesos)", fakeAdmin({ display_currency: "pesos" })],
  ["malformed (number)", fakeAdmin({ display_currency: 484 })],
  ["the settings read failed", fakeAdmin(null, { message: "boom" })],
] as const) {
  test(`a deposit with the workspace currency ${label} is refused, never charged in USD`, async () => {
    const { seen, outcome } = await attempt(rules(), 6, admin);
    assert.equal(seen, null, "the pipeline must not be called");
    assert.deepEqual(outcome, { ok: false, reason: "currency_not_set" });
  });
}

test("no admin client means no currency, so a deposit is refused", async () => {
  assert.equal(await workspaceCurrency(null, TENANT), null);
});

test("workspaceCurrency returns only an explicit valid code", async () => {
  assert.equal(await workspaceCurrency(fakeAdmin({ display_currency: "MXN" }), TENANT), "MXN");
  assert.equal(await workspaceCurrency(fakeAdmin({ display_currency: " ars " }), TENANT), "ARS");
  assert.equal(await workspaceCurrency(fakeAdmin({}), TENANT), null);
  assert.equal(await workspaceCurrency(fakeAdmin({ display_currency: "US$" }), TENANT), null);
  assert.equal(await workspaceCurrency(fakeAdmin(null, { message: "x" }), TENANT), null);
});

test("a table with no deposit needs no currency, so an unset workspace can still book it", async () => {
  const { seen } = await attempt(rules(), 5, fakeAdmin({}));
  assert.ok(seen);
  assert.equal(seen.paymentChoice, "in_person");
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
