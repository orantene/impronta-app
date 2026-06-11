import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recoverBuilderTreeIfEmpty } from "./recover-builder-tree";

// Guards the homepage draft empty-load recovery (incident 2026-06-11): the
// editor / publish load the revision WHERE version = page.version; when that row
// is empty we must fall back to the latest revision that actually has content.

const tree = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `n${i}`, kind: "container" }));

function mockSupabase(
  revisions: Array<{ snapshot: { builderTree?: unknown } | null }>,
): SupabaseClient {
  const q = {
    from: () => q,
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: () => Promise.resolve({ data: revisions }),
  };
  return q as unknown as SupabaseClient;
}

const params = (hasSlots: boolean) => ({
  tenantId: "t",
  pageId: "p",
  pageVersion: 5,
  hasSlots,
});

test("keeps the version-matched tree when it has real content (>1 node)", async () => {
  const vm = tree(15);
  const out = await recoverBuilderTreeIfEmpty(mockSupabase([]), params(false), vm);
  assert.equal(out, vm);
});

test("keeps the version-matched tree when the composition has slots (no recovery)", async () => {
  const vm = tree(1); // empty-ish, but slots present
  const out = await recoverBuilderTreeIfEmpty(
    mockSupabase([{ snapshot: { builderTree: tree(15) } }]),
    params(true),
    vm,
  );
  assert.equal(out, vm);
});

test("recovers the latest non-empty revision when version-matched is empty + no slots", async () => {
  const good = tree(15);
  const out = await recoverBuilderTreeIfEmpty(
    mockSupabase([
      { snapshot: { builderTree: tree(1) } }, // newest = empty
      { snapshot: { builderTree: good } }, // older = good
    ]),
    params(false),
    tree(1),
  );
  assert.equal(out, good);
});

test("returns the original empty tree when no non-empty revision exists (new page)", async () => {
  const vm = tree(0);
  const out = await recoverBuilderTreeIfEmpty(
    mockSupabase([{ snapshot: { builderTree: tree(1) } }, { snapshot: null }]),
    params(false),
    vm,
  );
  assert.equal(out, vm);
});
