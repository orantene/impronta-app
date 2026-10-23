/**
 * TUL-1931: IndexNow skips demo/test workspaces (owner is a test account), pings real ones, fails closed on error.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resetIndexNowDebounce } from "./indexnow";
import { pingIndexNowForCmsPage } from "./indexnow-cms-page";

type Rows = Record<string, unknown[]>;

function fakeClient(opts: { rows: Rows; emails: Record<string, string>; failTable?: string }): SupabaseClient {
  const from = (table: string) => {
    const result = opts.failTable === table ? { data: null, error: new Error("boom") } : { data: opts.rows[table] ?? [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "or"]) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: (opts.rows[table] ?? [])[0] ?? null, error: null });
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return chain;
  };
  return {
    from,
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: opts.emails[id] } }, error: null }) } },
  } as unknown as SupabaseClient;
}

const DOMAINS = [{ hostname: "studio.example-agency.com", kind: "custom", status: "active", is_primary: true }];

async function run(admin: SupabaseClient | null, sb: SupabaseClient = fakeClient({ rows: { agency_domains: DOMAINS }, emails: {} })) {
  const calls: string[] = [];
  const prevFetch = global.fetch;
  const prevEnv = { v: process.env.VERCEL_ENV, k: process.env.INDEXNOW_API_KEY };
  process.env.VERCEL_ENV = "production";
  process.env.INDEXNOW_API_KEY = "k";
  resetIndexNowDebounce();
  global.fetch = (async (url: string) => {
    calls.push(String(url));
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  try {
    await pingIndexNowForCmsPage(sb, "t1", { locale: "en", slug: "about" }, { admin });
  } finally {
    global.fetch = prevFetch;
    process.env.VERCEL_ENV = prevEnv.v;
    process.env.INDEXNOW_API_KEY = prevEnv.k;
    if (prevEnv.v === undefined) delete process.env.VERCEL_ENV;
    if (prevEnv.k === undefined) delete process.env.INDEXNOW_API_KEY;
  }
  return calls;
}

const OWNER = [{ tenant_id: "t1", profile_id: "u1" }];

test("real owner: pings", async () => {
  const admin = fakeClient({ rows: { agency_memberships: OWNER }, emails: { u1: "owner@gmail.com" } });
  assert.equal((await run(admin)).length > 0, true);
});

test("owner on a reserved TLD: no fetch", async () => {
  const admin = fakeClient({ rows: { agency_memberships: OWNER }, emails: { u1: "qa@impronta.test" } });
  assert.deepEqual(await run(admin), []);
});

test("owner on the QA test domain: no fetch", async () => {
  const admin = fakeClient({ rows: { agency_memberships: OWNER }, emails: { u1: "bot@mail.grokbot.com" } });
  assert.deepEqual(await run(admin), []);
});

test("owner flagged is_test_account / is_demo: no fetch", async () => {
  const admin = fakeClient({
    rows: { agency_memberships: OWNER, profiles: [{ id: "u1" }] },
    emails: { u1: "owner@gmail.com" },
  });
  assert.deepEqual(await run(admin), []);
});

test("no owner, lookup error, or no admin client: fails closed", async () => {
  assert.deepEqual(await run(fakeClient({ rows: {}, emails: {} })), []);
  assert.deepEqual(await run(fakeClient({ rows: { agency_memberships: OWNER }, emails: {}, failTable: "agency_memberships" })), []);
  assert.deepEqual(await run(null), []);
});
