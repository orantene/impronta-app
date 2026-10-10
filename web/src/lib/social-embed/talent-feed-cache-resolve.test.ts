import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveTalentSocialFeedDataSources } from "./talent-feed-cache";

/** Chainable fake of the one read `readTalentCachedFeedItems` performs. */
function fakeAdmin(rows: Array<Record<string, unknown>>, error: unknown = null) {
  const calls: Array<{ table: string; talent?: string; provider?: string; hidden?: boolean }> = [];
  const from = (table: string) => {
    const call: { table: string; talent?: string; provider?: string; hidden?: boolean } = { table };
    calls.push(call);
    const chain = {
      select: () => chain,
      eq: (col: string, value: unknown) => {
        if (col === "talent_profile_id") call.talent = String(value);
        if (col === "provider") call.provider = String(value);
        if (col === "hidden") call.hidden = Boolean(value);
        return chain;
      },
      order: () => chain,
      limit: async () => ({ data: error ? null : rows, error }),
    };
    return chain;
  };
  return { admin: { from } as unknown as SupabaseClient, calls };
}

const IG_ROW = { external_id: "ig1", media_url: "https://cdn/ig1.jpg", media_type: "image" };

test("talent feed reads the talent table, scoped to the profile, hidden excluded", async () => {
  const { admin, calls } = fakeAdmin([IG_ROW]);
  const out = await resolveTalentSocialFeedDataSources(admin, "talent-a", ["instagram"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.table, "talent_social_feed_items");
  assert.equal(calls[0]?.talent, "talent-a");
  assert.equal(calls[0]?.provider, "instagram");
  assert.equal(calls[0]?.hidden, false);
  assert.deepEqual(out.instagram?.map((i) => i.id), ["ig1"]);
});

test("a TikTok-only block reads nothing for a talent", async () => {
  const { admin, calls } = fakeAdmin([IG_ROW]);
  assert.deepEqual(await resolveTalentSocialFeedDataSources(admin, "t", ["tiktok"]), {});
  assert.equal(calls.length, 0);
});

test("a mixed block reads the Instagram list under its own key", async () => {
  const { admin } = fakeAdmin([IG_ROW]);
  const out = await resolveTalentSocialFeedDataSources(admin, "t", ["instagram", "tiktok"]);
  assert.deepEqual(out.mixed?.map((i) => i.id), ["ig1"]);
});

test("a read failure (e.g. table not migrated yet) is an empty list, not a throw", async () => {
  const { admin } = fakeAdmin([], { message: "relation does not exist" });
  const out = await resolveTalentSocialFeedDataSources(admin, "t", ["instagram"]);
  assert.deepEqual(out.instagram, []);
});
