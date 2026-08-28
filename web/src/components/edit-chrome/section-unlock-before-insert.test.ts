/**
 * section-unlock-before-insert.test.ts
 *
 * Trap 1 guard — a block added INSIDE a curated section must survive the next
 * curated field edit.
 *
 * The bug: `BUILDER_NODE_REGISTRY.section.children` allows 22 child kinds, so
 * the canvas offered "Add block inside" on a LOCKED curated section. But
 * `syncBuilderTreeSectionChildren` re-derives a non-ejected section's children
 * from the curated config on the next field edit, so the block vanished with no
 * warning and no undo affordance. `syncBuilderTreeSectionChildren` already
 * returns early for `props.ejected`, so the fix is for the insert path to
 * UNLOCK FIRST — `unlockSectionBeforeInsert`.
 *
 * The `ejectSection` injected below is the shape production passes in:
 * `EditContext.ejectSection` = `runEjectSection` (eject-lossless.ts), which
 * resolves the saved per-role presentation and commits exactly this
 * `ejectSectionInTree(tree, id, presentation)` patch through the undo spine.
 * Stubbing at that seam keeps the test off the server action while exercising
 * the real tree transform.
 *
 * Lane: `test:builder-chrome` (globs `src/components/edit-chrome`).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLegacySectionBuilderTree } from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import { ejectSectionInTree } from "@/lib/site-admin/builder-node/section-eject";
import { insertBuilderNode } from "@/lib/site-admin/builder-node/operations";
import type {
  BuilderNode,
  BuilderNodeTree,
} from "@/lib/site-admin/builder-node/types";

import { syncBuilderTreeSectionChildren } from "./composition-reconcile";
import {
  resolveSectionUnlockGate,
  sectionRejectsNestedInsert,
  unlockSectionBeforeInsert,
} from "./section-unlock-gate";

const SECTION_ID = "11111111-2222-4333-8444-555555555555";
const SECTION_NODE_ID = `legacy:body:0:${SECTION_ID}`;
const ADDED_BLOCK_ID = "added-by-the-operator";

const CURATED_PROPS = { headline: "Original headline", subheadline: "Original sub" };
const EDITED_PROPS = { headline: "Edited headline", subheadline: "Original sub" };

function curatedHeroTree(): BuilderNodeTree {
  return buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 0,
      sectionId: SECTION_ID,
      sectionTypeKey: "hero",
      name: "Hero",
      props: CURATED_PROPS,
    },
  ]);
}

const ADDED_BLOCK: BuilderNode = {
  id: ADDED_BLOCK_ID,
  kind: "paragraph",
  props: { text: "A block the operator added inside the section." },
};

function addBlockInside(tree: BuilderNodeTree): BuilderNodeTree {
  const result = insertBuilderNode({
    tree,
    node: ADDED_BLOCK,
    parentId: SECTION_NODE_ID,
  });
  assert.ok(result.ok, `insert failed: ${result.ok ? "" : result.message}`);
  return result.tree;
}

/** A curated field edit — the exact operation that used to eat the block. */
function editACuratedField(tree: BuilderNodeTree): BuilderNodeTree {
  return syncBuilderTreeSectionChildren(tree, {
    sectionId: SECTION_ID,
    sectionTypeKey: "hero",
    props: EDITED_PROPS,
  });
}

function containsAddedBlock(tree: BuilderNodeTree): boolean {
  const section = tree.find((node) => node.id === SECTION_NODE_ID);
  const children = section && "children" in section ? section.children ?? [] : [];
  return children.some((child) => child.id === ADDED_BLOCK_ID);
}

let workingTree: BuilderNodeTree = [];

/** The production wiring's commit body, minus the server round-trip. */
const ejectSection = async (sectionNodeId: string) => {
  workingTree = ejectSectionInTree(workingTree, sectionNodeId).tree;
  return { ok: true };
};

test("the trap is real: inserting into a LOCKED curated section loses the block", () => {
  const withBlock = addBlockInside(curatedHeroTree());
  assert.equal(containsAddedBlock(withBlock), true, "insert itself should land");

  // No unlock: the next curated field edit re-derives the section's children.
  assert.equal(
    containsAddedBlock(editACuratedField(withBlock)),
    false,
    "baseline: the unguarded insert path really does lose the block",
  );
});

test("unlock-before-insert: a block added inside a curated section SURVIVES a curated field edit", async () => {
  workingTree = curatedHeroTree();
  const section = workingTree.find((node) => node.id === SECTION_NODE_ID);
  assert.ok(section && section.kind === "section" && !section.props.ejected);

  const unlocked = await unlockSectionBeforeInsert({ node: section, ejectSection });
  assert.equal(unlocked.ok, true);

  workingTree = addBlockInside(workingTree);
  assert.equal(containsAddedBlock(workingTree), true);

  // The whole point of Trap 1.
  const afterEdit = editACuratedField(workingTree);
  assert.equal(
    containsAddedBlock(afterEdit),
    true,
    "the block the operator added must outlive every later curated field edit",
  );

  // ...and the curated content that was there before the unlock came with it,
  // rather than the section being emptied by the unlock.
  const afterSection = afterEdit.find((node) => node.id === SECTION_NODE_ID);
  const children =
    afterSection && "children" in afterSection ? afterSection.children ?? [] : [];
  assert.ok(children.length > 1, "the unlocked section kept its derived layers");
});

test("an already-unlocked section inserts straight through, with no second eject", async () => {
  workingTree = ejectSectionInTree(curatedHeroTree(), SECTION_NODE_ID).tree;
  const section = workingTree.find((node) => node.id === SECTION_NODE_ID);
  let ejectCalls = 0;
  const counting = async (id: string) => {
    ejectCalls += 1;
    return ejectSection(id);
  };
  assert.equal((await unlockSectionBeforeInsert({ node: section, ejectSection: counting })).ok, true);
  assert.equal(ejectCalls, 0);
});

test("a section type with no derivable layers refuses the insert instead of eating the block", async () => {
  const tree = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 0,
      sectionId: "99999999-2222-4333-8444-555555555555",
      sectionTypeKey: "anchor_nav",
      name: "Anchor nav",
      props: { links: [{ label: "One", href: "#one" }] },
    },
  ]);
  const section = tree[0];
  assert.equal(resolveSectionUnlockGate("anchor_nav"), "no-layers");
  assert.equal(sectionRejectsNestedInsert(section), true);

  const result = await unlockSectionBeforeInsert({ node: section, ejectSection });
  assert.equal(result.ok, false);
  assert.ok(result.error && result.error.length > 0, "the refusal explains itself");
});

test("insert gating: unlockable and composition-owned sections both accept blocks", () => {
  const hero = curatedHeroTree()[0];
  assert.equal(resolveSectionUnlockGate("hero"), "unlockable");
  assert.equal(sectionRejectsNestedInsert(hero), false);

  // blank_section is already freeform; syncBuilderTreeSectionChildren never
  // re-derives over it, so it must keep accepting inserts while "locked".
  const blank = buildLegacySectionBuilderTree([
    {
      slotKey: "body",
      sortOrder: 0,
      sectionId: "88888888-2222-4333-8444-555555555555",
      sectionTypeKey: "blank_section",
      name: "Blank",
      props: {},
    },
  ])[0];
  assert.equal(resolveSectionUnlockGate("blank_section"), "not-offered");
  assert.equal(sectionRejectsNestedInsert(blank), false);

  // The site shell renders via PublishedShell and must not be unlocked, so it
  // must not take nested blocks either.
  assert.equal(resolveSectionUnlockGate("site_header"), "not-offered");
});
