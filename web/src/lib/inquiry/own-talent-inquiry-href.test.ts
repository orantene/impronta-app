import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ownTalentInquiryHref } from "./own-talent-inquiry-href";

const INQ = "1bf92cf3-0746-4d1d-9e69-462947a1984f";
const OWNER = "f4fb4251-2b8f-4f1c-87fd-5b1855bc8695";
const ROSA = "f851d834-f019-4caa-a3c8-cd512f6aec70";

type Filters = Record<string, unknown>;

function fakeAdmin(tables: {
  talent_profiles?: { data?: unknown; error?: unknown; seen?: Filters[] };
  inquiry_participants?: { data?: unknown; error?: unknown; seen?: Filters[] };
}): SupabaseClient {
  const fake = {
    from(table: string) {
      const spec = tables[table as keyof typeof tables] ?? { data: [] };
      const filters: Filters = {};
      spec.seen?.push(filters);
      const chain = {
        select: () => chain,
        eq: (k: string, v: unknown) => ((filters[`eq:${k}`] = v), chain),
        in: (k: string, v: unknown) => ((filters[`in:${k}`] = v), chain),
        is: (k: string, v: unknown) => ((filters[`is:${k}`] = v), chain),
        limit: () => chain,
        then: (resolve: (r: { data: unknown; error: unknown }) => unknown) =>
          resolve({ data: spec.data ?? null, error: spec.error ?? null }),
      };
      return chain;
    },
  };
  return fake as unknown as SupabaseClient;
}

test("the owner's own myself booking in another workspace → their talent inbox", async () => {
  const seen: Filters[] = [];
  const admin = fakeAdmin({
    talent_profiles: { data: [{ id: ROSA }] },
    inquiry_participants: { data: [{ id: "p1" }], seen },
  });
  assert.equal(await ownTalentInquiryHref(admin, OWNER, INQ), `/talent/inbox/${INQ}`);
  assert.equal(seen[0]?.["eq:inquiry_id"], INQ);
  assert.equal(seen[0]?.["eq:role"], "talent");
  assert.deepEqual(seen[0]?.["in:talent_profile_id"], [ROSA]);
  assert.equal(seen[0]?.["is:removed_at"], null);
});

test("someone else's inquiry stays not-found", async () => {
  const admin = fakeAdmin({
    talent_profiles: { data: [{ id: ROSA }] },
    inquiry_participants: { data: [] },
  });
  assert.equal(await ownTalentInquiryHref(admin, OWNER, INQ), null);
});

test("no talent profile, no user, or a read error → null (falls back to not-found)", async () => {
  assert.equal(await ownTalentInquiryHref(fakeAdmin({ talent_profiles: { data: [] } }), OWNER, INQ), null);
  assert.equal(await ownTalentInquiryHref(fakeAdmin({}), null, INQ), null);
  assert.equal(
    await ownTalentInquiryHref(fakeAdmin({ talent_profiles: { error: { message: "boom" } } }), OWNER, INQ),
    null,
  );
  assert.equal(
    await ownTalentInquiryHref(
      fakeAdmin({ talent_profiles: { data: [{ id: ROSA }] }, inquiry_participants: { error: { message: "boom" } } }),
      OWNER,
      INQ,
    ),
    null,
  );
});
