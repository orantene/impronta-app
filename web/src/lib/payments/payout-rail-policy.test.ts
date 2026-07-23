/**
 * payout-rail-policy — rail decision + DB-backed resolver unit tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decidePayoutRail, resolveTalentPayoutRail } from "@/lib/payments/payout-rail-policy";

const GP = async () => "global_payouts" as const;

test("decidePayoutRail: USDC opt-in rides Connect (auto-converts), never v2 global_payouts", () => {
  // USDC correction: a crypto opt-in + eligible country + GP active no longer
  // routes to v2 global_payouts — the USD Connect transfer auto-converts to USDC.
  assert.equal(
    decidePayoutRail({ talentCryptoOptIn: true, gpActive: true, countryEligible: true }).rail,
    "connect_transfer",
  );
  assert.equal(
    decidePayoutRail({ talentCryptoOptIn: true, gpActive: false, countryEligible: true }).rail,
    "connect_transfer",
  );
  assert.equal(
    decidePayoutRail({ talentCryptoOptIn: true, gpActive: true, countryEligible: false }).rail,
    "connect_transfer",
  );
  assert.equal(
    decidePayoutRail({ talentCryptoOptIn: false, gpActive: true, countryEligible: true }).rail,
    "connect_transfer",
  );
});

test("decidePayoutRail: platform switch=connect forces Connect even when opted-in + GP active + eligible", () => {
  assert.equal(
    decidePayoutRail({
      activePayoutSystem: "connect",
      talentCryptoOptIn: true,
      gpActive: true,
      countryEligible: true,
    }).rail,
    "connect_transfer",
  );
  // switch=global_payouts + crypto opt-in still rides Connect (USDC auto-converts).
  assert.equal(
    decidePayoutRail({
      activePayoutSystem: "global_payouts",
      talentCryptoOptIn: true,
      gpActive: true,
      countryEligible: true,
    }).rail,
    "connect_transfer",
  );
});

function fakeSb(
  tp: { crypto_payouts_enabled?: boolean; residence_country_id?: string | null } | null,
  countryIso2?: string,
  onFrom?: (table: string) => void,
): SupabaseClient {
  const make = (table: string) => {
    onFrom?.(table);
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => {
        if (table === "talent_profiles") return { data: tp, error: null };
        if (table === "countries") return { data: countryIso2 ? { iso2: countryIso2 } : null, error: null };
        return { data: null, error: null };
      },
    };
    return chain;
  };
  return { from: (t: string) => make(t) } as unknown as SupabaseClient;
}

test("resolver: platform switch=connect forces connect, never touches profile or GP", async () => {
  let profileRead = false;
  let gpChecked = false;
  const rail = await resolveTalentPayoutRail("tp1", {
    sb: fakeSb({ crypto_payouts_enabled: true, residence_country_id: "mx-id" }, "MX", (t) => {
      if (t === "talent_profiles") profileRead = true;
    }),
    activePayoutSystem: async () => "connect",
    gpActive: async () => {
      gpChecked = true;
      return true;
    },
  });
  assert.equal(rail, "connect_transfer");
  assert.equal(profileRead, false, "switch=connect short-circuits before any DB read");
  assert.equal(gpChecked, false, "switch=connect short-circuits before the GP-active check");
});

test("resolver: not opted in → connect_transfer (no GP check)", async () => {
  let gpChecked = false;
  const rail = await resolveTalentPayoutRail("tp1", {
    sb: fakeSb({ crypto_payouts_enabled: false, residence_country_id: "mx-id" }),
    activePayoutSystem: GP,
    gpActive: async () => {
      gpChecked = true;
      return true;
    },
  });
  assert.equal(rail, "connect_transfer");
  assert.equal(gpChecked, false, "short-circuits before the GP-active check");
});

test("resolver: opted in (USDC) + GP active + MX → connect_transfer (USDC via Connect)", async () => {
  // USDC correction: a crypto-opted-in talent in an eligible country with GP active
  // resolves to connect_transfer — the USD Connect transfer auto-converts to USDC,
  // so the crypto opt-in does NOT route to v2 global_payouts.
  const rail = await resolveTalentPayoutRail("tp1", {
    sb: fakeSb({ crypto_payouts_enabled: true, residence_country_id: "mx-id" }, "MX"),
    activePayoutSystem: GP,
    gpActive: async () => true,
  });
  assert.equal(rail, "connect_transfer");
});

test("resolver: opted in but GP not active → connect_transfer", async () => {
  const rail = await resolveTalentPayoutRail("tp1", {
    sb: fakeSb({ crypto_payouts_enabled: true, residence_country_id: "mx-id" }, "MX"),
    activePayoutSystem: GP,
    gpActive: async () => false,
  });
  assert.equal(rail, "connect_transfer");
});

test("resolver: opted in + GP active but ineligible country (BR) → connect_transfer", async () => {
  const rail = await resolveTalentPayoutRail("tp1", {
    sb: fakeSb({ crypto_payouts_enabled: true, residence_country_id: "br-id" }, "BR"),
    activePayoutSystem: GP,
    gpActive: async () => true,
  });
  assert.equal(rail, "connect_transfer");
});

test("resolver: no profile row → connect_transfer", async () => {
  const rail = await resolveTalentPayoutRail("tp1", {
    sb: fakeSb(null),
    activePayoutSystem: GP,
    gpActive: async () => true,
  });
  assert.equal(rail, "connect_transfer");
});
