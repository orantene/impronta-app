/**
 * payout-rail-policy — rail decision + DB-backed resolver unit tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decidePayoutRail, resolveTalentPayoutRail } from "@/lib/payments/payout-rail-policy";

test("decidePayoutRail: GP only when opted-in + GP active + eligible country", () => {
  assert.equal(
    decidePayoutRail({ talentCryptoOptIn: true, gpActive: true, countryEligible: true }).rail,
    "global_payouts",
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

function fakeSb(
  tp: { crypto_payouts_enabled?: boolean; residence_country_id?: string | null } | null,
  countryIso2?: string,
): SupabaseClient {
  const make = (table: string) => {
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

test("resolver: not opted in → connect_transfer (no GP check)", async () => {
  let gpChecked = false;
  const rail = await resolveTalentPayoutRail("tp1", {
    sb: fakeSb({ crypto_payouts_enabled: false, residence_country_id: "mx-id" }),
    gpActive: async () => {
      gpChecked = true;
      return true;
    },
  });
  assert.equal(rail, "connect_transfer");
  assert.equal(gpChecked, false, "short-circuits before the GP-active check");
});

test("resolver: opted in + GP active + MX → global_payouts", async () => {
  const rail = await resolveTalentPayoutRail("tp1", {
    sb: fakeSb({ crypto_payouts_enabled: true, residence_country_id: "mx-id" }, "MX"),
    gpActive: async () => true,
  });
  assert.equal(rail, "global_payouts");
});

test("resolver: opted in but GP not active → connect_transfer", async () => {
  const rail = await resolveTalentPayoutRail("tp1", {
    sb: fakeSb({ crypto_payouts_enabled: true, residence_country_id: "mx-id" }, "MX"),
    gpActive: async () => false,
  });
  assert.equal(rail, "connect_transfer");
});

test("resolver: opted in + GP active but ineligible country (BR) → connect_transfer", async () => {
  const rail = await resolveTalentPayoutRail("tp1", {
    sb: fakeSb({ crypto_payouts_enabled: true, residence_country_id: "br-id" }, "BR"),
    gpActive: async () => true,
  });
  assert.equal(rail, "connect_transfer");
});

test("resolver: no profile row → connect_transfer", async () => {
  const rail = await resolveTalentPayoutRail("tp1", { sb: fakeSb(null), gpActive: async () => true });
  assert.equal(rail, "connect_transfer");
});
