/**
 * TUL-862: the one public-listing gate is applied by list, count, search
 * (legacy + RPC path). Typed fakes; static pins where a fake is heavy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_LISTING_FILTERS,
  applyPublicListingGate,
  filterToPubliclyListedIds,
} from "./public-listing-predicate";
import { fetchLegacyDirectorySearchTalentIds } from "./directory-search-legacy";
import type { SupabaseClient } from "@supabase/supabase-js";

const here = fileURLToPath(new URL(".", import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

type Row = {
  id: string;
  name: string;
  deleted_at: string | null;
  is_publicly_hidden: boolean;
  is_publicly_listed: boolean;
  profile_kind: string;
};

const ROWS: Row[] = [
  { id: "qa-max", name: "QA Max", deleted_at: null, is_publicly_hidden: false, is_publicly_listed: true, profile_kind: "talent" },
  { id: "seed", name: "Ambas Seed", deleted_at: null, is_publicly_hidden: false, is_publicly_listed: false, profile_kind: "talent" },
  { id: "hidden", name: "Ambas Hidden", deleted_at: null, is_publicly_hidden: true, is_publicly_listed: true, profile_kind: "talent" },
  { id: "chair", name: "Ambas Chair", deleted_at: null, is_publicly_hidden: false, is_publicly_listed: true, profile_kind: "resource" },
  { id: "gone", name: "Ambas Gone", deleted_at: "2026-01-01", is_publicly_hidden: false, is_publicly_listed: true, profile_kind: "talent" },
];

/** Filter-recording fake that really evaluates is/eq/neq/in; `.or` is a no-op match-all. */
class FakeQuery implements PromiseLike<{ data: { id: string }[]; error: null }> {
  calls: Array<[string, string, unknown]> = [];
  private rows: Row[] = ROWS;
  is(col: string, v: null) { this.calls.push(["is", col, v]); this.rows = this.rows.filter((r) => (r as Record<string, unknown>)[col] === v); return this; }
  eq(col: string, v: boolean) { this.calls.push(["eq", col, v]); this.rows = this.rows.filter((r) => (r as Record<string, unknown>)[col] === v); return this; }
  neq(col: string, v: string) { this.calls.push(["neq", col, v]); this.rows = this.rows.filter((r) => (r as Record<string, unknown>)[col] !== v); return this; }
  in(col: string, v: string[]) { this.calls.push(["in", col, v]); this.rows = this.rows.filter((r) => v.includes((r as Record<string, unknown>)[col] as string)); return this; }
  or(_f: string) { this.calls.push(["or", _f, null]); return this; }
  then<A, B>(ok?: ((v: { data: { id: string }[]; error: null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve({ data: this.rows.map((r) => ({ id: r.id })), error: null as null }).then(ok, bad);
  }
}

function fakeClient(queries: FakeQuery[]): SupabaseClient {
  const empty = { data: [], error: null };
  return {
    from(table: string) {
      return {
        select() {
          if (table === "talent_profiles") {
            const q = new FakeQuery();
            queries.push(q);
            return q;
          }
          const chain = {
            is: () => chain,
            or: () => chain,
            in: () => chain,
            then: (ok: (v: typeof empty) => unknown) => Promise.resolve(empty).then(ok),
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
}

test("helper filter list equals the directory list/count predicate", () => {
  const src = read("fetch-directory-page.ts");
  const expected = PUBLIC_LISTING_FILTERS.map((f) =>
    f.op === "is"
      ? `.is("${f.column}", null)`
      : `.${f.op}("${f.column}", ${JSON.stringify(f.value)})`,
  );
  // list and count both carry every filter in the same order
  for (const needle of expected) {
    const count = src.split(needle).length - 1;
    assert.ok(count >= 2, `${needle} must appear on list and count queries (found ${count})`);
  }
});

test("applyPublicListingGate keeps only listed, visible, non-resource, non-deleted", async () => {
  const q = applyPublicListingGate(new FakeQuery());
  const { data } = await q;
  assert.deepEqual(data.map((r) => r.id), ["qa-max"]);
});

test("legacy search returns only gated rows (QA Max findable, seed/hidden/resource/deleted dropped)", async () => {
  const queries: FakeQuery[] = [];
  const ids = await fetchLegacyDirectorySearchTalentIds(fakeClient(queries), "Ambas");
  assert.ok(queries.length >= 1);
  assert.deepEqual(ids, ["qa-max"]);
  for (const q of queries) {
    assert.ok(q.calls.some((c) => c[1] === "is_publicly_listed" && c[2] === true));
  }
});

test("RPC path drops unlisted ids and keeps listed ones, order preserved", async () => {
  const queries: FakeQuery[] = [];
  const out = await filterToPubliclyListedIds(fakeClient(queries), ["seed", "qa-max", "hidden", "chair", "gone"]);
  assert.deepEqual(out, ["qa-max"]);
  assert.equal(queries.length, 1);
  assert.deepEqual(await filterToPubliclyListedIds(fakeClient([]), []), []);
});

test("RPC intersect is chunked so the extra query stays bounded", async () => {
  const queries: FakeQuery[] = [];
  await filterToPubliclyListedIds(fakeClient(queries), Array.from({ length: 450 }, (_, i) => `id${i}`));
  assert.equal(queries.length, 3);
});

test("fetch-directory-page runs the gate over search ids before intersecting", () => {
  const src = read("fetch-directory-page.ts");
  const gate = src.indexOf("filterToPubliclyListedIds(supabase, searchIds)");
  const use = src.indexOf("const searchSet = new Set(searchIds)");
  assert.ok(gate > 0 && use > gate);
});

test("legacy search source uses the shared gate on both profile queries", () => {
  const src = read("directory-search-legacy.ts");
  assert.equal(src.split("applyPublicListingGate(").length - 1, 2);
  assert.ok(!src.includes('.eq("is_publicly_hidden", false)'));
});

// llms.txt is deliberately NOT gated by the hub listing flag: a talent with their own published
// site keeps their llms.txt even when they are not on the hub (same principle as the talent-site
// sitemap, TUL-534; llms.txt landed in TUL-589).
test("llms.txt stays independent of the hub listing flag", () => {
  const src = readFileSync(join(here, "../seo/talent-llms-txt.server.ts"), "utf8");
  assert.ok(!src.includes("is_publicly_listed"));
});
