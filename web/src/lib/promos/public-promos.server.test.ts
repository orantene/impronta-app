import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fakeAdmin, type Row } from "@/lib/storefront/__fixtures__/fake-admin";

import { loadPublicPromosWith, talentPromoTenantId } from "./public-promos.server";

const T = "00000000-0000-4000-8000-000000000001";
const row = (id: string, over: Partial<Row> = {}): Row => ({
  id, tenant_id: T, code: null, kind: "percent", offer_kind: "percent", value: 20, currency: "MXN", scope_kind: "all",
  audience: "public", unlock: "auto", applies_on: "purchase", tz: "America/Mexico_City", per_customer_limit: 1,
  is_active: true, is_draft: false, is_paused: false, archived_at: null, show_on_site: true, show_countdown: true,
  title_i18n: { es: "Semana" }, created_at: "2026-10-01T00:00:00Z", max_redemptions: null, ...over,
});

test("only live, auto, show_on_site promos reach the public site", async () => {
  const { admin } = fakeAdmin({
    tenant_promo_codes: [
      row("live"),
      row("hidden", { show_on_site: false }),
      row("code", { unlock: "code", code: "X" }),
      row("paused", { is_paused: true }),
      row("ended", { ends_at: "2026-10-01" }),
      row("soldout", { max_redemptions: 1 }),
    ],
    tenant_promo_redemptions: [{ promo_code_id: "soldout", customer_id: null, status: "confirmed", hold_expires_at: null }],
    promo_targets: [],
  });
  const r = await loadPublicPromosWith(admin as unknown as SupabaseClient, T, new Date("2026-10-14T18:00:00Z"));
  assert.deepEqual(r.promos.map((p) => p.id), ["live"]);
  assert.equal(r.banners[0]?.showCountdown, true);
  assert.deepEqual(r.banners[0]?.title, { es: "Semana" });
});

test("a failed read degrades to no promos", async () => {
  const broken = {
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: null, error: { message: "down" } }) }) }) }),
  } as unknown as SupabaseClient;
  const r = await loadPublicPromosWith(broken, T, new Date());
  assert.equal(r.promos.length, 0);
});

test("the talent's promo tenant is the oldest active roster row", async () => {
  const { admin } = fakeAdmin({
    agency_talent_roster: [
      { talent_profile_id: "tp", tenant_id: "b", status: "active", created_at: "2026-02-01" },
      { talent_profile_id: "tp", tenant_id: "a", status: "active", created_at: "2026-01-01" },
      { talent_profile_id: "tp", tenant_id: "z", status: "removed", created_at: "2025-01-01" },
    ],
  });
  assert.equal(await talentPromoTenantId(admin as unknown as SupabaseClient, "tp"), "a");
});
