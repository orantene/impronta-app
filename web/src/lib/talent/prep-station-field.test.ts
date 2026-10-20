/**
 * TUL-1271 #5: the kitchen station is set in Catalog (Fulfillment tab) and
 * written to talent_offerings.prep_station_id (the column already exists).
 *
 * Run: node_modules/.bin/tsx --test src/lib/talent/prep-station-field.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { blankOffering, offeringToRowPatch, rowToOffering, type TalentOfferingRow } from "./offerings-types";

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

test("rowToOffering carries the station; absent stays undefined", () => {
  assert.equal(rowToOffering(row({ prep_station_id: "s1" })).prepStationId, "s1");
  assert.equal(rowToOffering(row({ prep_station_id: null })).prepStationId, null);
  assert.equal(rowToOffering(row()).prepStationId, undefined);
});

test("offeringToRowPatch writes prep_station_id only when the item carries it (a clear writes null)", () => {
  const o = rowToOffering(row({ prep_station_id: "s1" }));
  assert.equal(offeringToRowPatch(o).prep_station_id, "s1");
  assert.equal(offeringToRowPatch({ ...o, prepStationId: null }).prep_station_id, null);
  const blank = blankOffering({ kind: "workspace", tenantId: "t1" }, "USD", 0);
  assert.equal("prep_station_id" in offeringToRowPatch(blank), false);
});

test("the Fulfillment tab lists the workspace's stations and patches the item", () => {
  const src = readFileSync(
    new URL("../../components/admin/shell/internal/page-modules/catalog/item-tab-availability.tsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /prepStationsList/);
  assert.match(src, /patch\?\.\(\{ prepStationId:/);
  assert.match(src, /data-testid="catalog-field-station"/);
});
