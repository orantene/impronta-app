import assert from "node:assert/strict";
import test from "node:test";

import type { TalentOfferingRow } from "@/lib/talent/offerings-types";
import { deriveWorkspaceMenuOfferings } from "@/lib/site-admin/server/native-data-block-sources";
import { fetchOwnerTalentIds, isWorkspaceOfferingRow, workspaceOfferingOrFilter } from "./workspace-offering-scope";

const TP = "11111111-1111-4111-8111-111111111111";
const OTHER_TP = "22222222-2222-4222-8222-222222222222";

function row(o: Partial<TalentOfferingRow> & { id: string; tenant_id: string }): TalentOfferingRow {
  return {
    talent_profile_id: null, owner_kind: "workspace", kind: "service", title: o.id, description: null,
    price_type: "flat_package", price_display: "exact", amount_cents: 2500, currency: "MXN",
    status: "published", moderation_state: "approved", sort_order: 0, visibility: "public", ...o,
  } as TalentOfferingRow;
}
const members = new Set([TP]);
const ids = (rows: TalentOfferingRow[], m: ReadonlySet<string> = members) => deriveWorkspaceMenuOfferings(rows, "ws1", "en", new Set(), m).map((d) => d.id);

test("'both' / solo business: the owner-provider rows (talent-owned, this tenant, owner) are read", () => {
  const rows = [row({ id: "a", tenant_id: "ws1", owner_kind: "talent", talent_profile_id: TP })];
  assert.deepEqual(ids(rows), ["a"]);
});

test("a roster-only talent's row in this tenant is excluded", () => {
  assert.deepEqual(ids([row({ id: "x", tenant_id: "ws1", owner_kind: "talent", talent_profile_id: OTHER_TP })]), []);
});

test("another tenant's rows are excluded, even for a member talent", () => {
  assert.deepEqual(ids([
    row({ id: "t", tenant_id: "ws2", owner_kind: "talent", talent_profile_id: TP }),
    row({ id: "h", tenant_id: "ws2" }),
  ]), []);
});

test("house rows still read with no member ids; talent rows need membership", () => {
  const rows = [row({ id: "h", tenant_id: "ws1" }), row({ id: "a", tenant_id: "ws1", owner_kind: "talent", talent_profile_id: TP })];
  assert.deepEqual(ids(rows, new Set()), ["h"]);
  assert.deepEqual(ids(rows).sort(), ["a", "h"]);
});

test("no duplicates: one owner-provider row per service yields one entry", () => {
  const out = ids([row({ id: "a", tenant_id: "ws1", owner_kind: "talent", talent_profile_id: TP })]);
  assert.equal(new Set(out).size, out.length);
  assert.equal(out.length, 1);
});

test("predicate and or-filter agree", () => {
  assert.equal(isWorkspaceOfferingRow({ tenant_id: "ws1", owner_kind: "talent", talent_profile_id: null }, "ws1", members), false);
  assert.equal(workspaceOfferingOrFilter(new Set()), "owner_kind.eq.workspace");
  assert.equal(workspaceOfferingOrFilter(new Set([TP, "x);drop"])), `owner_kind.eq.workspace,and(owner_kind.eq.talent,talent_profile_id.in.(${TP}))`);
});

test("agency with 3 roster talents and a separate owner: only the owner's talent rows are included", async () => {
  const OWNER = "33333333-3333-4333-8333-333333333333";
  const R1 = "44444444-4444-4444-8444-444444444441";
  const R2 = "44444444-4444-4444-8444-444444444442";
  const R3 = "44444444-4444-4444-8444-444444444443";
  const owner = await fetchOwnerTalentIds({}, "ws1", async () => OWNER);
  assert.deepEqual([...owner], [OWNER]);
  const rows = [OWNER, R1, R2, R3].map((tp, i) => row({ id: `r${i}`, tenant_id: "ws1", owner_kind: "talent", talent_profile_id: tp }));
  assert.deepEqual(ids(rows, owner), ["r0"]);
  assert.ok(!workspaceOfferingOrFilter(owner).includes(R1));
});

test("no owner resolved: house rows only", async () => {
  const owner = await fetchOwnerTalentIds({}, "ws1", async () => null);
  assert.equal(owner.size, 0);
  assert.deepEqual(ids([row({ id: "a", tenant_id: "ws1", owner_kind: "talent", talent_profile_id: TP })], owner), []);
});
