import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAccountCouponParams } from "./subscription-discounts";
import { loadAccountDiscountLocale } from "./account-discount-locale";

function fakeAdmin(rows: Record<string, Record<string, unknown> | null>, boom = false): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (boom) throw new Error("db down");
            return { data: rows[table] ?? null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

test("talent grants read talent_profiles.preferred_locale", async () => {
  const admin = fakeAdmin({ talent_profiles: { preferred_locale: "es" } });
  assert.equal(await loadAccountDiscountLocale(admin, { tenantId: null, talentProfileId: "t1" }), "es");
});

test("workspace grants read agency_business_identity.default_locale", async () => {
  const admin = fakeAdmin({ agency_business_identity: { default_locale: "es" } });
  assert.equal(await loadAccountDiscountLocale(admin, { tenantId: "w1", talentProfileId: null }), "es");
});

test("missing row or a db error falls back to null (English)", async () => {
  assert.equal(await loadAccountDiscountLocale(fakeAdmin({}), { tenantId: "w1", talentProfileId: null }), null);
  assert.equal(await loadAccountDiscountLocale(fakeAdmin({}, true), { tenantId: "w1", talentProfileId: null }), null);
});

test("the loaded locale names the coupon in the customer's language", async () => {
  const admin = fakeAdmin({ talent_profiles: { preferred_locale: "es" } });
  const locale = await loadAccountDiscountLocale(admin, { tenantId: null, talentProfileId: "t1" });
  const params = buildAccountCouponParams({
    id: "d1", subjectType: "talent", tenantId: null, talentProfileId: "t1",
    kind: "percent", value: 20, currency: null, duration: "forever", durationMonths: null, locale,
  });
  assert.equal(params.name, "20% de descuento");
});
