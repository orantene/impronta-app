/**
 * TUL-1271 #3: the POS switch is its own flag (`talent_offerings.pos_enabled`),
 * separate from `status`. Code works BEFORE the held migration is applied:
 * a row without the key reads as "on" and writes nothing for it.
 *
 * Run: node_modules/.bin/tsx --test src/lib/pos/pos-enabled.test.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { offeringToRowPatch, rowToOffering, blankOffering, type TalentOfferingRow } from "@/lib/talent/offerings-types";
import { isPosSellable, isMissingColumnError, posOffIds } from "./pos-enabled";

function row(patch: Partial<TalentOfferingRow> = {}): TalentOfferingRow {
  return {
    id: "o1", talent_profile_id: null, owner_kind: "workspace", tenant_id: "t1", kind: "product", title: "Latte",
    description: null, price_type: "flat_package", price_display: "exact", amount_cents: 500, currency: "USD",
    booking_mode: "instant", reserve_mode: "full", deposit_pct: null, allow_pay_in_person: false,
    cancellation_hours: null, free_reserve_expires_days: null, duration_minutes: null, category: null,
    inventory_qty: null, status: "published", visibility: "public", moderation_state: "approved",
    is_featured: false, sort_order: 0, attributes: {}, title_i18n: null, description_i18n: null, ...patch,
  };
}

test("isPosSellable: published and not switched off; a row without the flag counts as on", () => {
  assert.equal(isPosSellable({ status: "published" }), true);
  assert.equal(isPosSellable({ status: "published", pos_enabled: true }), true);
  assert.equal(isPosSellable({ status: "published", pos_enabled: false }), false);
  assert.equal(isPosSellable({ status: "draft", pos_enabled: true }), false);
});

test("rowToOffering reads the flag; absent stays undefined (migration not applied)", () => {
  assert.equal(rowToOffering(row({ pos_enabled: false })).posEnabled, false);
  assert.equal(rowToOffering(row({ pos_enabled: true })).posEnabled, true);
  assert.equal(rowToOffering(row()).posEnabled, undefined);
});

test("offeringToRowPatch writes pos_enabled only when the row carried it", () => {
  const o = rowToOffering(row({ pos_enabled: false }));
  assert.equal(offeringToRowPatch(o).pos_enabled, false);
  const legacy = blankOffering({ kind: "workspace", tenantId: "t1" }, "USD", 0);
  assert.equal("pos_enabled" in offeringToRowPatch(legacy), false);
});

test("isMissingColumnError recognises the Postgres and PostgREST codes", () => {
  assert.equal(isMissingColumnError({ code: "42703" }), true);
  assert.equal(isMissingColumnError({ code: "PGRST204" }), true);
  assert.equal(isMissingColumnError({ code: "23505" }), false);
  assert.equal(isMissingColumnError(null), false);
});

test("the counter channels honour the flag; the shared addLine does NOT (QR, door, class and quotes sell POS-off items)", () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(src("../../app/(workspace)/[tenantSlug]/admin/pos/counter-catalog.ts"), /isPosSellable/);
  assert.match(src("../../app/(workspace)/[tenantSlug]/admin/pos/actions.ts"), /posOffIds/);
  assert.match(src("./classes/walkin.ts"), /posOffIds/);
  assert.doesNotMatch(src("./draft.ts"), /pos_enabled|isPosSellable|posOffIds/);
});

test("posOffIds: only rows with pos_enabled = false; a missing column or an error means nobody is off", async () => {
  const reader = (result: { data: unknown; error: { code?: string | null } | null }) => ({
    from: () => ({ select: () => ({ eq: () => ({ in: async () => result }) }) }),
  });
  const off = await posOffIds(reader({ data: [{ id: "a", pos_enabled: false }, { id: "b", pos_enabled: true }, { id: "c" }], error: null }), "t", ["a", "b", "c"]);
  assert.deepEqual([...off], ["a"]);
  assert.equal((await posOffIds(reader({ data: null, error: { code: "42703" } }), "t", ["a"])).size, 0);
  assert.equal((await posOffIds(reader({ data: [], error: null }), "t", [])).size, 0);
});

test("a held migration adds the column additively with a rollback", () => {
  const dir = new URL("../../../../supabase/migrations/_pending_pm/", import.meta.url);
  const file = readdirSync(dir).find((f) => /talent_offerings_pos_enabled/.test(f));
  assert.ok(file, "held migration missing");
  const sql = readFileSync(new URL(file!, dir), "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS pos_enabled boolean NOT NULL DEFAULT true/);
  assert.match(sql, /ROLLBACK/);
});
