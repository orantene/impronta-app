import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recoverBuilderTreeIfEmpty } from "./recover-builder-tree";

// Guards the homepage draft empty-load recovery (incident 2026-06-11): the
// editor / publish load the revision WHERE version = page.version; when that row
// is empty we must fall back to the latest revision that actually has content.

const tree = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `n${i}`, kind: "container" }));

// A single ROOT container holding N section children — the post-restructure
// homepage shape (top-level length 1, but full of real content). The freeform
// page-design bake also produces this shape.
const rootWithChildren = (childCount: number) => [
  {
    id: "root",
    kind: "container",
    children: Array.from({ length: childCount }, (_, i) => ({
      id: `c${i}`,
      kind: "container",
    })),
  },
];

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

test("keeps a full single-root container tree and does NOT recover a stale revision (regression: 2026-06-12 garbage draft)", async () => {
  // The version-matched tree is ONE root container with 9 children (top-level
  // length 1, but 10 nodes recursively). The buggy top-level count called this
  // "empty" and recovered the stale 15-node garbage revision below; the fix
  // keeps the real tree.
  const vm = rootWithChildren(9);
  const stale = tree(15); // older revision that previously (wrongly) won
  const out = await recoverBuilderTreeIfEmpty(
    mockSupabase([{ snapshot: { builderTree: stale } }]),
    params(false),
    vm,
  );
  assert.equal(out, vm);
});

test("still recovers when the version-matched single root container is EMPTY (no children)", async () => {
  const good = rootWithChildren(9);
  const empty = [{ id: "root", kind: "container", children: [] }];
  const out = await recoverBuilderTreeIfEmpty(
    mockSupabase([
      { snapshot: { builderTree: empty } }, // newest = empty container
      { snapshot: { builderTree: good } }, // older = good
    ]),
    params(false),
    empty,
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
