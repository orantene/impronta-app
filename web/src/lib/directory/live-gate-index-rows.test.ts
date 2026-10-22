import assert from "node:assert/strict";
import { test } from "node:test";
import { liveGateIndexRows } from "./live-gate-index-rows";

/** Fake supabase: records the gate filters; returns only ids marked live. */
function fakeClient(liveIds: string[], opts: { fail?: boolean } = {}) {
  const calls: { table: string; filters: string[]; chunk: string[] }[] = [];
  return {
    calls,
    from(table: string) {
      const rec = { table, filters: [] as string[], chunk: [] as string[] };
      calls.push(rec);
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.is = (c: string, v: unknown) => (rec.filters.push(`${c} is ${v}`), b);
      b.eq = (c: string, v: unknown) => (rec.filters.push(`${c}=${v}`), b);
      b.neq = (c: string, v: unknown) => (rec.filters.push(`${c}!=${v}`), b);
      b.in = (_c: string, v: string[]) => {
        rec.chunk = v;
        return b;
      };
      b.then = (resolve: (v: unknown) => void) =>
        resolve(
          opts.fail
            ? { data: null, error: { message: "boom" } }
            : {
                data: rec.chunk.filter((i) => liveIds.includes(i)).map((id) => ({ id })),
                error: null,
              },
        );
      return b;
    },
  };
}

test("stale index row whose live profile is hidden/unlisted is excluded", async () => {
  const sb = fakeClient(["a", "c"]);
  const out = await liveGateIndexRows(sb, [{ id: "a" }, { id: "b" }, { id: "c" }]);
  assert.deepEqual(out.rows.map((r) => r.id), ["a", "c"]);
  assert.equal(out.dropped, 1);
});

test("uses the canonical public gate against talent_profiles, one query per page", async () => {
  const sb = fakeClient(["a"]);
  await liveGateIndexRows(sb, [{ id: "a" }, { id: "b" }]);
  assert.equal(sb.calls.length, 1);
  assert.equal(sb.calls[0].table, "talent_profiles");
  for (const f of [
    "deleted_at is null",
    "is_publicly_hidden=false",
    "is_publicly_listed=true",
    "profile_kind!=resource",
  ]) {
    assert.ok(sb.calls[0].filters.includes(f), f);
  }
});

test("fails closed when the live read errors", async () => {
  const out = await liveGateIndexRows(fakeClient([], { fail: true }), [{ id: "a" }]);
  assert.deepEqual(out.rows, []);
  assert.equal(out.dropped, 1);
});

test("empty input makes no query", async () => {
  const sb = fakeClient([]);
  const out = await liveGateIndexRows(sb, []);
  assert.deepEqual(out, { rows: [], dropped: 0 });
  assert.equal(sb.calls.length, 0);
});
