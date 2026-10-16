import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { attachTalentPromoBadges, loadTalentPromoBadges } from "./talent-promo-badges.server";
import type { TalentPromoBadge } from "./talent-promo-badge";

const NOW = new Date("2026-10-14T18:00:00Z");
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;
const row = (over: Row = {}): Row => ({
  id: "p1", tenant_id: "t1", code: null, name: "Launch", label: null, kind: "percent", offer_kind: "percent", value: 20,
  currency: "MXN", addon_id: null, scope_kind: "all", min_subtotal_cents: null, audience: "public", customer_id: null,
  is_single_use: false, unlock: "auto", link_slug: null, applies_on: "purchase", starts_at: null, ends_at: null,
  use_by_date: null, tz: "America/Mexico_City", weekdays: null, time_from: null, time_to: null, slot_id: null,
  max_redemptions: null, per_customer_limit: 1, deposit_required: false, show_on_site: true, show_countdown: false,
  title_i18n: { en: "Launch week" }, description_i18n: null, visual_style: null, template_key: null, is_active: true,
  is_draft: false, is_paused: false, archived_at: null, is_trial: false, parent_promo_id: null, created_at: "2026-10-01T00:00:00Z",
  talent_profile_id: ME, ...over,
});

function fake(rows: Row[], error: { message: string } | null = null) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const client = {
    from(table: string) {
      const call = { table, filters: [] as Array<[string, unknown]> };
      calls.push(call);
      const q = {
        select: () => q,
        in: (c: string, v: unknown) => (call.filters.push([`in:${c}`, v]), q),
        eq: (c: string, v: unknown) => (call.filters.push([`eq:${c}`, v]), q),
        then: (res: (v: unknown) => unknown) => res({ data: error ? null : rows, error }),
      };
      return q;
    },
  };
  return { admin: client as unknown as SupabaseClient, calls };
}

test("batched: ONE query for the whole page, owner-filtered, no N+1", async () => {
  const { admin, calls } = fake([row(), row({ id: "p2", talent_profile_id: OTHER, value: 10 })]);
  const out = await loadTalentPromoBadges(admin, [ME, OTHER, ME], NOW, "en");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.table, "tenant_promo_codes");
  assert.deepEqual(calls[0]?.filters.find(([k]) => k === "in:talent_profile_id")?.[1], [ME, OTHER]);
  assert.equal(out.get(ME)?.label, "-20%");
  assert.equal(out.get(ME)?.line, "Launch week");
  assert.equal(out.get(OTHER)?.label, "-10%");
});

test("never shows another talent's promo, an agency-wide one, or a row that was not asked for", async () => {
  const { admin } = fake([row({ talent_profile_id: OTHER }), row({ id: "p3", talent_profile_id: null })]);
  const out = await loadTalentPromoBadges(admin, [ME], NOW);
  assert.equal(out.size, 0);
});

test("only live, public, auto, uncapped percent offers badge; the best percent wins", async () => {
  const { admin } = fake([
    row({ id: "code", unlock: "code", code: "LUZ" }),
    row({ id: "personal", audience: "one_client", customer_id: "c" }),
    row({ id: "hidden", show_on_site: false }),
    row({ id: "draft", is_draft: true }),
    row({ id: "ended", ends_at: "2026-10-01" }),
    row({ id: "future", starts_at: "2026-11-01" }),
    row({ id: "capped", max_redemptions: 5, value: 90 }),
    row({ id: "fixed", offer_kind: "fixed", kind: "fixed", value: 5000 }),
    row({ id: "small", value: 10 }),
    row({ id: "big", value: 30 }),
  ]);
  const out = await loadTalentPromoBadges(admin, [ME], NOW);
  assert.equal(out.get(ME)?.promoId, "big");
  assert.equal(out.get(ME)?.label, "-30%");
});

test("Spanish copy and a failed read degrades to no badges", async () => {
  const es = await loadTalentPromoBadges(fake([row({ offer_kind: "free_addon", kind: "free_addon", addon_id: "a1" })]).admin, [ME], NOW, "es");
  assert.equal(es.get(ME)?.label, "Regalo incluido");
  const bad = await loadTalentPromoBadges(fake([], { message: "boom" }).admin, [ME], NOW);
  assert.equal(bad.size, 0);
  assert.equal((await loadTalentPromoBadges(fake([]).admin, [], NOW)).size, 0);
});

type Item = { id: string; promoBadge?: TalentPromoBadge | null };
const cards = (): Item[] => [{ id: ME }, { id: OTHER }];

test("hub: the badge shows with a live promo and is absent without one", async () => {
  const withPromo = cards();
  await attachTalentPromoBadges(withPromo, { tenantScopeId: null, locale: "en", now: NOW, admin: fake([row()]).admin });
  assert.equal(withPromo[0]?.promoBadge?.label, "-20%");
  assert.equal(withPromo[1]?.promoBadge, undefined, "the other talent has no promo of their own");
  const none = cards();
  await attachTalentPromoBadges(none, { tenantScopeId: null, locale: "en", now: NOW, admin: fake([]).admin });
  assert.ok(none.every((c) => c.promoBadge === undefined));
});

test("agency: hidden when the setting is off (and the promo table is never read), shown when on", async () => {
  const off = fake([row()]);
  const a = cards();
  await attachTalentPromoBadges(a, { tenantScopeId: "tenant-1", locale: "en", now: NOW, admin: off.admin, agencyOptIn: async () => false });
  assert.ok(a.every((c) => c.promoBadge === undefined));
  assert.equal(off.calls.length, 0);
  const on = cards();
  await attachTalentPromoBadges(on, { tenantScopeId: "tenant-1", locale: "en", now: NOW, admin: fake([row()]).admin, agencyOptIn: async () => true });
  assert.equal(on[0]?.promoBadge?.label, "-20%");
  assert.equal(on[1]?.promoBadge, undefined);
});

test("a throwing opt-in lookup or missing admin client leaves the cards untouched", async () => {
  const a = cards();
  await attachTalentPromoBadges(a, { tenantScopeId: "t", locale: "en", agencyOptIn: async () => { throw new Error("x"); } });
  await attachTalentPromoBadges(a, { tenantScopeId: null, locale: "en", admin: null });
  assert.ok(a.every((c) => c.promoBadge === undefined));
});
