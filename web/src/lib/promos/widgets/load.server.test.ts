import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fakeAdmin, type Row } from "@/lib/storefront/__fixtures__/fake-admin";

import { loadPromoWidgetDataWith } from "./load.server";

const T = "00000000-0000-4000-8000-000000000001";
const ME = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
const NOW = new Date("2026-10-14T18:00:00Z");
const row = (id: string, over: Partial<Row> = {}): Row => ({
  id, tenant_id: T, talent_profile_id: ME, code: null, kind: "percent", offer_kind: "percent", value: 20, currency: "MXN",
  scope_kind: "all", audience: "public", unlock: "auto", applies_on: "purchase", tz: "America/Mexico_City",
  per_customer_limit: 1, is_active: true, is_draft: false, is_paused: false, archived_at: null, show_on_site: true,
  show_countdown: true, title_i18n: { es: "Semana" }, created_at: "2026-10-01T00:00:00Z", max_redemptions: null, ...over,
});

test("only this talent's live, non-personal promos reach a widget", async () => {
  const { admin } = fakeAdmin({
    tenant_promo_codes: [
      row("mine"),
      row("theirs", { talent_profile_id: OTHER }),
      row("agency", { talent_profile_id: null }),
      row("paused", { is_paused: true }),
      row("ended", { ends_at: "2026-10-01" }),
      row("soldout", { max_redemptions: 1 }),
      row("personal", { audience: "one_client", customer_id: "c1" }),
      row("coded", { unlock: "code", code: "luz10", show_on_site: false }),
    ],
    tenant_promo_redemptions: [{ promo_code_id: "soldout", customer_id: null, status: "confirmed", hold_expires_at: null }],
    promo_targets: [],
  });
  const r = await loadPromoWidgetDataWith(admin as unknown as SupabaseClient, T, ME, NOW);
  assert.deepEqual(r.items.map((p) => p.id).sort(), ["coded", "mine"]);
  const coded = r.items.find((p) => p.id === "coded");
  assert.equal(coded?.code, "LUZ10");
  assert.equal(coded?.showOnSite, false);
  assert.equal(r.items.find((p) => p.id === "mine")?.showCountdown, true);
  assert.equal(r.nowMs, NOW.getTime());
});

test("a failed read degrades to no promos", async () => {
  const broken = {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ order: async () => ({ data: null, error: { message: "down" } }) }), order: async () => ({ data: null, error: { message: "down" } }), is: () => ({ order: async () => ({ data: null, error: { message: "down" } }) }) }),
      }),
    }),
  } as unknown as SupabaseClient;
  const r = await loadPromoWidgetDataWith(broken, T, ME, NOW);
  assert.deepEqual(r.items, []);
});
