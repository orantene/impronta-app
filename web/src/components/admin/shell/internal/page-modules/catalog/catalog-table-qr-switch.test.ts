/**
 * TUL-1916: the Table QR channel row is wired to table_qr_enabled.
 *
 * Run: node_modules/.bin/tsx --test src/components/admin/shell/internal/page-modules/catalog/catalog-table-qr-switch.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { blankOffering, offeringToRowPatch, rowToOffering, type TalentOffering } from "@/lib/talent/offerings-types";
import { isTableQrOn, tableQrColumnPresent, tableQrSwitchPatch } from "./catalog-table-qr-switch";

function item(patch: Partial<TalentOffering> = {}): TalentOffering {
  return { ...blankOffering({ kind: "workspace", tenantId: "t1" }, "USD", 0), id: "o1", title: "Latte", amountCents: 500, ...patch };
}

test("the switch writes the flag alone, never status", () => {
  assert.deepEqual(tableQrSwitchPatch(item({ tableQrEnabled: false }), true, { columnPresent: true }), { tableQrEnabled: true });
  assert.deepEqual(tableQrSwitchPatch(item({ tableQrEnabled: true }), false, { columnPresent: true }), { tableQrEnabled: false });
  // A draft stores the flag too (same rule as POS); it only reads as on once published.
  assert.deepEqual(tableQrSwitchPatch(item({ status: "draft" }), true, { columnPresent: true }), { tableQrEnabled: true });
});

test("before the column exists the switch writes nothing", () => {
  assert.deepEqual(tableQrSwitchPatch(item(), true, { columnPresent: false }), {});
  assert.equal(tableQrColumnPresent([item(), item()]), false);
  assert.equal(tableQrColumnPresent([item(), item({ tableQrEnabled: false })]), true);
});

test("reads as on only when published and switched on", () => {
  assert.equal(isTableQrOn(item({ status: "published", tableQrEnabled: true })), true);
  assert.equal(isTableQrOn(item({ status: "published", tableQrEnabled: false })), false);
  assert.equal(isTableQrOn(item({ status: "draft", tableQrEnabled: true })), false);
  assert.equal(isTableQrOn(item({ status: "published" })), false);
});

test("row mapping round-trips table_qr_enabled and omits it when the row lacks it", () => {
  const base = offeringToRowPatch(item({ tableQrEnabled: true }));
  assert.equal(base.table_qr_enabled, true);
  assert.equal("table_qr_enabled" in offeringToRowPatch(item()), false);
  const row = { ...offeringToRowPatch(item({ tableQrEnabled: false })), id: "o1" } as unknown as Parameters<typeof rowToOffering>[0];
  assert.equal(rowToOffering(row).tableQrEnabled, false);
});

test("the Channels tab and side card use the Table QR switch, not a hardcoded off row", () => {
  const src = readFileSync(new URL("./item-tab-channels.tsx", import.meta.url), "utf8");
  assert.match(src, /tableQrSwitchPatch\(/);
  assert.match(src, /catalog-channel-table-qr/);
  assert.match(src, /isTableQrOn\(item\)/);
  assert.doesNotMatch(src, /channels\.tableQr"\)\} note=\{t\("dashboard\.catalog\.channels\.tableQrNote"\)\} on=\{false\}/);
  assert.doesNotMatch(src, /name=\{t\("dashboard\.catalog\.channels\.tableQr"\)\} value=\{t\("dashboard\.catalog\.dash"\)\} reason/);
});

test("the Table QR note exists in en and es", () => {
  for (const l of ["en", "es"]) {
    const m = JSON.parse(readFileSync(new URL(`../../../../../../../messages/${l}.json`, import.meta.url), "utf8"));
    const ch = m.dashboard.catalog.channels;
    assert.ok(ch.tableQrDraft && ch.tableQrNote, l);
    assert.doesNotMatch(ch.tableQrDraft, /—/);
  }
});
