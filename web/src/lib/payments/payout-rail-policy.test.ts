/**
 * payout-rail-policy — rail decision + DB-backed resolver unit tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decidePayoutRail, resolveTalentPayoutRail } from "@/lib/payments/payout-rail-policy";

const GP = async () => "global_payouts" as const;

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
  // explicit global_payouts keeps the legacy decision
  assert.equal(
    decidePayoutRail({
      activePayoutSystem: "global_payouts",
      talentCryptoOptIn: true,
      gpActive: true,
      countryEligible: true,
    }).rail,
    "global_payouts",
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

test("resolver: opted in + GP active + MX → global_payouts", async () => {
  const rail = await resolveTalentPayoutRail("tp1", {
    sb: fakeSb({ crypto_payouts_enabled: true, residence_country_id: "mx-id" }, "MX"),
    activePayoutSystem: GP,
    gpActive: async () => true,
  });
  assert.equal(rail, "global_payouts");
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
