import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveSocialFeedDataSources } from "./feed-cache";

/**
 * A chainable fake of the one PostgREST read `readCachedFeedItems` performs.
 * Records the (tenant, provider) filters so the test can assert scoping, and
 * answers per provider so a mixed request proves both keys are populated.
 */
function fakeAdmin(rowsByProvider: Record<string, Array<Record<string, unknown>>>) {
  const calls: Array<{ tenant?: string; provider?: string; hidden?: boolean }> = [];
  const from = () => {
    const call: { tenant?: string; provider?: string; hidden?: boolean } = {};
    calls.push(call);
    const chain = {
      select: () => chain,
      eq: (col: string, value: unknown) => {
        if (col === "tenant_id") call.tenant = String(value);
        if (col === "provider") call.provider = String(value);
        if (col === "hidden") call.hidden = Boolean(value);
        return chain;
      },
      order: () => chain,
      limit: async () => ({ data: rowsByProvider[call.provider ?? ""] ?? [], error: null }),
    };
    return chain;
  };
  return { admin: { from } as unknown as SupabaseClient, calls };
}

test("no providers means no read and an empty map", async () => {
  const { admin, calls } = fakeAdmin({});
  assert.deepEqual(await resolveSocialFeedDataSources(admin, "t1", []), {});
  assert.equal(calls.length, 0);
});

test("one read per provider, scoped to the tenant, hidden rows excluded", async () => {
  const { admin, calls } = fakeAdmin({
    instagram: [{ external_id: "ig1", media_url: "https://cdn/ig1.jpg", media_type: "image" }],
    tiktok: [{ external_id: "tt1", media_url: "https://cdn/tt1.jpg", media_type: "image" }],
  });
  const out = await resolveSocialFeedDataSources(admin, "tenant-a", ["instagram", "tiktok", "instagram"]);
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal(c.tenant, "tenant-a");
    assert.equal(c.hidden, false);
  }
  assert.deepEqual(out.instagram?.map((i) => i.id), ["ig1"]);
  assert.deepEqual(out.tiktok?.map((i) => i.id), ["tt1"]);
  // A "mixed" block looks up its own key.
  assert.deepEqual(out.mixed?.map((i) => i.id), ["ig1", "tt1"]);
});

test("a single provider request populates only that key", async () => {
  const { admin } = fakeAdmin({ tiktok: [] });
  const out = await resolveSocialFeedDataSources(admin, "t", ["tiktok"]);
  assert.deepEqual(Object.keys(out), ["tiktok"]);
});
