/**
 * shell-render-plan.test.ts — F3, the published shell's renderer decision.
 *
 * WHAT F3 WAS
 * -----------
 * `<PublishedShell>` rendered the tenant's header/footer by walking
 * `snapshot.slots` and, per slot, finding the ONE builder node whose address key
 * matched. A root-level node an operator added on the freeform shell surface —
 * an announcement bar above the header, a newsletter strip under the footer —
 * has no slot address, so it was found by nothing and dropped. It showed on the
 * edit canvas, survived publish (after #1166's F2 fix), and never appeared on
 * the live site.
 *
 * WHY THE TESTS LIVE HERE AND NOT ON THE COMPONENT
 * -----------------------------------------------
 * `PublishedShellHeader` is an async Server Component that awaits Supabase, the
 * request-scoped actor session, the media/collection loaders and the section
 * registry's React components. There is no lane in this repo that can render it
 * to HTML, so an "old markup vs new markup" string diff is not available. The
 * equivalence is therefore established one level up, where it is actually
 * decidable:
 *
 *   The legacy render path is NOT reimplemented. `renderPublishedShellSide`
 *   calls `resolveShellSidePlan`, and on `{ mode: "legacy_slot" }` it invokes
 *   the ORIGINAL, untouched `renderShellSlot` with the same slot object and the
 *   same tree. So proving "a slot-baked snapshot plans to `legacy_slot` with
 *   the slot the old code would have picked, and the tree it is handed is the
 *   same object reference" proves the rendered markup is identical — the same
 *   function is called with the same arguments.
 *
 * `EQUIVALENCE` below is that proof. The rest cover the new freeform branch and
 * the fallback ladder that keeps a partial freeform tree from silently deleting
 * a side of the live page.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLegacySectionBuilderTree } from "./snapshot-slot-bridge";
import {
  classifyShellTree,
  collectShellSideFreeformNodes,
  hydrateShellLandmarkSectionProps,
  prepareShellTree,
  resolveShellSidePlan,
  splitShellTree,
} from "./shell-render-plan";
import { resolveSnapshotBuilderTree } from "./snapshot-tree";
import type { BuilderNode, BuilderNodeTree } from "./types";

// Real UUIDs: the section-node props schema validates `sectionId` as a UUID, and
// a tree that fails validation is discarded wholesale by
// `resolveSnapshotBuilderTree` — see the FULL-read-pipeline test below.
const HEADER_SECTION_ID = "11111111-1111-4111-8111-111111111111";
const FOOTER_SECTION_ID = "22222222-2222-4222-8222-222222222222";

/**
 * Impronta's shape in production today, verified 2026-08-16: `cms_pages.blocks`
 * is EMPTY, so the published snapshot's `builderTree` is whatever
 * `buildLegacySectionBuilderTree(slots)` produced at publish time.
 */
const LEGACY_SLOTS = [
  {
    slotKey: "header",
    sortOrder: 0,
    sectionId: HEADER_SECTION_ID,
    sectionTypeKey: "site_header",
    schemaVersion: 1,
    name: "Header",
    props: { variant: "standard", brandDisplay: "logo" },
  },
  {
    slotKey: "footer",
    sortOrder: 0,
    sectionId: FOOTER_SECTION_ID,
    sectionTypeKey: "site_footer",
    schemaVersion: 1,
    name: "Footer",
    props: { copyright: "© Impronta" },
  },
];

const LEGACY_TREE = buildLegacySectionBuilderTree(LEGACY_SLOTS);

function landmark(
  slotKey: "header" | "footer",
  children: BuilderNode[] = [],
  overrides: Record<string, unknown> = {},
): BuilderNode {
  return {
    id: `shell-${slotKey}`,
    kind: "section",
    props: {
      sectionId: slotKey === "header" ? HEADER_SECTION_ID : FOOTER_SECTION_ID,
      sectionTypeKey: slotKey === "header" ? "site_header" : "site_footer",
      slotKey,
      sortOrder: 0,
      label: null,
      ...overrides,
    },
    children,
  } as BuilderNode;
}

/**
 * Operator-added root nodes are CONTAINERS, not bare text — `ROOT_ALLOWED_KINDS`
 * in `drop-policy.ts` gates both the editor's drop policy and
 * `validateBuilderNodeTree`, and a root kind outside that set fails validation,
 * which sends `resolveSnapshotBuilderTree` back to the legacy slot tree and
 * throws the whole freeform tree away. Fixtures use the shape that can actually
 * reach the renderer; `[F3] survives resolveSnapshotBuilderTree` proves it does.
 */
