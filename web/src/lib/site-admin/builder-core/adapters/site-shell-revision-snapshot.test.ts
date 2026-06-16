/**
 * A2 follow-up — pure tests for the shell revision snapshot/version helpers
 * (node:test + node:assert, NO React / Supabase / "use server" graph). The
 * snapshot must round-trip through the SAME `builderTree` key the existing
 * revisions machinery reads, so a shell revision is restorable + diffable.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildShellRevisionSnapshot,
  nextRevisionVersion,
} from "./site-shell-revision-snapshot";
import { parseBuilderTreeFromSnapshot } from "@/lib/site-admin/edit-mode/composition-revision-snapshot";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

const TREE: BuilderNodeTree = [
  {
    id: "shell:header",
    kind: "section",
    props: { sectionTypeKey: "site_header", slotKey: "header", sortOrder: 0 },
    children: [{ id: "h1", kind: "heading", props: { text: "Brand", level: 2 } }],
  },
];

test("buildShellRevisionSnapshot carries the tree under builderTree", () => {
  const snap = buildShellRevisionSnapshot({ title: "Shell", blocks: TREE });
  assert.equal(snap.title, "Shell");
  assert.deepEqual(snap.builderTree, TREE);
  // Round-trips through the SAME parser the revisions drawer / restore use, so a
  // shell revision is restorable + diffable exactly like a cms_page revision.
  assert.deepEqual(parseBuilderTreeFromSnapshot(snap), TREE);
});

test("buildShellRevisionSnapshot normalises a non-array blocks to an empty tree", () => {
  for (const bad of [null, undefined, {}, "[]", 7]) {
    const snap = buildShellRevisionSnapshot({ title: "x", blocks: bad });
    assert.deepEqual(snap.builderTree, []);
  }
});

test("nextRevisionVersion is max + 1, defaulting to 1 for the first revision", () => {
  assert.equal(nextRevisionVersion(undefined), 1);
  assert.equal(nextRevisionVersion(null), 1);
  assert.equal(nextRevisionVersion(0), 1);
  assert.equal(nextRevisionVersion(4), 5);
});
