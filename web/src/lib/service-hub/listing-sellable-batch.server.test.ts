import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { LISTING_SELLABLE_CHUNK, sellableListingIds } from "./listing-sellable-batch.server";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function rpcAdmin(reply: (args: { p_listing_ids: string[] }) => { data?: unknown; error?: unknown }) {
  const calls: string[][] = [];
  return {
    calls,
    admin: {
      rpc: async (fn: string, args: { p_listing_ids: string[] }) => {
        assert.equal(fn, "workspace_service_listing_is_sellable");
        calls.push(args.p_listing_ids);
        const r = reply(args);
        return { data: r.data ?? null, error: r.error ?? null };
      },
    } as never,
  };
}

test("one call answers for many listings, returning only the sellable ones", async () => {
  const f = rpcAdmin((a) => ({ data: a.p_listing_ids.filter((_, i) => i % 2 === 0) }));
  const out = await sellableListingIds(f.admin, [id(1), id(2), id(3), id(4)]);
  assert.equal(f.calls.length, 1);
  assert.deepEqual([...(out ?? [])].sort(), [id(1), id(3)]);
});

test("duplicates and junk ids are dropped before asking; nothing to ask means an empty set and no call", async () => {
  const f = rpcAdmin((a) => ({ data: a.p_listing_ids }));
  const out = await sellableListingIds(f.admin, [id(1), id(1), "not-a-uuid", ""]);
  assert.deepEqual(f.calls, [[id(1)]]);
  assert.deepEqual([...(out ?? [])], [id(1)]);
  const none = rpcAdmin(() => ({ data: [] }));
  assert.deepEqual([...((await sellableListingIds(none.admin, [])) ?? [])], []);
  assert.equal(none.calls.length, 0);
});

test("an id the database returns that we did not ask about is ignored", async () => {
  const f = rpcAdmin(() => ({ data: [id(1), id(99), 7, null] }));
  assert.deepEqual([...((await sellableListingIds(f.admin, [id(1), id(2)])) ?? [])], [id(1)]);
});

test("an RPC error, a missing function or a malformed reply is unknown (null): fail closed", async () => {
  assert.equal(await sellableListingIds(rpcAdmin(() => ({ error: { code: "PGRST202" } })).admin, [id(1)]), null);
  assert.equal(await sellableListingIds(rpcAdmin(() => ({ data: "true" })).admin, [id(1)]), null);
  assert.equal(await sellableListingIds(rpcAdmin(() => ({ data: null })).admin, [id(1)]), null);
  const throwing = { rpc: async () => { throw new Error("net"); } } as never;
  assert.equal(await sellableListingIds(throwing, [id(1)]), null);
});

test("a long list is chunked, and one failing chunk makes the whole answer unknown", async () => {
  const many = Array.from({ length: LISTING_SELLABLE_CHUNK + 5 }, (_, i) => id(i + 1));
  const f = rpcAdmin((a) => ({ data: a.p_listing_ids }));
  const out = await sellableListingIds(f.admin, many);
  assert.deepEqual(f.calls.map((c) => c.length), [LISTING_SELLABLE_CHUNK, 5]);
  assert.equal(out?.size, many.length);
  let n = 0;
  const flaky = rpcAdmin((a) => (n++ === 1 ? { error: { code: "XX000" } } : { data: a.p_listing_ids }));
  assert.equal(await sellableListingIds(flaky.admin, many), null);
});

test("the held migration reuses the single-id rule, is capped, service-role only and rolls back", () => {
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "_pending_pm", "20261231421200_workspace_service_listing_is_sellable_batch.sql"), "utf8");
  assert.match(sql, /p_listing_ids uuid\[\]/);
  assert.match(sql, /public\.workspace_service_listing_is_sellable\(i\.id\)/);
  assert.match(sql, /> 500/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.workspace_service_listing_is_sellable\(uuid\[\]\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.workspace_service_listing_is_sellable\(uuid\[\]\) TO service_role/);
  assert.match(sql, /to_regprocedure\('public\.workspace_service_listing_is_sellable\(uuid\)'\)/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.workspace_service_listing_is_sellable\(uuid\[\]\)/);
  assert.doesNotMatch(sql, /GRANT[^;]*\b(anon|authenticated)\b/);
});
