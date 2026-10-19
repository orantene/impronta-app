/**
 * A3 (TUL-1068/1070): guest-facing roster reads share ONE scope
 * (`scopeToGuestVisibleRoster`). A new guest read that re-derives
 * "this tenant, active, visible" by hand is how the leak came back.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");

test("the shared helper is defined once, in talent-roster.ts, with all four conditions", () => {
  const src = read("src/lib/saas/talent-roster.ts");
  assert.match(src, /export function scopeToGuestVisibleRoster/);
  const body = src.slice(src.indexOf("export function scopeToGuestVisibleRoster"), src.indexOf("export async function filterTalentIdsOnTenantRoster"));
  for (const frag of ['"tenant_id", tenantId', '"status", "active"', '"agency_visibility"', '"talent_site_hidden", false']) assert.ok(body.includes(frag), frag);
});

test("the directory/chip helpers and the Concierge reads all go through it", () => {
  assert.equal((read("src/lib/saas/talent-roster.ts").match(/scopeToGuestVisibleRoster\(/g) ?? []).length >= 3, true);
  assert.match(read("src/lib/messages-v5/items-catalog.ts"), /scopeToGuestVisibleRoster\(/);
  const sf = read("src/lib/home/default-storefront-roster.ts");
  assert.ok((sf.match(/scopeToGuestVisibleRoster\(/g) ?? []).length >= 2, "picker (guestVisibleOnly) and cart portraits");
  assert.match(read("src/app/t/[profileCode]/_actions/guest-roster-actions.ts"), /guestVisibleOnly: true/);
});

test("the guest chip action filters the cart through the roster before it writes", () => {
  assert.match(read("src/app/t/[profileCode]/_actions/guest-detail-chips-actions.ts"), /filterTalentIdsOnTenantRoster\(admin, inquiry\.tenantId, ids\)/);
});
