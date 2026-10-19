import assert from "node:assert/strict";
import { test } from "node:test";

import { publicOfferingsScope } from "./hub-profile-offerings";
import { selectPublicOfferingRows, type PublicOfferingRowsDb } from "./offerings-public-rows";
import { offeringPriceLabel, rowToOffering, type TalentOfferingRow } from "./offerings-types";

// TUL-1272 loader level: what loadPublicOfferingsForProfile reads for a hub
// tenant vs an agency tenant, against a fake table that applies the filters.

const HUB = "00000000-0000-0000-0000-000000000002";
const WORKSPACE = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const TP = "33330003-0000-4000-8000-000000000001";

const base = {
  talent_profile_id: TP,
  owner_kind: "talent",
  tenant_id: WORKSPACE,
  kind: "service",
  status: "published",
  moderation_state: "approved",
  visibility: "public",
  price_type: "fixed",
  amount_cents: 45000,
  currency: "MXN",
  sort_order: 0,
};

const TABLE: Record<string, unknown>[] = [
  { ...base, id: "ws-public" },
  { ...base, id: "ws-on-request", visibility: "on_request", sort_order: 1 },
  { ...base, id: "ws-agency-only", visibility: "agency_only" },
  { ...base, id: "ws-pending", moderation_state: "pending" },
  { ...base, id: "ws-draft", status: "draft" },
  { ...base, id: "other-tenant", tenant_id: OTHER, sort_order: 2 },
  // A business's own catalog row (cannot carry a talent id by constraint; the
  // fake ignores the constraint to prove the reader filters it anyway).
  { ...base, id: "biz-row", owner_kind: "workspace" },
  { ...base, id: "other-talent", talent_profile_id: "someone-else" },
];

function fakeDb(rows: Record<string, unknown>[]) {
  const calls: Array<[string, string, unknown]> = [];
  const db: PublicOfferingRowsDb = {
    from(table: string) {
      assert.equal(table, "talent_offerings");
      let current = rows;
      const q = {
        select() {
          return q;
        },
        eq(col: string, val: unknown) {
          calls.push(["eq", col, val]);
          current = current.filter((r) => r[col] === val);
          return q;
        },
        in(col: string, vals: unknown[]) {
          calls.push(["in", col, vals]);
          current = current.filter((r) => vals.includes(r[col]));
          return q;
        },
        order(col: string) {
          const sorted = [...current].sort((a, b) => Number(a[col]) - Number(b[col]));
          return Promise.resolve({ data: sorted, error: null });
        },
      };
      return q;
    },
  };
  return { db, calls };
}

test("hub tenant: a talent-owned row on a workspace tenant is read (and other tenants' talent rows)", async () => {
  const { db, calls } = fakeDb(TABLE);
  const scope = publicOfferingsScope({ tenantId: HUB, tenantKind: "hub" });
  const res = await selectPublicOfferingRows(db, TP, scope.filterTenantId);
  assert.equal(res.ok, true);
  assert.deepEqual(res.ok ? res.rows.map((r) => r.id) : [], ["ws-public", "ws-on-request", "other-tenant"]);
  assert.ok(!calls.some(([, col]) => col === "tenant_id"), "no tenant filter on the hub read");
});

test("agency tenant keeps its isolation", async () => {
  const { db, calls } = fakeDb(TABLE);
  const scope = publicOfferingsScope({ tenantId: WORKSPACE, tenantKind: "agency" });
  const res = await selectPublicOfferingRows(db, TP, scope.filterTenantId);
  assert.deepEqual(res.ok ? res.rows.map((r) => r.id) : [], ["ws-public", "ws-on-request"]);
  assert.ok(calls.some(([, col, val]) => col === "tenant_id" && val === WORKSPACE));
});

test("D-10: agency_only, pending, draft and workspace-owned rows are never read", async () => {
  const { db } = fakeDb(TABLE);
  const res = await selectPublicOfferingRows(db, TP, null);
  const ids = res.ok ? res.rows.map((r) => r.id) : [];
  for (const hidden of ["ws-agency-only", "ws-pending", "ws-draft", "biz-row", "other-talent"]) {
    assert.ok(!ids.includes(hidden), hidden);
  }
});

test("D-10a: the on_request row is read but prints no price digits", async () => {
  const { db } = fakeDb(TABLE);
  const res = await selectPublicOfferingRows(db, TP, null);
  const row = res.ok ? res.rows.find((r) => r.id === "ws-on-request") : undefined;
  assert.ok(row);
  const o = rowToOffering(row as TalentOfferingRow, "es", []);
  assert.doesNotMatch(offeringPriceLabel(o, "es"), /\d/);
});

test("a read error is reported, never treated as an empty catalog silently", async () => {
  const db: PublicOfferingRowsDb = {
    from() {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => Promise.resolve({ data: null, error: { message: "boom" } }),
      };
      return q;
    },
  };
  const res = await selectPublicOfferingRows(db, TP, null);
  assert.equal(res.ok, false);
});
