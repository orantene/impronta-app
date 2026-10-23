import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  applyDiscoverIndexFilters,
  orderRowsByIds,
  pageLiveListedIds,
} from "./discover-index-live-page";

/** Fake supabase for talent_profiles: records gate filters; only liveIds pass. */
function liveClient(liveIds: string[], opts: { fail?: boolean } = {}) {
  const calls: { table: string; filters: string[] }[] = [];
  return {
    calls,
    from(table: string) {
      const rec = { table, filters: [] as string[] };
      calls.push(rec);
      let chunk: string[] = [];
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.is = (c: string, v: unknown) => (rec.filters.push(`${c} is ${v}`), b);
      b.eq = (c: string, v: unknown) => (rec.filters.push(`${c}=${v}`), b);
      b.neq = (c: string, v: unknown) => (rec.filters.push(`${c}!=${v}`), b);
      b.in = (_c: string, v: string[]) => ((chunk = v), b);
      b.then = (resolve: (v: unknown) => void) =>
        resolve(
          opts.fail
            ? { data: null, error: { message: "boom" } }
            : { data: chunk.filter((i) => liveIds.includes(i)).map((id) => ({ id })), error: null },
        );
      return b;
    },
  };
}

const idFetcher = (all: string[]) => async (from: number, to: number) => ({
  data: all.slice(from, to + 1).map((id) => ({ id })),
  error: null,
});

test("a stale matview id that is no longer live is never returned and total is exact", async () => {
  const stale = ["a", "b", "c", "d", "e"]; // matview still lists all five
  const sb = liveClient(["a", "c", "e"]); // b and d were unlisted
  const out = await pageLiveListedIds(sb, idFetcher(stale), 0, 10);
  assert.deepEqual(out.pageIds, ["a", "c", "e"]);
  assert.equal(out.total, 3);
});

test("paging slices over LIVE ids so a page has no holes", async () => {
  const stale = ["a", "b", "c", "d", "e", "f"];
  const sb = liveClient(["a", "c", "d", "f"]);
  const p1 = await pageLiveListedIds(sb, idFetcher(stale), 0, 2);
  const p2 = await pageLiveListedIds(sb, idFetcher(stale), 2, 2);
  assert.deepEqual(p1.pageIds, ["a", "c"]);
  assert.deepEqual(p2.pageIds, ["d", "f"]);
  assert.equal(p2.total, 4);
});

test("the live read applies the canonical listing gate on talent_profiles", async () => {
  const sb = liveClient(["a"]);
  await pageLiveListedIds(sb, idFetcher(["a"]), 0, 5);
  const call = sb.calls[0];
  assert.equal(call.table, "talent_profiles");
  assert.ok(call.filters.includes("is_publicly_listed=true"));
  assert.ok(call.filters.includes("is_publicly_hidden=false"));
  assert.ok(call.filters.includes("deleted_at is null"));
});

test("fails closed when the live read errors", async () => {
  await assert.rejects(pageLiveListedIds(liveClient([], { fail: true }), idFetcher(["a"]), 0, 5));
});

test("fails closed when the index id read errors", async () => {
  await assert.rejects(
    pageLiveListedIds(liveClient(["a"]), async () => ({ data: null, error: { message: "x" } }), 0, 5),
  );
});

test("walks more than one 1000-row page of index ids", async () => {
  const all = Array.from({ length: 1500 }, (_, i) => `id${i}`);
  const sb = liveClient(all);
  const out = await pageLiveListedIds(sb, idFetcher(all), 1400, 50);
  assert.equal(out.total, 1500);
  assert.equal(out.pageIds[0], "id1400");
});

test("orderRowsByIds restores live page order and drops missing rows", () => {
  const rows = [{ id: "b" }, { id: "a" }];
  assert.deepEqual(orderRowsByIds(rows, ["a", "x", "b"]), [{ id: "a" }, { id: "b" }]);
});

test("applyDiscoverIndexFilters: empty location match scopes to NO rows", () => {
  const calls: string[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "gt", "in", "is", "or"]) {
    q[m] = (...a: unknown[]) => (calls.push(`${m}:${a.join(",")}`), q);
  }
  applyDiscoverIndexFilters(q, { residenceCityIds: [], qFilter: null });
  assert.deepEqual(calls, ["is:id,"]);
});

test("applyDiscoverIndexFilters applies each filter", () => {
  const calls: string[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "gt", "in", "is", "or"]) {
    q[m] = (...a: unknown[]) => (calls.push(`${m}:${a.join(",")}`), q);
  }
  applyDiscoverIndexFilters(q, {
    category: "model",
    hub: "h1",
    residenceCityIds: ["c1"],
    trustTier: "gold",
    availableOnly: true,
    qFilter: "x.ilike.%a%",
  });
  assert.equal(calls.length, 6);
});

test("loadDiscoverTalents pages over live-gated ids and does not trust matview count", () => {
  const src = readFileSync("src/app/(workspace)/[tenantSlug]/_data-bridge/discover.ts", "utf8");
  const fn = src.slice(src.indexOf("export async function loadDiscoverTalents"));
  const body = fn.slice(0, fn.indexOf("\nexport "));
  assert.match(body, /pageLiveListedIds\(/);
  assert.doesNotMatch(body, /\.range\(offset/);
  assert.doesNotMatch(body, /count: "exact"/);
});

test("listing changes request a coalesced discover index refresh", () => {
  const rv = readFileSync("src/lib/revalidate-public.ts", "utf8");
  assert.match(rv, /requestDiscoverIndexRefresh\(\)/);
  const rq = readFileSync("src/lib/directory/request-discover-index-refresh.ts", "utf8");
  assert.match(rq, /refresh_talent_discover_index/);
  assert.match(rq, /createServiceRoleClient/);
});
