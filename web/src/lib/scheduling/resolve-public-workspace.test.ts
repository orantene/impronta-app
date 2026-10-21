import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePublicWorkspaceTenantId } from "./resolve-public-workspace";

function fake(row: { id: string; status: string | null } | null, error: unknown = null) {
  const seen: Record<string, unknown> = {};
  const chain = {
    select: () => chain,
    eq: (c: string, v: unknown) => ((seen[c] = v), chain),
    limit: () => chain,
    maybeSingle: async () => ({ data: row, error }),
  };
  return { admin: { from: () => chain } as unknown as SupabaseClient, seen };
}

test("a live workspace resolves for a signed-out guest (no relationship needed)", async () => {
  const { admin, seen } = fake({ id: "t1", status: "active" });
  assert.equal(await resolvePublicWorkspaceTenantId(admin, " QA-Journeys "), "t1");
  assert.equal(seen.slug, "qa-journeys");
});

test("cancelled, archived, unknown, empty and errored all fail closed", async () => {
  assert.equal(await resolvePublicWorkspaceTenantId(fake({ id: "t", status: "cancelled" }).admin, "a"), null);
  assert.equal(await resolvePublicWorkspaceTenantId(fake({ id: "t", status: "archived" }).admin, "a"), null);
  assert.equal(await resolvePublicWorkspaceTenantId(fake(null).admin, "a"), null);
  assert.equal(await resolvePublicWorkspaceTenantId(fake({ id: "t", status: "active" }).admin, ""), null);
  assert.equal(await resolvePublicWorkspaceTenantId(fake(null, { message: "x" }).admin, "a"), null);
});
