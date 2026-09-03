/**
 * shell-landmark-config.test.ts
 *
 * THE PROPERTY: the shell header/footer inspectors resolve to a WRITE TARGET in
 * every state of the Phase 8B migration — including the one that has no
 * `cms_sections` row at all.
 *
 * WHAT THIS COVERS THAT `shell-inspector-writes-node.test.ts` DOES NOT
 * --------------------------------------------------------------------------
 * That file (#1509) proves the MECHANISM: a save reaches the store the renderer
 * reads, children survive, ownership is followed and never created. It assumes
 * a section row exists, because on its design one always did — the mirror is a
 * follow-up to a row write.
 *
 * This file covers the DECISION that sits in front of it: given a shell page,
 * which store is the write target at all? That is where the node-only state was
 * lost. `resolveHeaderSection` / `resolveFooterSection` began at the slot
 * pointer, so once Phase 8B deletes the anchors they returned `null` and both
 * inspectors failed with `NOT_FOUND` — the shell editor dies on a real agency's
 * live site the moment the migration completes. A mirror cannot rescue that:
 * there is no row write to mirror from.
 *
 * These are unit tests over the pure layer on purpose. `site-header/actions.ts`
 * and `site-footer/actions.ts` are `"use server"` modules the node runner cannot
 * import (see `reference_server_only_import_breaks_test_lanes`), which is
 * exactly why the decision was factored out of them: the part that can be wrong
 * is now the part that can be tested. The static guards in
 * `shell-inspector-writes-node.test.ts` [N14-N18] prove the actions are wired
 * to it.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { BuilderNode, BuilderNodeTree } from "../builder-node/types";
import { resolveShellLandmarkSectionProps } from "../builder-node/shell-render-plan";
import {
  pickShellLandmarkTarget,
  readLandmarkInlineProps,
  type ShellLandmarkSectionCandidate,
} from "./shell-landmark-config";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function landmark(
  sectionTypeKey: "site_header" | "site_footer",
  extraProps: Record<string, unknown> = {},
): BuilderNode {
  return {
    id: `node-${sectionTypeKey}`,
    kind: "section",
    props: {
      sectionTypeKey,
      sectionId: `sec-${sectionTypeKey}`,
      slotKey: sectionTypeKey === "site_header" ? "header" : "footer",
      sortOrder: 0,
      ...extraProps,
    },
    children: [],
  } as unknown as BuilderNode;
}

const SECTION: ShellLandmarkSectionCandidate = {
  sectionId: "sec-1",
  sectionTypeKey: "site_footer",
  schemaVersion: 1,
  name: "Site footer",
  version: 7,
  locale: "en",
  props: { columns: 3, source: "slot-row" },
};

const NODE_BASE = { pageId: "page-1", pageVersion: 12, locale: "en" };

function nodeFor(tree: BuilderNodeTree) {
  return { ...NODE_BASE, inlineProps: readLandmarkInlineProps(tree, "footer") };
}

// ── The migration states ─────────────────────────────────────────────────────

test("[S1] slot-only — every tenant today — writes through the section row", () => {
  const target = pickShellLandmarkTarget({
    node: nodeFor([]),
    section: SECTION,
  });

  assert.equal(target.kind, "section");
  assert.equal(target.kind === "section" && target.sectionId, "sec-1");
  // The CAS token stays `cms_sections.version` on this path — unchanged, which
  // is what keeps `saveSectionDraftAction`'s Zod / audit / revision spine.
  assert.equal(target.kind === "section" && target.version, 7);
  assert.deepEqual(target.kind === "section" && target.props, SECTION.props);
});

test("[S2] node + slot with NO inline props still writes through the section row", () => {
  const tree: BuilderNodeTree = [landmark("site_footer")];
  assert.equal(readLandmarkInlineProps(tree, "footer"), null);

  const target = pickShellLandmarkTarget({ node: nodeFor(tree), section: SECTION });
  assert.equal(target.kind, "section");
  assert.equal(
    target.kind === "section" && target.nodeInlineProps,
    null,
    "nothing to mirror onto — the caller must perform no cms_pages write",
  );
});

test("[S3] node + slot WITH inline props: row is the spine, node is what we display", () => {
  // #1509's design, kept deliberately. The row still carries Zod + CAS + audit +
  // revision and is 8B's rollback target, so it stays the write spine; the
  // caller mirrors onto the node. But the DISPLAYED value must be the node's,
  // because that is what the renderer reads.
  const inline = { columns: 4, source: "node" };
  const tree: BuilderNodeTree = [landmark("site_footer", { sectionProps: inline })];

  const target = pickShellLandmarkTarget({ node: nodeFor(tree), section: SECTION });

  assert.equal(target.kind, "section");
  assert.equal(target.kind === "section" && target.version, 7);
  assert.deepEqual(
    target.kind === "section" && target.props,
    inline,
    "showing the ROW here would put a stale header in the drawer and then save " +
      "it back over the node",
  );
  assert.deepEqual(target.kind === "section" && target.nodeInlineProps, inline);

  // The displayed value and the RENDERED value must be the same value.
  assert.deepEqual(
    resolveShellLandmarkSectionProps(tree[0], { props: SECTION.props }),
    target.kind === "section" ? target.props : null,
  );
});

test("[S4] node-only — post Phase 8B — resolves to the NODE instead of nothing", () => {
  const inline = { columns: 2, source: "node-only" };
  const tree: BuilderNodeTree = [landmark("site_footer", { sectionProps: inline })];

  const target = pickShellLandmarkTarget({
    node: nodeFor(tree),
    section: null, // the anchor row is gone
  });

  assert.equal(
    target.kind,
    "node",
    "with the anchor row deleted this must still resolve; `none` here is the " +
      "NOT_FOUND that kills the shell editor on a real agency's live site",
  );
  assert.deepEqual(target.kind === "node" && target.props, inline);
  // CAS moves to the shell page's own version — the only lock left.
  assert.equal(target.kind === "node" && target.version, 12);
  assert.equal(target.kind === "node" && target.pageId, "page-1");
});

test("[S5] neither node nor section is an honest `none`, never an empty success", () => {
  assert.equal(pickShellLandmarkTarget({ node: nodeFor([]), section: null }).kind, "none");
  // And with no shell page at all.
  assert.equal(pickShellLandmarkTarget({}).kind, "none");
});

test("[S6] node-only with a landmark that does NOT own its props is `none`", () => {
  // No row and no inline props means nothing holds this landmark's config.
  // Promoting it here would create ownership the operator never asked for —
  // the rule `applyShellLandmarkSectionProps` and `hydrateShellLandmarkSectionProps`
  // both refuse. An honest empty state is the only correct answer.
  const tree: BuilderNodeTree = [landmark("site_footer")];
  assert.equal(pickShellLandmarkTarget({ node: nodeFor(tree), section: null }).kind, "none");
});

test("[S7] a non-object `sectionProps` is NOT ownership — it falls to the slot", () => {
  for (const bad of [null, "nope", 42, ["a"], undefined]) {
    const tree: BuilderNodeTree = [
      landmark("site_footer", { sectionProps: bad as never }),
    ];
    assert.equal(
      readLandmarkInlineProps(tree, "footer"),
      null,
      `sectionProps=${JSON.stringify(bad)} must not count as node ownership`,
    );
    // The same conclusion the renderer reaches, which is the point.
    assert.deepEqual(
      resolveShellLandmarkSectionProps(tree[0], { props: SECTION.props }),
      SECTION.props,
    );
    // And with no row, a landmark like that has no owner at all.
    assert.equal(
      pickShellLandmarkTarget({ node: nodeFor(tree), section: null }).kind,
      "none",
    );
  }
});

test("[S8] the sides do not cross — a header landmark does not answer for the footer", () => {
  const tree: BuilderNodeTree = [
    landmark("site_header", { sectionProps: { variant: "compact" } }),
  ];
  assert.deepEqual(readLandmarkInlineProps(tree, "header"), {
    variant: "compact",
  });
  assert.equal(readLandmarkInlineProps(tree, "footer"), null);
  // A half-migrated shell: header node-owned, footer still on its row.
  assert.equal(
    pickShellLandmarkTarget({ node: nodeFor(tree), section: null }).kind,
    "none",
  );
});

test("[S9] a non-array tree is treated as no tree, not a crash", () => {
  assert.equal(readLandmarkInlineProps(null, "footer"), null);
  assert.equal(readLandmarkInlineProps(undefined, "header"), null);
  assert.equal(
    readLandmarkInlineProps("not a tree" as unknown as BuilderNodeTree, "header"),
    null,
  );
});