function rootContainer(id: string, text: string, layerLabel?: string): BuilderNode {
  return {
    id,
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "stretch",
      ...(layerLabel ? { layerLabel } : {}),
    },
    children: [{ id: `${id}:copy`, kind: "paragraph", props: { text } }],
  } as unknown as BuilderNode;
}

const ANNOUNCEMENT = rootContainer(
  "operator-announcement-bar",
  "Now booking Fall/Winter 2026",
);

const NEWSLETTER = rootContainer("operator-newsletter-strip", "Join the list");

// ─── EQUIVALENCE ────────────────────────────────────────────────────────────

test("[EQUIVALENCE] a legacy slot-baked snapshot still renders through the ORIGINAL slot path", () => {
  for (const side of ["header", "footer"] as const) {
    const prepared = prepareShellTree(LEGACY_TREE, LEGACY_SLOTS);

    // 1. The tree handed to the renderer is the SAME OBJECT. Nothing normalized,
    //    nothing hydrated, nothing re-keyed — so every index the renderer builds
    //    off it (`indexBuilderSectionNodeIds` / `...Nodes` / `...ChildNodeIds`)
    //    is bit-for-bit what it was before this change.
    assert.equal(
      prepared.tree,
      LEGACY_TREE,
      "the legacy tree must pass through untouched (same reference)",
    );
    assert.equal(prepared.authoring, "legacy_slots");

    const plan = resolveShellSidePlan({
      tree: prepared.tree,
      slots: LEGACY_SLOTS,
      side,
    });

    // 2. The plan routes to the untouched `renderShellSlot` call...
    assert.equal(
      plan.mode,
      "legacy_slot",
      `${side}: a slot-baked shell must NOT take the freeform path`,
    );

    // 3. ...with the exact slot object the pre-F3 code selected, which was
    //    literally `snapshot.slots.find((s) => s.slotKey === side)`.
    assert.equal(
      plan.mode === "legacy_slot" ? plan.slot : null,
      LEGACY_SLOTS.find((s) => s.slotKey === side),
      `${side}: the plan must carry the same slot the old finder picked`,
    );
  }
});

test("[EQUIVALENCE] an all-landmark freeform tree also stays on the legacy path", () => {
  // The freeform shell surface's own output, before any operator adds a root
  // node, is the two addressed landmarks and nothing else. Both renderers emit
  // identical markup for that shape, so the conservative branch is correct —
  // and it means merely OPENING the shell editor cannot change the live page.
  const tree = [landmark("header"), landmark("footer")];
  assert.equal(classifyShellTree(tree, LEGACY_SLOTS), "legacy_slots");
  assert.equal(
    resolveShellSidePlan({ tree, slots: LEGACY_SLOTS, side: "header" }).mode,
    "legacy_slot",
  );
});

test("[EQUIVALENCE] no shell tree at all keeps the legacy path", () => {
  assert.equal(classifyShellTree([], LEGACY_SLOTS), "legacy_slots");
  const plan = resolveShellSidePlan({ tree: [], slots: LEGACY_SLOTS, side: "footer" });
  assert.equal(plan.mode, "legacy_slot");
});

// ─── THE F3 FIX ─────────────────────────────────────────────────────────────

test("[F3] an operator's root-level node reaches the side it was authored on", () => {
  const tree: BuilderNodeTree = [
    ANNOUNCEMENT,
    landmark("header"),
    landmark("footer"),
    NEWSLETTER,
  ];
  assert.equal(classifyShellTree(tree, LEGACY_SLOTS), "freeform");

  const header = resolveShellSidePlan({ tree, slots: LEGACY_SLOTS, side: "header" });
  assert.equal(header.mode, "freeform");
  assert.deepEqual(
    header.mode === "freeform" ? header.nodes.map((n) => n.id) : [],
    ["operator-announcement-bar", "shell-header"],
    "the announcement bar authored above the header must render above the header",
  );

  const footer = resolveShellSidePlan({ tree, slots: LEGACY_SLOTS, side: "footer" });
  assert.equal(footer.mode, "freeform");
  assert.deepEqual(
    footer.mode === "freeform" ? footer.nodes.map((n) => n.id) : [],
    ["shell-footer", "operator-newsletter-strip"],
    "the newsletter strip authored below the footer must render below the footer",
  );
});

