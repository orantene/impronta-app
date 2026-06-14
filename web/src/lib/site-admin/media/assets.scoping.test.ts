/**
 * listTalentScopedMediaLibrary — tenant-scoping spy test (security regression).
 *
 * The function runs under a SERVICE-ROLE client (RLS bypassed), so it MUST scope
 * every query to `tenantId` at the application layer — a talent can sit on
 * multiple agencies' rosters, and a missing tenant filter would let a managing-
 * staff caller pull another tenant's media for that shared talent. This test
 * locks that property in: a fake Supabase records every `.eq()` / `.in()` filter
 * on every query, and we assert each query filtered the correct `tenant_id`.
 *
 * node:test + node:assert only — no DB, no network. The fake query builder is
 * thenable so `await`/`Promise.all` resolve the stub rows.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { listTalentScopedMediaLibrary } from "./assets";

type QueryRecord = {
  table: string;
  eqs: Array<[string, unknown]>;
  ins: Array<[string, unknown]>;
};

/** Build a fake Supabase whose query builder records filters + resolves with
 *  table-specific stub rows. Returns the client + the recorded queries. */
function makeFakeSupabase(dataByTable: Record<string, unknown[]>) {
  const queries: QueryRecord[] = [];
  function from(table: string) {
    const rec: QueryRecord = { table, eqs: [], ins: [] };
    queries.push(rec);
    const result = { data: dataByTable[table] ?? [], error: null };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        rec.eqs.push([col, val]);
        return builder;
      },
      in: (col: string, val: unknown) => {
        rec.ins.push([col, val]);
        return builder;
      },
      is: () => builder,
      order: () => builder,
      limit: () => builder,
      // thenable: `await builder` / Promise.all resolve the stub result.
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return builder;
  }
  return { supabase: { from } as never, queries };
}

const TALENT = "11111111-1111-1111-1111-111111111111";
const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

test("[media-scope] EVERY query is scoped to tenantId (no cross-tenant leak)", async () => {
  // A portfolio link is returned so the 3rd (by-id) media_assets query also runs.
  const { supabase, queries } = makeFakeSupabase({
    agency_talent_media: [{ agency_media_id: "asset-x", master_media_id: null }],
    media_assets: [],
  });

  await listTalentScopedMediaLibrary(supabase, TALENT, TENANT_A);

  assert.ok(queries.length >= 3, `expected >=3 queries, got ${queries.length}`);
  for (const q of queries) {
    const tenantEq = q.eqs.find(([c]) => c === "tenant_id");
    assert.ok(tenantEq, `query on "${q.table}" MUST filter tenant_id`);
    assert.equal(
      tenantEq![1],
      TENANT_A,
      `query on "${q.table}" filtered the WRONG tenant`,
    );
  }
});

test("[media-scope] owned-media query filters owner_talent_profile_id + tenant", async () => {
  const { supabase, queries } = makeFakeSupabase({
    agency_talent_media: [],
    media_assets: [],
  });

  await listTalentScopedMediaLibrary(supabase, TALENT, TENANT_A);

  const owned = queries.find(
    (q) =>
      q.table === "media_assets" &&
      q.eqs.some(([c]) => c === "owner_talent_profile_id"),
  );
  assert.ok(owned, "must query media_assets by owner_talent_profile_id");
  assert.ok(
    owned!.eqs.some(([c, v]) => c === "owner_talent_profile_id" && v === TALENT),
    "owned query must filter the requested talent",
  );
  assert.ok(
    owned!.eqs.some(([c, v]) => c === "tenant_id" && v === TENANT_A),
    "owned query must be tenant-scoped",
  );
});

test("[media-scope] portfolio-link query is scoped to talent + tenant", async () => {
  const { supabase, queries } = makeFakeSupabase({
    agency_talent_media: [],
    media_assets: [],
  });

  await listTalentScopedMediaLibrary(supabase, TALENT, TENANT_A);

  const links = queries.find((q) => q.table === "agency_talent_media");
  assert.ok(links, "must query agency_talent_media for portfolio links");
  assert.ok(
    links!.eqs.some(([c, v]) => c === "talent_profile_id" && v === TALENT),
    "portfolio-link query must filter the requested talent",
  );
  assert.ok(
    links!.eqs.some(([c, v]) => c === "tenant_id" && v === TENANT_A),
    "portfolio-link query must be tenant-scoped",
  );
});

test("[media-scope] portfolio-rows (by-id) query is tenant-scoped", async () => {
  const { supabase, queries } = makeFakeSupabase({
    agency_talent_media: [{ agency_media_id: "asset-x", master_media_id: "asset-y" }],
    media_assets: [],
  });

  await listTalentScopedMediaLibrary(supabase, TALENT, TENANT_A);

  const byId = queries.find((q) => q.ins.some(([c]) => c === "id"));
  assert.ok(byId, "must resolve portfolio rows via media_assets.id IN (...)");
  assert.ok(
    byId!.eqs.some(([c, v]) => c === "tenant_id" && v === TENANT_A),
    "by-id portfolio query must be tenant-scoped (else a shared-talent leak)",
  );
});
