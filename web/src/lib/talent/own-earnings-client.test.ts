/**
 * A talent's own Money page reads her earnings with the service role once her ownership of the profile is proven
 * under her own rights; every doubt falls back to her own client (the old behaviour).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { earningsClientForOwnProfile } from "./own-earnings-client";

function userClient(opts: { uid?: string | null; profileUserId?: string | null; readError?: boolean; throws?: boolean }) {
  return {
    auth: {
      getUser: async () => {
        if (opts.throws) throw new Error("auth down");
        return { data: { user: opts.uid ? { id: opts.uid } : null } };
      },
    },
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => (opts.readError ? { data: null, error: { message: "boom" } } : { data: opts.profileUserId === undefined ? null : { user_id: opts.profileUserId }, error: null });
      return q;
    },
  } as never;
}
const SERVICE = { tag: "service" } as never;

test("her own profile: the service client, so a sale where she is not a coordinator still counts", async () => {
  const user = userClient({ uid: "u1", profileUserId: "u1" });
  assert.equal(await earningsClientForOwnProfile(user, "tp1", { serviceClient: SERVICE }), SERVICE);
});

test("another user's profile, no session, an empty or failed read, or no service role: her own client", async () => {
  assert.equal(await earningsClientForOwnProfile(userClient({ uid: "u1", profileUserId: "u2" }), "tp1", { serviceClient: SERVICE }) !== SERVICE, true);
  const noSession = userClient({ uid: null, profileUserId: "u1" });
  assert.equal(await earningsClientForOwnProfile(noSession, "tp1", { serviceClient: SERVICE }), noSession);
  const empty = userClient({ uid: "u1", profileUserId: undefined });
  assert.equal(await earningsClientForOwnProfile(empty, "tp1", { serviceClient: SERVICE }), empty);
  const failed = userClient({ uid: "u1", readError: true });
  assert.equal(await earningsClientForOwnProfile(failed, "tp1", { serviceClient: SERVICE }), failed);
  const threw = userClient({ uid: "u1", throws: true });
  assert.equal(await earningsClientForOwnProfile(threw, "tp1", { serviceClient: SERVICE }), threw);
  const own = userClient({ uid: "u1", profileUserId: "u1" });
  assert.equal(await earningsClientForOwnProfile(own, "tp1", { serviceClient: null }), own);
});

test("both Money loaders go through it", () => {
  for (const f of ["src/lib/talent/earnings.ts", "src/lib/talent/earnings-by-currency.ts"]) {
    assert.match(readFileSync(f, "utf8"), /earningsClientForOwnProfile\(supabase, talentProfileId\)/, f);
  }
});
