/**
 * Posts v1 P6: the "AI can read my site" write path.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test src/lib/cms/posts-ai-toggle.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { setReadOnlyProbeForTests } from "@/lib/impersonation/readonly-guard";
import { talentSetAiCrawlersAllowedAction, workspaceSetAiCrawlersAllowedAction } from "@/lib/server-actions/posts-ai-toggle-actions";
import { writeAiCrawlersAllowed } from "./posts-ai-toggle";

type Call = { table: string; patch: Record<string, unknown>; col: string; val: string };

function fakeDb(rowsByTable: Record<string, number>, failWith?: string) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    update: (patch: Record<string, unknown>) => ({
      eq: (col: string, val: string) => ({
        select: async () => {
          calls.push({ table, patch, col, val });
          if (failWith) return { data: null, error: { message: failWith } };
          const n = rowsByTable[table] ?? 0;
          return { data: Array.from({ length: n }, () => ({ ai_crawlers_allowed: patch.ai_crawlers_allowed })), error: null };
        },
      }),
    }),
  });
  return { db: { from } as unknown as SupabaseClient, calls };
}

test("talent scope writes only its own talent_sites row and returns the new value", async () => {
  const f = fakeDb({ talent_sites: 1 });
  const res = await writeAiCrawlersAllowed(f.db, { kind: "talent", talentProfileId: "t-1" }, false);
  assert.deepEqual(res, { ok: true, allowed: false });
  assert.deepEqual(f.calls, [{ table: "talent_sites", patch: { ai_crawlers_allowed: false }, col: "talent_profile_id", val: "t-1" }]);
});

test("tenant scope writes only its own agency_branding row", async () => {
  const f = fakeDb({ agency_branding: 1 });
  const res = await writeAiCrawlersAllowed(f.db, { kind: "tenant", tenantId: "ten-9" }, true);
  assert.deepEqual(res, { ok: true, allowed: true });
  assert.deepEqual(f.calls, [{ table: "agency_branding", patch: { ai_crawlers_allowed: true }, col: "tenant_id", val: "ten-9" }]);
});

test("non-boolean input is rejected before any write", async () => {
  const f = fakeDb({ talent_sites: 1 });
  for (const bad of ["false", 0, null, undefined, {}]) {
    const res = await writeAiCrawlersAllowed(f.db, { kind: "talent", talentProfileId: "t-1" }, bad);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, "invalid_input");
  }
  assert.equal(f.calls.length, 0);
});

test("db error and missing row surface as failures", async () => {
  const err = await writeAiCrawlersAllowed(fakeDb({}, "boom").db, { kind: "talent", talentProfileId: "t" }, true);
  assert.equal(err.ok, false);
  if (!err.ok) assert.equal(err.code, "write_failed");
  const none = await writeAiCrawlersAllowed(fakeDb({ talent_sites: 0 }).db, { kind: "talent", talentProfileId: "t" }, true);
  assert.equal(none.ok, false);
  if (!none.ok) assert.equal(none.code, "not_found");
});

test("both actions refuse while impersonating (before any guard or write)", async () => {
  setReadOnlyProbeForTests({ hasCookie: async () => true, isImpersonating: async () => true });
  try {
    const a = await talentSetAiCrawlersAllowedAction(false);
    const b = await workspaceSetAiCrawlersAllowedAction(false);
    assert.equal(a.ok, false);
    assert.equal(b.ok, false);
  } finally {
    setReadOnlyProbeForTests(null);
  }
});
