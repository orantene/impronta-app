import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { delegateFirstPublish } from "./first-publish-delegate";

function fakeSb(siteRow: { site_published_at: string | null } | null) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => ({ data: siteRow, error: null });
  return { from: () => chain } as never;
}

test("F96: never-published site runs the canonical site publish", async () => {
  let calls = 0;
  const res = await delegateFirstPublish(fakeSb({ site_published_at: null }), "tp", {
    publishSite: async () => {
      calls += 1;
      return { ok: true, data: { publishedAt: "now" } } as never;
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(res, { ok: true, delegated: true });
});

test("F96: already-live site does not re-run the site publish", async () => {
  let calls = 0;
  const res = await delegateFirstPublish(fakeSb({ site_published_at: "2026-01-01" }), "tp", {
    publishSite: async () => {
      calls += 1;
      return { ok: true, data: { publishedAt: "now" } } as never;
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(res, { ok: true, delegated: false });
});

test("F96: a failed site publish surfaces the error (no false success)", async () => {
  const res = await delegateFirstPublish(fakeSb({ site_published_at: null }), "tp", {
    publishSite: async () => ({ ok: false, code: "server_error", error: "boom" }) as never,
  });
  assert.deepEqual(res, { ok: false, error: "boom" });
});

test("F96: both builder publish writers call the shared delegate and skip their own history when delegated", () => {
  for (const f of [
    "src/lib/site-admin/builder-core/adapters/talent-page-actions.ts",
    "src/lib/site-admin/builder-core/adapters/talent-site-shell-actions.ts",
  ]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.match(src, /delegateFirstPublish\(/, f);
    assert.match(src, /!first\.delegated/, f);
  }
});
