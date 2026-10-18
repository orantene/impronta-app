/**
 * TUL-1068 / TUL-1070 two-tenant regression: a guest's cart can hold a talent from
 * ANOTHER tenant (hub TAL-93940). The talent chip must never write it into this
 * tenant's inquiry.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { scopeChipTalentToRoster } from "./guest-chip-talent-scope";
import type { GuestChipValue } from "./guest-chat-contract";

// Tenant A (qa-paid-owner) roster vs the hub's.
const ROSTER: Record<string, string[]> = {
  "tenant-a": ["a1", "a2"],
  hub: ["max-93940", "a1x"],
};
const onRoster = (tenant: string) => async (ids: string[]) => ids.filter((id) => ROSTER[tenant]!.includes(id));

test("a hub talent in the guest's cart is dropped from tenant A's inquiry", async () => {
  const value = { selectedIds: ["a1", "max-93940"], selectedNames: ["A One", "QA Fixture - Max Talent"] } as GuestChipValue;
  const out = (await scopeChipTalentToRoster(value, onRoster("tenant-a"))) as { selectedIds: string[]; selectedNames?: string[] };
  assert.deepEqual(out.selectedIds, ["a1"]);
  assert.equal(out.selectedNames, undefined, "names are no longer aligned once an id is dropped");
});

test("the same cart on the hub keeps the hub talent (each tenant sees only its own)", async () => {
  const value = { selectedIds: ["a1", "max-93940"] } as GuestChipValue;
  const out = (await scopeChipTalentToRoster(value, onRoster("hub"))) as { selectedIds: string[] };
  assert.deepEqual(out.selectedIds, ["max-93940"]);
});

test("an all-valid selection is returned untouched (names kept)", async () => {
  const value = { selectedIds: ["a1", "a2"], selectedNames: ["A One", "A Two"] } as GuestChipValue;
  assert.equal(await scopeChipTalentToRoster(value, onRoster("tenant-a")), value);
});

test("an empty selection stays empty and never asks the roster", async () => {
  let asked = false;
  const out = await scopeChipTalentToRoster({ selectedIds: [] } as GuestChipValue, async (ids) => ((asked = true), ids));
  assert.deepEqual((out as { selectedIds: string[] }).selectedIds, []);
  assert.equal(asked, false);
});

test("wiring: the public layout seeds an agency page's cart from that tenant's roster only", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(public)/layout.tsx"), "utf8");
  assert.match(src, /ctx\.kind === "agency" && tenantId && savedIds\.length > 0/);
  assert.match(src, /filterTalentIdsOnTenantRoster\(admin, tenantId, savedIds\)/);
});

test("wiring: captureGuestChip scopes the talent chip to the inquiry tenant's roster before merging", () => {
  const src = readFileSync(join(process.cwd(), "src/app/t/[profileCode]/_actions/guest-detail-chips-actions.ts"), "utf8");
  assert.match(src, /scopeChipTalentToRoster\(input\.value/);
  assert.match(src, /filterTalentIdsOnTenantRoster\(admin, inquiry\.tenantId, ids\)/);
  assert.match(src, /mergeChipIntoQuery\(\s*inquiry\.interpretedQuery,\s*chipInput,/);
});