test("[F3] the pre-fix behavior is what this test would have caught", () => {
  // The pre-F3 renderer's entire node selection was "the section node whose
  // address key matches this slot". Spelled out here so the regression is
  // unambiguous: that rule returns ONLY the landmark, for both sides.
  const tree: BuilderNodeTree = [ANNOUNCEMENT, landmark("header")];
  const preFixHeaderNodes = tree.filter(
    (n) => n.kind === "section" && n.props.sectionId === HEADER_SECTION_ID,
  );
  assert.deepEqual(preFixHeaderNodes.map((n) => n.id), ["shell-header"]);

  const plan = resolveShellSidePlan({ tree, slots: LEGACY_SLOTS, side: "header" });
  assert.equal(plan.mode, "freeform");
  assert.ok(
    plan.mode === "freeform" &&
      plan.nodes.some((n) => n.id === "operator-announcement-bar"),
    "F3 regression: the operator's root-level node is being dropped again",
  );
});

test("[F3] the operator's roots survive the FULL read pipeline, not just the planner", () => {
  // The planner is downstream of `resolveSnapshotBuilderTree`, which VALIDATES
  // the persisted tree and — on any issue — silently substitutes the legacy
  // slot tree, throwing the operator's content away before the planner ever
  // sees it. So the fix is only real if a realistic freeform shell survives
  // that call. (It does not for a bare `paragraph` at root: `ROOT_ALLOWED_KINDS`
  // rejects it and the whole tree is discarded. This test is why the fixtures
  // above are containers.)
  const blocks = [ANNOUNCEMENT, landmark("header"), landmark("footer"), NEWSLETTER];
  const resolved = resolveSnapshotBuilderTree({
    slots: LEGACY_SLOTS,
    builderTree: blocks,
  });
  assert.equal(
    resolved.source,
    "snapshot_builder_tree",
    `the freeform tree failed validation and was replaced by the legacy slot tree: ${resolved.issues
      .map((i) => `${i.path}: ${i.message}`)
      .join("; ")}`,
  );
  const prepared = prepareShellTree(resolved.tree, LEGACY_SLOTS);
  assert.equal(prepared.authoring, "freeform");
  const header = resolveShellSidePlan({
    tree: prepared.tree,
    slots: LEGACY_SLOTS,
    side: "header",
  });
  assert.ok(
    header.mode === "freeform" &&
      header.nodes.some((n) => n.id === "operator-announcement-bar"),
  );
});

// ─── SPLIT SEMANTICS (the splitShell port) ──────────────────────────────────

test("[split] the footer landmark is the cut point", () => {
  const tree: BuilderNodeTree = [
    ANNOUNCEMENT,
    landmark("header"),
    landmark("footer"),
    NEWSLETTER,
  ];
  const { header, footer } = splitShellTree(tree);
  assert.deepEqual(header.map((n) => n.id), [
    "operator-announcement-bar",
    "shell-header",
  ]);
  assert.deepEqual(footer.map((n) => n.id), [
    "shell-footer",
    "operator-newsletter-strip",
  ]);
});

test("[split] with no footer landmark, a header landmark claims the whole tree", () => {
  // Deliberate divergence from the talent `splitShell` heuristic: "last root is
  // the footer" would teleport this node from just under the header to the
  // bottom of the page. The two halves mount in different page positions, so a
  // wrong guess is loud. No footer landmark ⇒ no footer half.
  const tree: BuilderNodeTree = [landmark("header"), ANNOUNCEMENT];
  const { header, footer } = splitShellTree(tree);
  assert.deepEqual(header.map((n) => n.id), ["shell-header", "operator-announcement-bar"]);
  assert.deepEqual(footer, []);
});

test("[split] a landmark-less tree falls back to the talent rule verbatim", () => {
  const a = rootContainer("a", "a");
  const b = rootContainer("b", "b");
  const c = rootContainer("c", "c");
  const { header, footer } = splitShellTree([a, b, c]);
  assert.deepEqual(header.map((n) => n.id), ["a", "b"]);
  assert.deepEqual(footer.map((n) => n.id), ["c"]);
  assert.deepEqual(splitShellTree([a]).footer, [], "a single root is all header");
  assert.deepEqual(splitShellTree([]).header, []);
});

