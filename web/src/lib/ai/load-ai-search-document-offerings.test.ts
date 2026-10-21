import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAiSearchDocumentOfferings } from "@/lib/ai/load-ai-search-document-offerings";

// TUL-1709: a workspace's own Menu items (owner_kind='workspace') have no
// talent_profile_id, so they never showed up in any talent's AI search
// document. They should appear in the document of the ONE talent profile
// that is the workspace's active owner (the same owner `resolveOwnerTalentProfileId`
// resolves the other way around, and the same owner TUL-1634's
// workspace-menu-side-effects.ts schedules a rebuild for after a Menu write).

type Row = Record<string, unknown>;

/** Filter-recording fake that really evaluates eq/in/order/limit/maybeSingle. */
class FakeQuery {
  private rows: Row[];
  private readonly erroring: boolean;
  private single = false;

  constructor(rows: Row[], erroring = false) {
    this.rows = rows;
    this.erroring = erroring;
  }

  select(_cols: string) {
    return this;
  }
  eq(col: string, val: unknown) {
    this.rows = this.rows.filter((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: readonly unknown[]) {
    this.rows = this.rows.filter((r) => vals.includes(r[col]));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    const asc = opts?.ascending !== false;
    this.rows = [...this.rows].sort((a, b) => {
      const av = a[col] as string | number;
      const bv = b[col] as string | number;
      if (av === bv) return 0;
      return av < bv ? (asc ? -1 : 1) : asc ? 1 : -1;
    });
    return this;
  }
  limit(n: number) {
    this.rows = this.rows.slice(0, n);
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this.exec();
  }
  private exec() {
    if (this.erroring) {
      return Promise.resolve({ data: null, error: { message: "boom" } });
    }
    if (this.single) {
      return Promise.resolve({ data: this.rows[0] ?? null, error: null });
    }
    return Promise.resolve({ data: this.rows, error: null });
  }
  then<A, B>(
    onFulfilled?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ) {
    return this.exec().then(onFulfilled, onRejected);
  }
}

type Tables = {
  talent_profiles?: Row[];
  agency_memberships?: Row[];
  talent_offerings?: Row[];
};

function fakeClient(tables: Tables, erroringTables: Set<string> = new Set()): SupabaseClient {
  return {
    from(table: keyof Tables) {
      return new FakeQuery((tables[table] ?? []) as Row[], erroringTables.has(table as string));
    },
  } as unknown as SupabaseClient;
}

const OWNER_TALENT_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_USER_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_TENANT_ID = "44444444-4444-4444-8444-444444444444";

function ownerWiring(): Tables {
  return {
    talent_profiles: [{ id: OWNER_TALENT_ID, user_id: OWNER_USER_ID }],
    agency_memberships: [
      { profile_id: OWNER_USER_ID, role: "owner", status: "active", tenant_id: TENANT_ID, accepted_at: "2026-01-01" },
    ],
  };
}

function workspaceRow(over: Partial<Row> = {}): Row {
  return {
    id: "menu-item-1",
    title: "House margarita",
    category: "Drinks",
    description: "Tequila, lime, salt rim.",
    sort_order: 0,
    status: "published",
    moderation_state: "approved",
    visibility: "public",
    tenant_id: TENANT_ID,
    owner_kind: "workspace",
    talent_profile_id: null,
    ...over,
  };
}

test("TUL-1709: a published workspace menu item appears in the owner talent's document with the right fields", async () => {
  const tables = ownerWiring();
  tables.talent_offerings = [workspaceRow()];
  const result = await loadAiSearchDocumentOfferings(fakeClient(tables), OWNER_TALENT_ID);
  assert.deepEqual(result, [
    {
      id: "menu-item-1",
      title: "House margarita",
      category: "Drinks",
      description: "Tequila, lime, salt rim.",
      sortOrder: 0,
      status: "published",
      moderation_state: "approved",
      visibility: "public",
    },
  ]);
});

test("TUL-1709: a draft workspace item does not appear", async () => {
  const tables = ownerWiring();
  tables.talent_offerings = [workspaceRow({ id: "draft-item", status: "draft" })];
  const result = await loadAiSearchDocumentOfferings(fakeClient(tables), OWNER_TALENT_ID);
  assert.deepEqual(result, []);
});

test("TUL-1709: an unapproved (pending moderation) workspace item does not appear", async () => {
  const tables = ownerWiring();
  tables.talent_offerings = [workspaceRow({ id: "pending-item", moderation_state: "pending" })];
  const result = await loadAiSearchDocumentOfferings(fakeClient(tables), OWNER_TALENT_ID);
  assert.deepEqual(result, []);
});

test("TUL-1709: an agency_only (never guest-visible) workspace item does not appear", async () => {
  const tables = ownerWiring();
  tables.talent_offerings = [workspaceRow({ id: "staff-item", visibility: "agency_only" })];
  const result = await loadAiSearchDocumentOfferings(fakeClient(tables), OWNER_TALENT_ID);
  assert.deepEqual(result, []);
});

test("TUL-1709: a workspace item belonging to a DIFFERENT tenant never leaks into this talent's document", async () => {
  const tables = ownerWiring();
  tables.talent_offerings = [workspaceRow({ id: "other-tenant-item", tenant_id: OTHER_TENANT_ID })];
  const result = await loadAiSearchDocumentOfferings(fakeClient(tables), OWNER_TALENT_ID);
  assert.deepEqual(result, []);
});

test("TUL-1709: a roster talent with no owned workspace gets only [] from the workspace half (no crash)", async () => {
  const ROSTER_TALENT_ID = "55555555-5555-4555-8555-555555555555";
  const tables: Tables = {
    talent_profiles: [{ id: ROSTER_TALENT_ID, user_id: "someone-else" }],
    agency_memberships: [],
    talent_offerings: [],
  };
  const result = await loadAiSearchDocumentOfferings(fakeClient(tables), ROSTER_TALENT_ID);
  assert.deepEqual(result, []);
});

test("regression: a talent-owned offering still appears as before", async () => {
  const TALENT_ID = "66666666-6666-4666-8666-666666666666";
  const tables: Tables = {
    talent_profiles: [{ id: TALENT_ID, user_id: "no-membership-for-this-user" }],
    agency_memberships: [],
    talent_offerings: [
      {
        id: "service-1",
        title: "Bridal makeup",
        category: "Weddings",
        description: "Full bridal look with trial session.",
        sort_order: 0,
        status: "published",
        moderation_state: "approved",
        visibility: "public",
        tenant_id: null,
        owner_kind: "talent",
        talent_profile_id: TALENT_ID,
      },
      // A workspace row that happens to share no tenant with this talent's
      // (absent) owned workspace must not leak in either.
      workspaceRow({ id: "unrelated-menu-item" }),
    ],
  };
  const result = await loadAiSearchDocumentOfferings(fakeClient(tables), TALENT_ID);
  assert.deepEqual(result, [
    {
      id: "service-1",
      title: "Bridal makeup",
      category: "Weddings",
      description: "Full bridal look with trial session.",
      sortOrder: 0,
      status: "published",
      moderation_state: "approved",
      visibility: "public",
    },
  ]);
});

test("a read error on talent_offerings logs and yields [] without throwing", async () => {
  const tables = ownerWiring();
  tables.talent_offerings = [workspaceRow()];
  const result = await loadAiSearchDocumentOfferings(
    fakeClient(tables, new Set(["talent_offerings"])),
    OWNER_TALENT_ID,
  );
  assert.deepEqual(result, []);
});
