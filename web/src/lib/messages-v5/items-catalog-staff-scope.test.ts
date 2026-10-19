/**
 * TUL-1347: staff quote on-request / agency-only services from Messages. The
 * staff items picker lists published + approved services whatever their
 * visibility; the guest dock stays strictly published + approved + public.
 * Source: docs/plans/tul1336-chat-intent-links-verification-2026-10-19.md (gap 4).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { loadOfferingRows, loadTalentProfileOfferingRows } from "./items-catalog";

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>) {
  function query(table: string) {
    let rows = [...(tables[table] ?? [])];
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => ((rows = rows.filter((r) => r[col] === v)), q),
      in: (col: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[col]))), q),
      order: () => q,
      limit: () => q,
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return q;
  }
  return { from: (table: string) => query(table) } as never;
}

const o = (id: string, over: Row): Row => ({
  id, tenant_id: "t", talent_profile_id: "p1", title: id, kind: "service", amount_cents: 5000, currency: "USD",
  status: "published", moderation_state: "approved", visibility: "public",
  inventory_qty: null, capacity_pool_id: null, duration_minutes: 60, sort_order: 1, ...over,
});

const TABLES = {
  talent_offerings: [
    o("public", {}),
    o("on_request", { visibility: "on_request" }),
    o("agency_only", { visibility: "agency_only" }),
    o("pending", { moderation_state: "pending" }),
    o("rejected", { moderation_state: "rejected" }),
    o("draft", { status: "draft" }),
  ],
};

test("guest scope (default) still lists only public services", async () => {
  const rows = await loadOfferingRows(fakeAdmin(TABLES), "t");
  assert.deepEqual(rows.map((r) => r.title), ["public"]);
});

test("staff scope lists on_request and agency_only, but never unapproved or unpublished", async () => {
  const rows = await loadOfferingRows(fakeAdmin(TABLES), "t", "staff");
  assert.deepEqual(rows.map((r) => r.title).sort(), ["agency_only", "on_request", "public"]);
});

test("staff scope applies to the per-talent reader too; guest does not widen", async () => {
  const staff = await loadTalentProfileOfferingRows(fakeAdmin(TABLES), "t", "p1", "staff");
  assert.deepEqual(staff.map((r) => r.title).sort(), ["agency_only", "on_request", "public"]);
  const guest = await loadTalentProfileOfferingRows(fakeAdmin(TABLES), "t", "p1");
  assert.deepEqual(guest.map((r) => r.title), ["public"]);
});

test("only the staff Messages picker passes the staff scope; the guest dock never does", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const staffSrc = readFileSync(join(here, "../server-actions/messaging-items.ts"), "utf8");
  assert.match(staffSrc, /loadItemsCatalog\(admin, \{ tenantId, inquiryId, scope: "staff" \}\)/);
  const guestSrc = readFileSync(join(here, "../../app/t/[profileCode]/_actions/guest-catalog-actions.ts"), "utf8");
  assert.doesNotMatch(guestSrc, /scope:\s*"staff"/);
});
