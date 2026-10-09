import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAlsoBookableFacts } from "./also-bookable.server";

// TUL-269 / TUL-86: a studio-only owner has no talent_profiles row, so the
// provider name must fall back to the account name, then the workspace name.
function fakeAdmin(rows: Record<string, Record<string, unknown> | null>): SupabaseClient {
  const q = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["select", "eq", "is", "limit"]) chain[m] = self;
    chain.maybeSingle = async () => ({ data: rows[table] ?? null, error: null });
    return chain;
  };
  return { from: q } as unknown as SupabaseClient;
}

const base = {
  agency_memberships: { tenant_id: "t1" },
  agencies: { id: "t1", slug: "acme", display_name: "Acme Studio" },
};

test("studio-only owner: name falls back to the account name", async () => {
  const r = await loadAlsoBookableFacts(fakeAdmin({ ...base, talent_profiles: null, profiles: { display_name: "Nia Cruz" } }), "u1", "t1");
  assert.ok(r.ok);
  assert.equal(r.facts.displayName, "Nia Cruz");
  assert.equal(r.facts.hasTalentProfile, false);
});

test("no account name: falls back to the workspace name", async () => {
  const r = await loadAlsoBookableFacts(fakeAdmin({ ...base, talent_profiles: null, profiles: { display_name: "  " } }), "u1", "t1");
  assert.ok(r.ok);
  assert.equal(r.facts.displayName, "Acme Studio");
});

test("an existing talent profile name still wins", async () => {
  const r = await loadAlsoBookableFacts(fakeAdmin({ ...base, talent_profiles: { id: "tp1", display_name: "Nia" }, profiles: { display_name: "Other" }, agency_talent_roster: null, talent_sites: null }), "u1", "t1");
  assert.ok(r.ok);
  assert.equal(r.facts.displayName, "Nia");
});
