/**
 * section-eject-repair.test.ts
 *
 * The repair path for sections that were unlocked BEFORE the eject-time
 * baseline bake existed (the rivieramayawork hero: black left-aligned text on
 * white where a full-bleed centered serif banner used to be). Relock restored
 * the design by DELETING the operator's blocks; this path restores it while
 * keeping them, so the tests below are about the two things that could make it
 * worse than the degraded state it replaces: restyling the wrong element, and
 * overwriting something the operator set by hand.
 *
 * Lane: `test:builder-node-bindings` (globs `src/lib/site-admin/builder-node`).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  repairEjectedSectionInTree,
  resolveRepairRoleMatches,
} from "./section-eject-repair";
import { ejectSectionInTree } from "./section-eject";
import { resolveSectionEjectBaseline } from "./section-eject-baseline";
import type { BuilderNode, BuilderNodeStyle, BuilderNodeTree } from "./types";

const SECTION_ID = "sec-hero";

const HERO_PROPS = {
  headline: "Riviera Maya",
  subheadline: "Coastal production, end to end",
  primaryCta: { label: "Start a project", href: "/contact" },
  secondaryCta: { label: "See the work", href: "/work" },
};

const HERO_BASELINE = resolveSectionEjectBaseline("hero", HERO_PROPS);

/** What `deriveLegacySectionChildNodes` yields for the section above. */
function heroReferenceChildren(): BuilderNode[] {
  return [
    {
      id: `${SECTION_ID}:heading:headline`,
      kind: "heading",
      props: { text: HERO_PROPS.headline, level: 1 },
    },
    {
      id: `${SECTION_ID}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: HERO_PROPS.subheadline },
    },
    {
      id: `${SECTION_ID}:button:primaryCta`,
      kind: "button",
      props: { label: "Start a project", href: "/contact", tone: "primary" },
    },
    {
      id: `${SECTION_ID}:button:secondaryCta`,
      kind: "button",
      props: { label: "See the work", href: "/work", tone: "secondary" },
    },
  ] as BuilderNode[];
}

/** A section unlocked the OLD way: roleless children, no stamp, no styling. */
function historicallyEjectedTree(
  children: BuilderNode[] = heroReferenceChildren().map(
    (child, i) =>
      ({ ...child, id: `free-${i}`, props: { ...child.props } }) as BuilderNode,
  ),
): BuilderNodeTree {
  return [
    {
      id: SECTION_ID,
      kind: "section",
      props: { sectionTypeKey: "hero", sectionId: "s1", ejected: true },
      children,
    } as BuilderNode,
  ];
}

function sectionChildren(tree: BuilderNodeTree): BuilderNode[] {
  return (tree[0] as { children?: BuilderNode[] }).children ?? [];
}

function styleOf(node: BuilderNode): BuilderNodeStyle | undefined {
  return (node.props as { style?: BuilderNodeStyle }).style;
}

function repair(
  tree: BuilderNodeTree,
  reference: BuilderNode[] = heroReferenceChildren(),
) {
  return repairEjectedSectionInTree({
    tree,
    sectionNodeId: SECTION_ID,
    roleBaseline: HERO_BASELINE,
    referenceChildren: reference,
  });
}

// ── The headline case that started this ─────────────────────────────────────

test("an already-ejected section with unstyled children gains the curated baseline", () => {
  const result = repair(historicallyEjectedTree());
  assert.equal(result.outcome, "repaired");
  assert.deepEqual(result.unresolvedRoles, []);

  const [headline, subheadline, primary, secondary] = sectionChildren(
    result.tree,
  );
  // The exact regression: centered serif type instead of left-aligned default.
  assert.equal(styleOf(headline!)?.align, "center");
  assert.equal(styleOf(headline!)?.fontSize, HERO_BASELINE?.headline?.fontSize);
  assert.equal(
    styleOf(headline!)?.fontFamily,
    HERO_BASELINE?.headline?.fontFamily,
  );
  assert.equal(styleOf(subheadline!)?.align, "center");
  assert.equal(
    styleOf(primary!)?.backgroundColor,
    HERO_BASELINE?.primaryCta?.backgroundColor,
  );
  assert.equal(
    styleOf(secondary!)?.borderStyle,
    HERO_BASELINE?.secondaryCta?.borderStyle,
  );
  // Never delete or reorder.
  assert.equal(sectionChildren(result.tree).length, 4);
  assert.deepEqual(
    sectionChildren(result.tree).map((c) => c.id),
    ["free-0", "free-1", "free-2", "free-3"],
  );
});

test("an explicit child style still wins over the restored baseline", () => {
  const children = heroReferenceChildren().map(
    (child, i) =>
      ({ ...child, id: `free-${i}`, props: { ...child.props } }) as BuilderNode,
  );
  children[0] = {
    ...children[0]!,
    props: {
      ...children[0]!.props,
      style: { align: "left", textColor: "#ff0000" },
    },
  } as BuilderNode;

  const result = repair(historicallyEjectedTree(children));
  assert.equal(result.outcome, "repaired");
  const headline = sectionChildren(result.tree)[0]!;
  // The operator's two values survive verbatim...
  assert.equal(styleOf(headline)?.align, "left");
  assert.equal(styleOf(headline)?.textColor, "#ff0000");
  // ...and the curated values they never touched come back underneath.
  assert.equal(styleOf(headline)?.fontFamily, HERO_BASELINE?.headline?.fontFamily);
});

test("running the repair twice equals running it once", () => {
  const once = repair(historicallyEjectedTree());
  const twice = repair(once.tree);
  assert.equal(twice.outcome, "already-styled");
  assert.deepEqual(twice.repairedRoles, []);
  // No change at all: the tree comes back by identity, not as a fresh copy.
  assert.equal(twice.tree, once.tree);
  assert.deepEqual(
    sectionChildren(twice.tree).map(styleOf),
    sectionChildren(once.tree).map(styleOf),
  );
});

// ── Identity: refuse rather than approximate ────────────────────────────────

test("a child that cannot be confidently mapped is left alone", () => {
  // Two paragraphs where the curated section had one, and BOTH were rewritten
  // by the operator, so neither text nor kind forces an answer. The heading is
  // still unambiguous and is repaired; the paragraph role is refused.
  const children = [
    { id: "free-h", kind: "heading", props: { text: "Rewritten headline" } },
    { id: "free-p1", kind: "paragraph", props: { text: "One" } },
    { id: "free-p2", kind: "paragraph", props: { text: "Two" } },
  ] as BuilderNode[];

  const result = repair(historicallyEjectedTree(children));
  assert.equal(result.outcome, "repaired");
  assert.ok(result.unresolvedRoles.includes("subheadline"));
  assert.ok(result.repairedRoles.includes("headline"));
  const [, p1, p2] = sectionChildren(result.tree);
  assert.equal(styleOf(p1!), undefined, "ambiguous paragraph must be untouched");
  assert.equal(styleOf(p2!), undefined, "ambiguous paragraph must be untouched");
});

test("nothing mappable at all reports `unresolved` rather than a silent success", () => {
  const children = [
    { id: "free-a", kind: "image", props: { src: "/a.jpg" } },
    { id: "free-b", kind: "image", props: { src: "/b.jpg" } },
  ] as unknown as BuilderNode[];
  const tree = historicallyEjectedTree(children);
  const result = repair(tree);
  assert.equal(result.outcome, "unresolved");
  assert.equal(result.repairedRoles.length, 0);
  assert.equal(result.tree, tree, "an unresolved repair must not touch the tree");
  assert.equal(result.unresolvedRoles.length, 4);
});

test("unique text survives blocks being added around the curated children", () => {
  const base = heroReferenceChildren().map(
    (child, i) =>
      ({ ...child, id: `free-${i}`, props: { ...child.props } }) as BuilderNode,
  );
  const children = [
    { id: "own-divider", kind: "divider", props: {} } as unknown as BuilderNode,
    ...base,
    { id: "own-note", kind: "paragraph", props: { text: "My own note" } } as BuilderNode,
  ];
  const result = repair(historicallyEjectedTree(children));
  assert.equal(result.outcome, "repaired");
  assert.deepEqual(result.unresolvedRoles, []);
  assert.ok(result.matches.every((m) => m.via === "unique-text"));
  // The operator's own blocks are never styled.
  const byId = new Map(sectionChildren(result.tree).map((c) => [c.id, c]));
  assert.equal(styleOf(byId.get("own-note")!), undefined);
  assert.equal(styleOf(byId.get("own-divider")!), undefined);
});

// ── Coverage + provenance ──────────────────────────────────────────────────

test("a section type with no baseline is a clean no-op", () => {
  const result = repairEjectedSectionInTree({
    tree: historicallyEjectedTree(),
    sectionNodeId: SECTION_ID,
    roleBaseline: resolveSectionEjectBaseline("faq_accordion", {}),
    referenceChildren: heroReferenceChildren(),
  });
  assert.equal(result.outcome, "no-baseline");
  assert.equal(result.repairedRoles.length, 0);
  assert.equal(sectionChildren(result.tree).every((c) => !styleOf(c)), true);
});

test("a still-locked section is not repairable", () => {
  const tree = [
    {
      id: SECTION_ID,
      kind: "section",
      props: { sectionTypeKey: "hero", sectionId: "s1" },
      children: heroReferenceChildren(),
    } as BuilderNode,
  ];
  assert.equal(repair(tree).outcome, "not-unlocked");
  assert.equal(
    repairEjectedSectionInTree({
      tree,
      sectionNodeId: "nope",
      roleBaseline: HERO_BASELINE,
    }).outcome,
    "not-found",
  );
});

test("eject stamps the origin role, and repair then needs no inference at all", () => {
  const curated: BuilderNodeTree = [
    {
      id: SECTION_ID,
      kind: "section",
      props: { sectionTypeKey: "hero", sectionId: "s1" },
      children: heroReferenceChildren(),
    } as BuilderNode,
  ];
  const ejected = ejectSectionInTree(curated, SECTION_ID, {}, HERO_BASELINE).tree;
  const stamps = sectionChildren(ejected).map(
    (child) => (child as { originRole?: string }).originRole,
  );
  assert.deepEqual(stamps, [
    "headline",
    "subheadline",
    "primaryCta",
    "secondaryCta",
  ]);
  // Ids really are roleless — the stamp is the only surviving link.
  assert.ok(
    sectionChildren(ejected).every((c) => !c.id.includes(":heading:")),
    "ejected children must carry fresh roleless ids",
  );

  // Repair with NO reference list at all still resolves every role.
  const result = repairEjectedSectionInTree({
    tree: ejected,
    sectionNodeId: SECTION_ID,
    roleBaseline: HERO_BASELINE,
  });
  assert.equal(result.outcome, "already-styled", "eject already baked it in");
  assert.deepEqual(result.unresolvedRoles, []);
  assert.ok(result.matches.every((m) => m.via === "origin-role"));
});

test("in a stamped section an unstamped sibling is the operator's block, never inferred", () => {
  const stampedHeadline = {
    id: "free-h",
    kind: "heading",
    originRole: "headline",
    props: { text: "Riviera Maya", originRole: "headline" },
  } as unknown as BuilderNode;
  const ownParagraph = {
    id: "free-p",
    kind: "paragraph",
    props: { text: "Coastal production, end to end" },
  } as BuilderNode;
  const result = repair(
    historicallyEjectedTree([stampedHeadline, ownParagraph]),
  );
  assert.equal(result.outcome, "repaired");
  assert.deepEqual(
    result.matches.map((m) => m.role),
    ["headline"],
  );
  assert.equal(styleOf(sectionChildren(result.tree)[1]!), undefined);
  assert.ok(result.unresolvedRoles.includes("subheadline"));
});

test("resolveRepairRoleMatches never claims one child for two roles", () => {
  const children = heroReferenceChildren().map(
    (child, i) =>
      ({ ...child, id: `free-${i}`, props: { ...child.props } }) as BuilderNode,
  );
  const { matches } = resolveRepairRoleMatches(
    children,
    heroReferenceChildren(),
    ["headline", "subheadline", "primaryCta", "secondaryCta"],
  );
  const ids = matches.map((m) => m.childId);
  assert.equal(new Set(ids).size, ids.length);
});
