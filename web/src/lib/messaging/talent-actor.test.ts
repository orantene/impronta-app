import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { TALENT_INBOX_SCAN_LIMIT, listTalentInquiryIds, loadTalentActor, loadTalentSale } from "./talent-actor";

const HER = uuid(1);
const INQUIRY = uuid(2);
const TENANT = uuid(3);
const ORDER = uuid(4);

function errorClient(failTable: string): SupabaseClient {
  const ok = {
    select() {
      return ok;
    },
    eq() {
      return ok;
    },
    order() {
      return ok;
    },
    limit() {
      return ok;
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  const bad = {
    select() {
      return bad;
    },
    eq() {
      return bad;
    },
    order() {
      return bad;
    },
    limit() {
      return bad;
    },
    maybeSingle: () => Promise.resolve({ data: null, error: { message: "down" } }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { message: "down" } }).then(resolve),
  };
  return {
    from: (table: string) => (table === failTable ? bad : ok),
  } as unknown as SupabaseClient;
}

test("a failed order read is unavailable, not an empty sale", async () => {
  const result = await loadTalentSale(errorClient("orders"), HER, INQUIRY, TENANT);
  assert.deepEqual(result, { ok: false, reason: "unavailable" });
});

test("a failed line read is unavailable", async () => {
  const { admin } = fakeAdmin({
    orders: [
      {
        id: ORDER,
        inquiry_id: INQUIRY,
        source_channel: "messages",
        status: "draft",
        currency: "MXN",
        total_cents: 65000,
        tenant_id: TENANT,
        created_at: "2026-09-23T00:00:00Z",
      },
    ],
  });
  const realFrom = admin.from.bind(admin);
  const wrapped = {
    from: (table: string) => {
      if (table !== "order_lines") return realFrom(table);
      const bad = {
        select() {
          return bad;
        },
        eq() {
          return bad;
        },
        order() {
          return bad;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: "down" } }).then(resolve),
      };
      return bad;
    },
  } as unknown as SupabaseClient;
  const result = await loadTalentSale(wrapped, HER, INQUIRY, TENANT);
  assert.deepEqual(result, { ok: false, reason: "unavailable" });
});

test("no messages order is an empty sale", async () => {
  const { admin } = fakeAdmin({ orders: [] });
  const result = await loadTalentSale(admin as unknown as SupabaseClient, HER, INQUIRY, TENANT);
  assert.deepEqual(result, { ok: true, empty: true });
});

test("TUL-625: every talent inbox scan query is ordered and limited", async () => {
  const calls: { table: string; limit: number | null; ordered: boolean }[] = [];
  const admin = {
    from(table: string) {
      const rec = { table, limit: null as number | null, ordered: false };
      calls.push(rec);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "contains"]) q[m] = () => q;
      q.order = () => {
        rec.ordered = true;
        return q;
      };
      q.limit = (n: number) => {
        rec.limit = n;
        return q;
      };
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
      return q;
    },
  } as unknown as SupabaseClient;
  const result = await listTalentInquiryIds(admin, HER);
  assert.deepEqual(result, { ok: true, ids: [] });
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.limit, TALENT_INBOX_SCAN_LIMIT, call.table);
    assert.ok(call.ordered, call.table);
  }
});

test("a read-only caller may fall back to the session client when no service client exists", async () => {
  const rows = { data: [{ id: HER, is_demo: false, display_name: "Her" }], error: null };
  const q = { select: () => q, eq: () => q, limit: () => Promise.resolve(rows) };
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: uuid(9) } }, error: null }) }, from: () => q } as unknown as SupabaseClient;
  const deps = { rlsClient: async () => supabase, adminClient: () => null };
  const strict = await loadTalentActor(undefined, deps);
  assert.equal(strict.ok, false);
  const read = await loadTalentActor(undefined, deps, { firstProfile: true, adminFallback: true });
  assert.equal(read.ok && read.talentProfileId, HER);
});
