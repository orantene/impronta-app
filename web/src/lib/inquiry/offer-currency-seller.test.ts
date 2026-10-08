/**
 * Seller lookup + guards for offer currency (TUL-274), on an injected fake.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' node_modules/.bin/tsx --test src/lib/inquiry/offer-currency-seller.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkInquiryCurrencyMatchesSeller, resolveNewOfferCurrency } from "./offer-currency-seller";

type TalentRow = { id: string; default_currency: string | null; stripe_account_platform: string | null };

/** Fake: inquiry_participants -> the given talent ids; talent_profiles -> the given rows. */
function fakeSupabase(talents: TalentRow[]): SupabaseClient {
  const builder = (rows: unknown[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in"]) b[m] = () => b;
    b.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null });
    return b;
  };
  return {
    from: (table: string) =>
      table === "inquiry_participants"
        ? builder(talents.map((t) => ({ talent_profile_id: t.id })))
        : builder(talents),
  } as unknown as SupabaseClient;
}

const mx: TalentRow = { id: "t-mx", default_currency: "MXN", stripe_account_platform: "mx" };
const us: TalentRow = { id: "t-us", default_currency: "USD", stripe_account_platform: "us" };

describe("resolveNewOfferCurrency, participant step (full order in offer-currency-fallback.test.ts)", () => {
  const run = (talents: TalentRow[], followSeller = true) =>
    resolveNewOfferCurrency(fakeSupabase(talents), { inquiryId: "i1", tenantId: "t1", explicitCurrency: "USD", followSeller });
  it("MXN seller -> MXN", async () => assert.equal(await run([mx]), "MXN"));
  it("USD seller -> USD", async () => assert.equal(await run([us]), "USD"));
  it("followSeller=false keeps the caller's explicit currency (counter offers)", async () =>
    assert.equal(await run([mx], false), "USD"));
});

describe("seller read ERROR: send fails open, charge fails closed", () => {
  const failing = {
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) b[m] = () => b;
      b.then = (resolve: (v: { data: null; error: { message: string } }) => unknown) =>
        resolve({ data: null, error: { message: "db down" } });
      return b;
    },
  } as unknown as SupabaseClient;
  const throwing = {
    from: () => {
      throw new Error("boom");
    },
  } as unknown as SupabaseClient;

  it("send mode: a read error does not block", async () => {
    assert.deepEqual(await checkInquiryCurrencyMatchesSeller(failing, { inquiryId: "i1", currency: "USD", mode: "send" }), { ok: true });
    assert.deepEqual(await checkInquiryCurrencyMatchesSeller(throwing, { inquiryId: "i1", currency: "USD", mode: "send" }), { ok: true });
  });
  it("charge mode: a read error, a thrown read or a missing client is refused", async () => {
    for (const sb of [failing, throwing, null]) {
      const r = await checkInquiryCurrencyMatchesSeller(sb, { inquiryId: "i1", currency: "USD", mode: "charge" });
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.code, "seller_currency_unreadable");
    }
  });
  it("charge mode: no sellers resolved WITHOUT error is still not refused", async () => {
    assert.deepEqual(
      await checkInquiryCurrencyMatchesSeller(fakeSupabase([]), { inquiryId: "i1", currency: "USD", mode: "charge" }),
      { ok: true },
    );
  });
});

describe("checkInquiryCurrencyMatchesSeller (send and charge creation)", () => {
  const check = (talents: TalentRow[], currency: string) =>
    checkInquiryCurrencyMatchesSeller(fakeSupabase(talents), { inquiryId: "i1", currency, mode: "charge" });
  it("matching currency passes", async () => assert.deepEqual(await check([mx], "MXN"), { ok: true }));
  it("USD offer to an MXN seller is refused (send guard)", async () => {
    const r = await check([mx], "USD");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "offer_currency_seller_mismatch");
  });
  it("USD charge for an MXN seller is refused (charge guard, same check)", async () => {
    const r = await check([mx], "usd");
    assert.equal(r.ok, false);
  });
  it("mixed sellers are unchanged", async () => assert.deepEqual(await check([mx, us], "USD"), { ok: true }));
});
