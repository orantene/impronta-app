import { test } from "node:test";
import assert from "node:assert/strict";
import { endPromoUpdate, goLivePatch, pausePatch, showOnSiteFor } from "./show-on-site";
import { sweepStaleShowOnSite, type SweepDb } from "./sweep";

const NOW = new Date("2026-10-15T12:00:00Z");
const live = { unlock: "auto", audience: "public", is_draft: false, is_paused: false, archived_at: null, ends_at: null };

test("showOnSiteFor matrix", () => {
  assert.equal(showOnSiteFor(live, NOW), true);
  assert.equal(showOnSiteFor({ ...live, ends_at: "2026-11-01T00:00:00Z" }, NOW), true);
  for (const o of [
    { unlock: "code" }, { unlock: "link" }, { audience: "one_client" }, { audience: "returning" },
    { is_draft: true }, { is_paused: true }, { archived_at: "2026-10-01T00:00:00Z" }, { ends_at: "2026-10-01T00:00:00Z" },
  ]) assert.equal(showOnSiteFor({ ...live, ...o }, NOW), false, JSON.stringify(o));
});

test("end patches carry show_on_site=false", () => {
  assert.deepEqual(endPromoUpdate({ kind: "archive", archived_at: "x" }), { archived_at: "x", show_on_site: false });
  assert.deepEqual(endPromoUpdate({ kind: "expire", ends_at: "y" }), { ends_at: "y", show_on_site: false });
});

test("pause hides, resume recomputes", () => {
  assert.deepEqual(pausePatch(true, live, NOW), { is_paused: true, show_on_site: false });
  assert.deepEqual(pausePatch(false, { ...live, is_paused: true }, NOW), { is_paused: false, show_on_site: true });
  assert.equal(pausePatch(false, { ...live, unlock: "code" }, NOW).show_on_site, false);
});

test("go live recomputes", () => {
  assert.equal(goLivePatch({ ...live, is_draft: true }, false, NOW).show_on_site, true);
  assert.equal(goLivePatch({ ...live, is_draft: true, audience: "returning" }, true, NOW).show_on_site, false);
  assert.equal(goLivePatch({ ...live, is_draft: true }, true, NOW).is_trial, true);
});

type Call = { op: string; args: unknown[] };
function fakeDb(opts: { selectErr?: boolean; updateErr?: boolean; ids?: string[] }) {
  const calls: Call[] = [];
  const db: SweepDb = {
    from: () => ({
      select: (c) => {
        calls.push({ op: "select", args: [c] });
        const chain = {
          eq: (c2: string, v: boolean) => (calls.push({ op: "eq", args: [c2, v] }), chain),
          or: (f: string) => (calls.push({ op: "or", args: [f] }), chain),
          limit: async (n: number) => {
            calls.push({ op: "limit", args: [n] });
            return opts.selectErr
              ? { data: null, error: { message: "boom" } }
              : { data: (opts.ids ?? []).map((id) => ({ id })), error: null };
          },
        };
        return chain;
      },
      update: (p) => ({
        in: async (c: string, ids: string[]) => {
          calls.push({ op: "update", args: [p, c, ids] });
          return { error: opts.updateErr ? { message: "nope" } : null };
        },
      }),
    }),
  };
  return { db, calls };
}

test("sweep issues the bounded select then update", async () => {
  const { db, calls } = fakeDb({ ids: ["a", "b"] });
  const r = await sweepStaleShowOnSite(db, NOW, 500);
  assert.deepEqual(r, { cleared: 2, failed: false });
  assert.deepEqual(calls.map((c) => c.op), ["select", "eq", "or", "limit", "update"]);
  assert.deepEqual(calls[1].args, ["show_on_site", true]);
  assert.equal(calls[2].args[0], "ends_at.lt.2026-10-15T12:00:00.000Z,archived_at.not.is.null");
  assert.deepEqual(calls[3].args, [500]);
  assert.deepEqual(calls[4].args, [{ show_on_site: false }, "id", ["a", "b"]]);
});

test("sweep with nothing stale does not update", async () => {
  const { db, calls } = fakeDb({ ids: [] });
  assert.deepEqual(await sweepStaleShowOnSite(db, NOW), { cleared: 0, failed: false });
  assert.equal(calls.some((c) => c.op === "update"), false);
});

test("sweep failures are swallowed and logged", async () => {
  const logs: string[] = [];
  assert.deepEqual(await sweepStaleShowOnSite(fakeDb({ selectErr: true }).db, NOW, 5, (m) => logs.push(m)), { cleared: 0, failed: true });
  assert.deepEqual(await sweepStaleShowOnSite(fakeDb({ ids: ["a"], updateErr: true }).db, NOW, 5, (m) => logs.push(m)), { cleared: 0, failed: true });
  assert.equal(logs.length, 2);
  const throwing: SweepDb = { from: () => { throw new Error("x"); } };
  assert.equal((await sweepStaleShowOnSite(throwing, NOW)).failed, true);
});
