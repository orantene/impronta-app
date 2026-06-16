/**
 * site_shell EDIT-surface tree shaping + routing predicate (Builder Studio
 * WS-A A2) — pure unit tests (node:test + node:assert, NO React / Supabase).
 *
 * Covers:
 *   1. the slim landmark+children node shape `buildSlimShellSectionNode`;
 *   2. `slimShellTree` reduces a mixed/divergent shell tree to the two
 *      landmarks in header→footer order, preserving children, dropping noise;
 *   3. `isShellLandmarkNode` narrows correctly;
 *   4. the `shouldRouteSiteShellSurface` flag is OFF by default (the flag-off
 *      parity guarantee) and ON only when the env master switch green-lights it.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  BuilderNode,
  BuilderNodeTree,
} from "@/lib/site-admin/builder-node/types";
import {
  SHELL_SLOT_ORDER,
  buildSlimShellSectionNode,
  isShellLandmarkNode,
  slimShellTree,
} from "./site-shell-surface-tree";

/** Minimal typed child node — only identity is asserted, so the inner prop
 *  shape is irrelevant; this keeps the test off the strict node-prop unions. */
function childNode(id: string): BuilderNode {
  return { id, kind: "heading", props: { text: id } } as BuilderNode;
}
import {
  shouldRouteSiteShellSurface,
  readSiteShellEditMode,
} from "@/lib/site-admin/site-shell-flag";

const TENANT = "tenant-001";

// ── slim node shape ────────────────────────────────────────────────────────────

test("[A2] buildSlimShellSectionNode emits a landmark section with children", () => {
  const child = childNode("n-logo");
  const node = buildSlimShellSectionNode({
    id: "shell:header",
    slotKey: "header",
    children: [child],
    label: "Site header",
  });
  assert.equal(node.kind, "section");
  assert.equal(node.props.sectionTypeKey, "site_header");
  assert.equal(node.props.slotKey, "header");
  assert.equal(node.props.sortOrder, 0);
  assert.equal(node.props.label, "Site header");
  assert.deepEqual(node.children, [child]);
});

test("[A2] footer landmark sorts after the header (sortOrder 1)", () => {
  const node = buildSlimShellSectionNode({ id: "shell:footer", slotKey: "footer" });
  assert.equal(node.props.sectionTypeKey, "site_footer");
  assert.equal(node.props.slotKey, "footer");
  assert.equal(node.props.sortOrder, 1);
  assert.deepEqual(node.children, []);
});

// ── isShellLandmarkNode ────────────────────────────────────────────────────────

test("[A2] isShellLandmarkNode narrows header/footer sections only", () => {
  const header = buildSlimShellSectionNode({ id: "h", slotKey: "header" });
  const footer = buildSlimShellSectionNode({ id: "f", slotKey: "footer" });
  assert.equal(isShellLandmarkNode(header), true);
  assert.equal(isShellLandmarkNode(footer), true);
  const heroSection: BuilderNode = {
    id: "hero",
    kind: "section",
    props: { sectionTypeKey: "hero" },
  };
  assert.equal(isShellLandmarkNode(heroSection), false);
  assert.equal(isShellLandmarkNode(childNode("t")), false);
});

// ── slimShellTree ──────────────────────────────────────────────────────────────

test("[A2] slimShellTree keeps both landmarks in header→footer order, preserving children", () => {
  // Source order is footer-first + a stray non-landmark node to drop.
  const tree: BuilderNodeTree = [
    {
      id: "f-sec",
      kind: "section",
      props: { sectionTypeKey: "site_footer", slotKey: "footer" },
      children: [childNode("f-cta")],
    },
    childNode("stray"),
    {
      id: "h-sec",
      kind: "section",
      props: { sectionTypeKey: "site_header", slotKey: "header" },
      children: [childNode("h-nav")],
    },
  ];
  const slim = slimShellTree(tree);
  assert.equal(slim.length, 2, "only the two landmarks survive");
  assert.equal(slim[0]!.props.sectionTypeKey, "site_header");
  assert.equal(slim[1]!.props.sectionTypeKey, "site_footer");
  // children preserved on each landmark
  assert.deepEqual(slim[0]!.children?.map((c) => c.id), ["h-nav"]);
  assert.deepEqual(slim[1]!.children?.map((c) => c.id), ["f-cta"]);
});

test("[A2] slimShellTree is idempotent", () => {
  const tree: BuilderNodeTree = [
    buildSlimShellSectionNode({ id: "h", slotKey: "header" }),
    buildSlimShellSectionNode({ id: "f", slotKey: "footer" }),
  ];
  assert.deepEqual(slimShellTree(slimShellTree(tree)), slimShellTree(tree));
});

test("[A2] slimShellTree infers the slot from sectionTypeKey when slotKey is absent", () => {
  const tree: BuilderNodeTree = [
    { id: "h", kind: "section", props: { sectionTypeKey: "site_header" } },
  ];
  const slim = slimShellTree(tree);
  assert.equal(slim.length, 1);
  assert.equal(slim[0]!.props.slotKey, "header");
});

test("[A2] SHELL_SLOT_ORDER is header then footer", () => {
  assert.deepEqual([...SHELL_SLOT_ORDER], ["header", "footer"]);
});

// ── routing flag: OFF by default (flag-off parity) ─────────────────────────────

test("[A2] shouldRouteSiteShellSurface is OFF by default (no env)", () => {
  const prevMode = process.env.ENABLE_SITE_SHELL_EDIT;
  const prevList = process.env.SITE_SHELL_EDIT_TENANT_IDS;
  delete process.env.ENABLE_SITE_SHELL_EDIT;
  delete process.env.SITE_SHELL_EDIT_TENANT_IDS;
  try {
    assert.equal(readSiteShellEditMode(), "off");
    assert.equal(shouldRouteSiteShellSurface(TENANT), false);
  } finally {
    if (prevMode === undefined) delete process.env.ENABLE_SITE_SHELL_EDIT;
    else process.env.ENABLE_SITE_SHELL_EDIT = prevMode;
    if (prevList === undefined) delete process.env.SITE_SHELL_EDIT_TENANT_IDS;
    else process.env.SITE_SHELL_EDIT_TENANT_IDS = prevList;
  }
});

test("[A2] shouldRouteSiteShellSurface ON only when the master switch is on", () => {
  const prevMode = process.env.ENABLE_SITE_SHELL_EDIT;
  const prevList = process.env.SITE_SHELL_EDIT_TENANT_IDS;
  try {
    process.env.ENABLE_SITE_SHELL_EDIT = "all";
    delete process.env.SITE_SHELL_EDIT_TENANT_IDS;
    assert.equal(shouldRouteSiteShellSurface(TENANT), true);

    // tenants mode → only the allow-listed tenant routes.
    process.env.ENABLE_SITE_SHELL_EDIT = "tenants";
    process.env.SITE_SHELL_EDIT_TENANT_IDS = TENANT;
    assert.equal(shouldRouteSiteShellSurface(TENANT), true);
    assert.equal(shouldRouteSiteShellSurface("other-tenant"), false);
  } finally {
    if (prevMode === undefined) delete process.env.ENABLE_SITE_SHELL_EDIT;
    else process.env.ENABLE_SITE_SHELL_EDIT = prevMode;
    if (prevList === undefined) delete process.env.SITE_SHELL_EDIT_TENANT_IDS;
    else process.env.SITE_SHELL_EDIT_TENANT_IDS = prevList;
  }
});
