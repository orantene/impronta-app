/**
 * TUL-1632: saving a service's photos never leaves it with none.
 *
 * A fake Supabase client records every call in order, so the tests check the real behaviour:
 * the new links are written before the old ones are removed, a failed write removes nothing,
 * and a failed clean-up never loses a photo.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { replaceOfferingPhotoLinks } from "./offering-photo-links";

type Call = { op: "upsert" | "delete"; rows?: unknown; opts?: unknown; filters: string[] };

function fake(fail: { upsert?: boolean; delete?: boolean } = {}) {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      assert.equal(table, "talent_offering_media");
      return {
        upsert(rows: unknown, opts: unknown) {
          calls.push({ op: "upsert", rows, opts, filters: [] });
          return Promise.resolve({ error: fail.upsert ? { message: "boom" } : null });
        },
        delete() {
          const call: Call = { op: "delete", filters: [] };
          calls.push(call);
          const result = () => Promise.resolve({ error: fail.delete ? { message: "boom" } : null });
          const afterEq = {
            not(col: string, op: string, val: string) {
              call.filters.push(`not ${col} ${op} ${val}`);
              return result();
            },
            then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
              return result().then(resolve, reject);
            },
          };
          return {
            eq(col: string, val: string) {
              call.filters.push(`eq ${col} ${val}`);
              return afterEq;
            },
          };
        },
      };
    },
  };
  return { admin, calls };
}

test("writes the new links first, with their order, then removes only the links that are no longer wanted", async () => {
  const { admin, calls } = fake();
  const res = await replaceOfferingPhotoLinks(admin, "off-1", ["m-a", "m-b", "m-c"]);
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(calls.map((c) => c.op), ["upsert", "delete"]);
  assert.deepEqual(calls[0].rows, [
    { offering_id: "off-1", media_asset_id: "m-a", sort_order: 0 },
    { offering_id: "off-1", media_asset_id: "m-b", sort_order: 1 },
    { offering_id: "off-1", media_asset_id: "m-c", sort_order: 2 },
  ]);
  assert.deepEqual(calls[0].opts, { onConflict: "offering_id,media_asset_id" });
  assert.deepEqual(calls[1].filters, ["eq offering_id off-1", "not media_asset_id in (m-a,m-b,m-c)"]);
});

test("a failed write removes nothing: the old photos stay", async () => {
  const { admin, calls } = fake({ upsert: true });
  const res = await replaceOfferingPhotoLinks(admin, "off-1", ["m-a"]);
  assert.equal(res.ok, false);
  assert.equal(!res.ok && res.stage, "write");
  assert.deepEqual(calls.map((c) => c.op), ["upsert"], "no delete may run after a failed write");
});

test("a failed clean-up reports it, and the new photos are already in place (nothing is lost)", async () => {
  const { admin, calls } = fake({ delete: true });
  const res = await replaceOfferingPhotoLinks(admin, "off-1", ["m-a", "m-b"]);
  assert.equal(res.ok, false);
  assert.equal(!res.ok && res.stage, "clear");
  assert.deepEqual(calls.map((c) => c.op), ["upsert", "delete"]);
});

test("clearing the gallery (no photos wanted) writes nothing and removes every link for that service", async () => {
  const { admin, calls } = fake();
  const res = await replaceOfferingPhotoLinks(admin, "off-1", []);
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(calls.map((c) => c.op), ["delete"]);
  assert.deepEqual(calls[0].filters, ["eq offering_id off-1"]);
});

test("setOfferingImages uses the helper and no longer deletes every link before inserting", () => {
  const src = readFileSync(new URL("./offerings-actions.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function setOfferingImages"), src.indexOf("export type PortfolioPhoto"));
  assert.match(body, /replaceOfferingPhotoLinks\(admin, offeringId, wanted\)/);
  assert.doesNotMatch(body, /offeringMediaTable\(admin\)\.delete\(\)/, "no blanket delete before the write");
  assert.doesNotMatch(body, /offeringMediaTable\(admin\)\.insert\(/, "no plain insert after a blanket delete");
  // The ownership checks that guard every photo id are still there.
  assert.match(body, /owner_talent_profile_id/);
  assert.match(body, /One of those photos is not in your portfolio/);
});