test("[split] a `layerLabel` containing 'footer' still wins when no landmark does", () => {
  const footerish = rootContainer("footer-container", "© 2026", "Site Footer");
  const { header, footer } = splitShellTree([ANNOUNCEMENT, footerish]);
  assert.deepEqual(header.map((n) => n.id), ["operator-announcement-bar"]);
  assert.deepEqual(footer.map((n) => n.id), ["footer-container"]);
});

// ─── FALLBACK DISCIPLINE ────────────────────────────────────────────────────

test("[fallback] a freeform tree with nothing on a side falls back to that side's slot", () => {
  // Without this belt the live page would LOSE its footer: the legacy footer is
  // already suppressed by `shouldRenderSnapshotShell`, so a null here is a hole
  // in the page, not a graceful degrade.
  const tree: BuilderNodeTree = [ANNOUNCEMENT, landmark("header")];
  const plan = resolveShellSidePlan({ tree, slots: LEGACY_SLOTS, side: "footer" });
  assert.equal(plan.mode, "legacy_slot");
  assert.equal(
    plan.mode === "legacy_slot" ? plan.slot.sectionId : null,
    FOOTER_SECTION_ID,
  );
});

test("[fallback] no nodes and no slot on a side yields `none`, not a crash", () => {
  const headerOnlySlots = [LEGACY_SLOTS[0]];
  const tree: BuilderNodeTree = [ANNOUNCEMENT, landmark("header")];
  assert.equal(
    resolveShellSidePlan({ tree, slots: headerOnlySlots, side: "footer" }).mode,
    "none",
  );
});

// ─── LAZY sectionProps HYDRATION ────────────────────────────────────────────

test("[hydrate] an UN-ADDRESSED landmark gets its config from the slot of its side", () => {
  // The shape #1166 fixed at the source: a landmark minted without `sectionId`
  // matches no slot address. Before hydration it would render its bespoke
  // component with `{}` — a header with no variant, no brand display.
  const unaddressed = landmark("header", [], { sectionId: undefined });
  const [hydrated] = hydrateShellLandmarkSectionProps(
    [unaddressed],
    LEGACY_SLOTS,
  ) as [BuilderNode];
  assert.equal(hydrated.kind, "section");
  assert.deepEqual(
    hydrated.kind === "section" ? hydrated.props.sectionProps : null,
    { variant: "standard", brandDisplay: "logo" },
  );
});

test("[hydrate] an existing inline `sectionProps` is never overwritten", () => {
  const withInline = landmark("header", [], { sectionProps: { variant: "minimal" } });
  const out = hydrateShellLandmarkSectionProps([withInline], LEGACY_SLOTS);
  assert.equal(out[0], withInline, "must not touch a landmark that already has config");
});

test("[hydrate] the LEGACY tree is never rewritten", () => {
  // Hydration runs on READ only, and `prepareShellTree` skips it entirely for a
  // legacy tree. Asserted twice: the classifier gate, and the hydrator itself
  // being a no-op reference-wise once nothing is left to fill.
  assert.equal(prepareShellTree(LEGACY_TREE, LEGACY_SLOTS).tree, LEGACY_TREE);
  const once = hydrateShellLandmarkSectionProps(LEGACY_TREE, LEGACY_SLOTS);
  assert.equal(
    hydrateShellLandmarkSectionProps(once, LEGACY_SLOTS),
    once,
    "hydration must be idempotent",
  );
});

test("[hydrate] with no slots at all the tree is returned untouched", () => {
  const tree = [landmark("header", [], { sectionId: undefined })];
  assert.equal(hydrateShellLandmarkSectionProps(tree, []), tree);
});

// ─── DATA-SOURCE NODE COLLECTION ────────────────────────────────────────────

test("[data] a side's freeform node set is landmark children plus non-landmark roots", () => {
  const child = { id: "header-nav", kind: "paragraph", props: { text: "Nav" } } as BuilderNode;
  const nodes = [ANNOUNCEMENT, landmark("header", [child])];
  assert.deepEqual(
    collectShellSideFreeformNodes(nodes).map((n) => n.id),
    ["operator-announcement-bar", "header-nav"],
    "the landmark itself renders via its bespoke component, so it is excluded",
  );
});
