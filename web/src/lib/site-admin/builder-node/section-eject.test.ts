import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BuilderNode, BuilderNodeStyle, BuilderNodeTree } from "./types";
import {
  buildEjectRolePresentation,
  ejectSectionInTree,
  unejectSectionInTree,
  type EjectRolePresentation,
} from "./section-eject";
import { nodePresentationToBuilderStyle } from "./node-presentation-bridge";
import type { NodePresentation } from "../sections/shared/node-presentation";

function section(
  id: string,
  children: BuilderNode[],
  ejected?: boolean,
): BuilderNode {
  return {
    id,
    kind: "section",
    props: { sectionTypeKey: "editorial_split_hero", ...(ejected ? { ejected: true } : {}) },
    children,
  } as BuilderNode;
}
function heading(id: string, text: string): BuilderNode {
  return { id, kind: "heading", props: { text, level: 2 } } as BuilderNode;
}

function allIds(tree: BuilderNodeTree): string[] {
  const out: string[] = [];
  const visit = (n: BuilderNode) => {
    out.push(n.id);
    if ("children" in n && Array.isArray(n.children)) n.children.forEach(visit);
  };
  tree.forEach(visit);
  return out;
}

test("eject: flags the section + re-mints children with fresh ROLELESS ids", () => {
  const tree = [
    section("legacy:hero:0:abc", [
      heading("legacy:hero:0:abc:heading:headline", "Hi"),
      heading("legacy:hero:0:abc:heading:sub", "Sub"),
    ]),
  ];
  const { tree: next, ejected } = ejectSectionInTree(tree, "legacy:hero:0:abc");
  assert.equal(ejected, true);
  const sec = next[0] as BuilderNode & { props: { ejected?: boolean }; children: BuilderNode[] };
  assert.equal(sec.props.ejected, true);
  assert.equal(sec.children.length, 2);
  // The role-id children are gone; new ids are roleless (no `legacy:` / `:role`).
  for (const id of allIds([sec.children[0], sec.children[1]] as BuilderNodeTree)) {
    assert.ok(!id.startsWith("legacy:"), `child id ${id} must be roleless`);
  }
  // Content preserved.
  assert.equal((sec.children[0].props as { text: string }).text, "Hi");
});

test("eject: no-op on an already-ejected or unknown section", () => {
  const already = [section("s", [heading("h", "x")], true)];
  assert.equal(ejectSectionInTree(already, "s").ejected, false);
  assert.equal(ejectSectionInTree([section("s", [])], "missing").ejected, false);
});

test("uneject: clears the flag + empties children so hydration re-derives", () => {
  const tree = [section("s", [heading("h1", "a")], true)];
  const { tree: next, ejected } = unejectSectionInTree(tree, "s");
  assert.equal(ejected, true);
  const sec = next[0] as BuilderNode & { props: { ejected?: boolean }; children: BuilderNode[] };
  assert.equal(sec.props.ejected, undefined);
  assert.equal(sec.children.length, 0);
});

test("uneject: no-op on a non-ejected section", () => {
  assert.equal(unejectSectionInTree([section("s", [])], "s").ejected, false);
});

test("eject then uneject round-trips the flag", () => {
  const tree = [section("s", [heading("h", "x")])];
  const e = ejectSectionInTree(tree, "s");
  const u = unejectSectionInTree(e.tree, "s");
  const sec = u.tree[0] as BuilderNode & { props: { ejected?: boolean } };
  assert.equal(sec.props.ejected, undefined);
});

test("original tree is not mutated (pure)", () => {
  const tree = [section("s", [heading("h", "x")])];
  const before = allIds(tree);
  ejectSectionInTree(tree, "s");
  assert.deepEqual(allIds(tree), before);
  assert.equal((tree[0].props as { ejected?: boolean }).ejected, undefined);
});

import { reconcileBuilderTreeWithLegacySlots } from "./snapshot-tree";

// ── Additional edge-case tests ────────────────────────────────────────────────

function container(id: string, children: BuilderNode[] = [], extra: Record<string, unknown> = {}): BuilderNode {
  return { id, kind: "container", props: { layout: "stack", ...extra }, children } as BuilderNode;
}

test("eject: section with dataBinding prop — binding survives in ejected props", () => {
  const dataBinding = { sourceKey: "talent_profiles", mode: "bound" as const, maxItems: 6 };
  const tree = [
    {
      id: "data-sec",
      kind: "section",
      props: { sectionTypeKey: "roster_grid", dataBinding },
      children: [heading("kid", "List item")],
    },
  ] as BuilderNodeTree;
  const { tree: next, ejected } = ejectSectionInTree(tree, "data-sec");
  assert.equal(ejected, true);
  const sec = next[0] as BuilderNode & { props: { dataBinding?: typeof dataBinding; ejected?: boolean } };
  assert.equal(sec.props.ejected, true);
  // The dataBinding on the section MUST survive the eject (only ejected flag is added).
  assert.deepEqual(sec.props.dataBinding, dataBinding);
});

test("eject: child container with dataBinding — binding survives re-mint via cloneNodeWithFreshIds", () => {
  const childBinding = { sourceKey: "items", mode: "bound" as const };
  const tree = [
    section("sec-db", [
      container("bound-container", [], { dataBinding: childBinding }),
    ]),
  ];
  const { tree: next } = ejectSectionInTree(tree, "sec-db");
  const sec = next[0] as BuilderNode & { children: BuilderNode[] };
  const child = sec.children[0] as BuilderNode & { props: { dataBinding?: typeof childBinding } };
  // Child gets a fresh id (re-minted) but its dataBinding prop must be preserved.
  assert.notEqual(child.id, "bound-container", "child must be re-minted with a fresh id");
  assert.deepEqual(child.props.dataBinding, childBinding, "dataBinding must survive cloneNodeWithFreshIds");
});

test("eject: children already roleless (no legacy: prefix) — still re-minted with fresh ids", () => {
  const tree = [
    section("plain-sec", [
      heading("plain-h1", "No role prefix"),
      heading("plain-h2", "Also plain"),
    ]),
  ];
  const { tree: next } = ejectSectionInTree(tree, "plain-sec");
  const sec = next[0] as BuilderNode & { children: BuilderNode[] };
  assert.equal(sec.children.length, 2);
  // Even though ids have no legacy: prefix, they get fresh ids.
  assert.notEqual(sec.children[0].id, "plain-h1", "roleless children must be re-minted");
  assert.notEqual(sec.children[1].id, "plain-h2", "roleless children must be re-minted");
  // But their content is preserved.
  assert.equal((sec.children[0].props as { text: string }).text, "No role prefix");
  assert.equal((sec.children[1].props as { text: string }).text, "Also plain");
});

test("eject: section with accordion child — defaultOpenItemIds correctly remapped by cloneNodeWithFreshIds", () => {
  const acc = {
    id: "legacy:sec:0:acc",
    kind: "accordion",
    props: { defaultOpenItemIds: ["legacy:sec:0:acc:item:q1", "legacy:sec:0:acc:item:q3"] },
    children: [
      { id: "legacy:sec:0:acc:item:q1", kind: "accordion_item", props: { title: "Q1" }, children: [] },
      { id: "legacy:sec:0:acc:item:q2", kind: "accordion_item", props: { title: "Q2" }, children: [] },
      { id: "legacy:sec:0:acc:item:q3", kind: "accordion_item", props: { title: "Q3" }, children: [] },
    ],
  } as BuilderNode;
  const tree = [section("legacy:sec:0:faq", [acc])];
  const { tree: next } = ejectSectionInTree(tree, "legacy:sec:0:faq");
  const sec = next[0] as BuilderNode & { children: BuilderNode[] };
  const ejectedAcc = sec.children[0] as BuilderNode & {
    props: { defaultOpenItemIds: string[] };
    children: BuilderNode[];
  };
  const childIds = ejectedAcc.children.map((c) => c.id);
  // defaultOpenItemIds must reference fresh child ids, not the stale legacy ids.
  for (const openId of ejectedAcc.props.defaultOpenItemIds) {
    assert.ok(
      childIds.includes(openId),
      `defaultOpenItemIds entry "${openId}" must match an actual child id`,
    );
    assert.ok(
      !openId.startsWith("legacy:"),
      `remapped id "${openId}" must be roleless`,
    );
  }
});

test("uneject: non-existent section id returns ejected=false and tree unchanged", () => {
  const tree = [section("real-sec", [heading("h", "text")], true)];
  const { tree: next, ejected } = unejectSectionInTree(tree, "does-not-exist");
  assert.equal(ejected, false);
  // The real ejected section must remain untouched.
  assert.equal((next[0].props as { ejected?: boolean }).ejected, true);
  assert.deepEqual(allIds(next), allIds(tree));
});

test("uneject: multiple sections in tree — only the target is unejected", () => {
  const tree = [
    section("s1", [heading("h1", "A")], true),
    section("s2", [heading("h2", "B")], true),
  ];
  const { tree: next, ejected } = unejectSectionInTree(tree, "s1");
  assert.equal(ejected, true);
  assert.equal((next[0].props as { ejected?: boolean }).ejected, undefined, "s1 must be unejected");
  assert.equal((next[1].props as { ejected?: boolean }).ejected, true, "s2 must remain ejected");
});

test("reconcile preserves the ejected flag + children when rebuilding from slots", () => {
  // An ejected section in the tree; reconcile triggers because another slot is
  // missing from the tree. The ejected section must KEEP ejected + its children
  // (else it double-renders curated + freeform).
  const tree = [
    {
      id: "legacy:body:0:sec-1",
      kind: "section",
      props: { sectionId: "sec-1", sectionTypeKey: "hero", slotKey: "body", sortOrder: 0, ejected: true },
      children: [{ id: "free-h", kind: "heading", props: { text: "Ejected", level: 2 } }],
    },
  ] as BuilderNodeTree;
  const slots = [
    { slotKey: "body", sortOrder: 0, sectionId: "sec-1", sectionTypeKey: "hero", name: "Hero", props: { title: "T" } },
    { slotKey: "body", sortOrder: 1, sectionId: "sec-2", sectionTypeKey: "cta_banner", name: "CTA", props: { label: "Go" } },
  ];
  const next = reconcileBuilderTreeWithLegacySlots(tree, slots as never);
  const sec1 = next.find(
    (n) => n.kind === "section" && (n.props as { sectionId?: string }).sectionId === "sec-1",
  ) as BuilderNode & { props: { ejected?: boolean }; children?: BuilderNode[] };
  assert.equal(sec1.props.ejected, true, "ejected flag must survive reconcile");
  assert.equal(sec1.children?.[0]?.id, "free-h", "ejected children must survive reconcile");
});

test("BUG-1: reconcile never leaves a rebuilt section with undefined children", () => {
  // A section that was un-ejected to empty (children: []) and a sibling whose
  // slot derives nothing. After reconcile, EVERY section node must carry an
  // explicit children array — undefined makes downstream tree walks treat the
  // node as malformed and silently drop it from the snapshot.
  const tree = [
    {
      id: "legacy:body:0:sec-1",
      kind: "section",
      props: { sectionId: "sec-1", sectionTypeKey: "hero", slotKey: "body", sortOrder: 0 },
      children: [],
    },
  ] as BuilderNodeTree;
  const slots = [
    { slotKey: "body", sortOrder: 0, sectionId: "sec-1", sectionTypeKey: "hero", name: "Hero", props: {} },
    { slotKey: "body", sortOrder: 1, sectionId: "sec-2", sectionTypeKey: "cta_banner", name: "CTA", props: {} },
  ];
  const next = reconcileBuilderTreeWithLegacySlots(tree, slots as never);
  for (const node of next) {
    if (node.kind !== "section") continue;
    assert.ok(
      Array.isArray((node as BuilderNode & { children?: unknown }).children),
      `section ${node.id} must have an array children, got ${typeof (node as { children?: unknown }).children}`,
    );
  }
});

// ── W4-T3: lossless eject — per-role nodePresentation preserved on the child ──
// Today eject silently drops every per-role align/size/font/color tuning (the
// derived children carry NO style; the curated Component applies nodePresentation
// at render). With the role→presentation map handed in, eject translates each
// role's nodePresentation onto the child's BuilderNodeStyle via the W4-T1 bridge.

function roleChild(
  sectionId: string,
  suffix: string,
  kind: BuilderNode["kind"],
  props: Record<string, unknown>,
): BuilderNode {
  return { id: `${sectionId}${suffix}`, kind, props } as BuilderNode;
}

function ejectedChildren(result: { tree: BuilderNodeTree }): BuilderNode[] {
  const sec = result.tree[0] as BuilderNode & { children: BuilderNode[] };
  return sec.children;
}

function styleOf(node: BuilderNode): BuilderNodeStyle {
  return (node.props as { style?: BuilderNodeStyle }).style ?? {};
}

const HEADLINE_NP: NodePresentation = {
  align: "left",
  maxWidthPx: 740,
  marginTopPx: 14,
  marginBottomPx: 18,
  size: "xl",
  tone: "strong",
  fontFamily: "Playfair Display",
  fontSizePx: 48,
  textColor: "#1a1a1a",
};
const COPY_NP: NodePresentation = {
  align: "left",
  maxWidthPx: 520,
  tone: "muted",
  lineHeightPct: 150,
};

test("eject(parity): translates each role's nodePresentation onto the ejected child's style", () => {
  const sectionId = "legacy:body:0:hero";
  const tree: BuilderNodeTree = [
    section(sectionId, [
      roleChild(sectionId, ":heading:headline", "heading", { text: "Hi", level: 2 }),
      roleChild(sectionId, ":paragraph:copy", "paragraph", { text: "Sub" }),
    ]),
  ];
  const rolePresentation: EjectRolePresentation = {
    headline: HEADLINE_NP,
    copy: COPY_NP,
  };
  const result = ejectSectionInTree(tree, sectionId, rolePresentation);
  assert.equal(result.ejected, true);
  const [head, copy] = ejectedChildren(result);

  // The headline child must now carry the bridged BuilderNodeStyle equivalents.
  const headStyle = styleOf(head);
  const expectedHead = nodePresentationToBuilderStyle(HEADLINE_NP);
  for (const [k, v] of Object.entries(expectedHead)) {
    assert.deepEqual(
      (headStyle as Record<string, unknown>)[k],
      v,
      `headline style.${k} must equal the bridged nodePresentation value`,
    );
  }
  // Spot-check the headline values directly (px-int → CSS-string).
  assert.equal(headStyle.align, "left");
  assert.equal(headStyle.maxWidthFree, "740px");
  assert.equal(headStyle.marginTopFree, "14px");
  assert.equal(headStyle.fontFamily, "Playfair Display");
  assert.equal(headStyle.fontSize, "48px");
  assert.equal(headStyle.textColor, "#1a1a1a");

  // The copy child carries its own role's presentation (lineHeightPct → ratio).
  const copyStyle = styleOf(copy);
  assert.equal(copyStyle.maxWidthFree, "520px");
  assert.equal(copyStyle.tone, "muted");
  assert.equal(copyStyle.lineHeight, "1.5");
});

test("eject(parity): the ejected child renders the SAME key CSS the curated role showed", async () => {
  // Visual parity, end-to-end: render the ejected freeform child through the
  // REAL renderBuilderNodes and assert it emits the same load-bearing CSS the
  // curated nodePresentation would have produced (max-width/align/font-size).
  const { renderBuilderNodes } = await import("./render");
  const { renderToStaticMarkup } = await import("react-dom/server");

  const sectionId = "legacy:body:0:hero";
  const tree: BuilderNodeTree = [
    section(sectionId, [
      roleChild(sectionId, ":heading:headline", "heading", { text: "Hi", level: 2 }),
    ]),
  ];
  const result = ejectSectionInTree(tree, sectionId, { headline: HEADLINE_NP });
  const [head] = ejectedChildren(result);

  const html = renderToStaticMarkup(
    renderBuilderNodes([head], { mode: "freeform" }) as Parameters<
      typeof renderToStaticMarkup
    >[0],
  );
  // These are the exact CSS values the curated headline role displayed pre-eject.
  assert.match(html, /text-align:left/);
  assert.match(html, /max-width:740px/);
  assert.match(html, /font-size:48px/);
  assert.match(html, /font-family:Playfair Display/);
  assert.match(html, /color:#1a1a1a/);
});

test("eject(parity): a child's explicit style wins over the curated nodePresentation default", () => {
  const sectionId = "legacy:body:0:hero";
  // The headline child ALREADY has an explicit freeform maxWidthFree — it must
  // not be clobbered by the curated nodePresentation's maxWidthPx.
  const tree: BuilderNodeTree = [
    section(sectionId, [
      roleChild(sectionId, ":heading:headline", "heading", {
        text: "Hi",
        level: 2,
        style: { maxWidthFree: "900px" } as BuilderNodeStyle,
      }),
    ]),
  ];
  const result = ejectSectionInTree(tree, sectionId, { headline: HEADLINE_NP });
  const [head] = ejectedChildren(result);
  const headStyle = styleOf(head);
  assert.equal(headStyle.maxWidthFree, "900px", "explicit child style wins");
  // But un-conflicting curated values still merge in.
  assert.equal(headStyle.fontSize, "48px", "non-conflicting curated value merges");
  assert.equal(headStyle.align, "left");
});

test("eject(parity): per-breakpoint nodePresentation carries onto style.responsive", () => {
  const sectionId = "legacy:body:0:hero";
  const np: NodePresentation = {
    maxWidthPx: 740,
    breakpoints: {
      mobile: { maxWidthPx: 320, align: "center" },
    },
  };
  const tree: BuilderNodeTree = [
    section(sectionId, [
      roleChild(sectionId, ":heading:headline", "heading", { text: "Hi", level: 2 }),
    ]),
  ];
  const result = ejectSectionInTree(tree, sectionId, { headline: np });
  const headStyle = styleOf(ejectedChildren(result)[0]);
  assert.equal(headStyle.maxWidthFree, "740px");
  assert.equal(headStyle.responsive?.mobile?.maxWidthFree, "320px");
  assert.equal(headStyle.responsive?.mobile?.align, "center");
});

test("eject(back-compat): omitting rolePresentation reproduces the old lossy behaviour", () => {
  const sectionId = "legacy:body:0:hero";
  const tree: BuilderNodeTree = [
    section(sectionId, [
      roleChild(sectionId, ":heading:headline", "heading", { text: "Hi", level: 2 }),
    ]),
  ];
  // 2-arg call (the existing edit-context caller) — children get re-minted with
  // fresh ids and NO injected style.
  const result = ejectSectionInTree(tree, sectionId);
  const head = ejectedChildren(result)[0];
  assert.equal((head.props as { style?: unknown }).style, undefined, "no style injected");
  assert.ok(!head.id.startsWith("legacy:"), "still re-minted roleless");
  assert.equal((head.props as { text: string }).text, "Hi", "content preserved");
});

test("eject(parity): a roleless child (no role suffix) is untouched even with a map", () => {
  const sectionId = "plain-sec";
  const tree: BuilderNodeTree = [
    section(sectionId, [roleChild(sectionId, "-plain", "heading", { text: "Plain", level: 2 })]),
  ];
  const result = ejectSectionInTree(tree, sectionId, { headline: HEADLINE_NP });
  const head = ejectedChildren(result)[0];
  // No role resolved from the id → no style injected.
  assert.equal((head.props as { style?: unknown }).style, undefined);
});

test("buildEjectRolePresentation: maps child ids + curated config to a role→presentation map", () => {
  const sectionId = "legacy:body:0:hero";
  const childIds = [
    `${sectionId}:heading:headline`,
    `${sectionId}:paragraph:copy`,
    `${sectionId}:image:hero`, // no role suffix → ignored
  ];
  const config = {
    headline: HEADLINE_NP,
    copy: COPY_NP,
    subheadline: undefined, // not present among children → dropped
  };
  const map = buildEjectRolePresentation(childIds, config);
  assert.deepEqual(map.headline, HEADLINE_NP);
  assert.deepEqual(map.copy, COPY_NP);
  assert.equal(map.subheadline, undefined);
});

test("buildEjectRolePresentation: null config → empty map", () => {
  assert.deepEqual(buildEjectRolePresentation(["legacy:x:heading:headline"], null), {});
});

// ── Production wiring — edit-context.tsx `ejectSection` (W4-T3 wiring) ────────
// The lossless util above was unreachable in production: `ejectSection` in
// edit-context.tsx called the bare 2-arg `ejectSectionInTree(tree, sectionNodeId)`,
// so every eject silently dropped per-role Design-panel overrides (type size,
// color, alignment, spacing, incl. tablet/mobile). Fixed by resolving the
// section's saved `nodePresentation` (via `loadSectionForEditAction`) and its
// current child ids, building the role map with `buildEjectRolePresentation`,
// and passing it as `ejectSectionInTree`'s 3rd arg. `edit-context.tsx` is a
// "use client" React context and can't be imported/rendered from a `node:test`
// file without a DOM, so — mirroring the harness convention used elsewhere in
// this directory (see `undo-coalesced-persist.test.ts`) — this pins the fix two
// ways: (1) a functional test that reproduces the exact composition
// `ejectSection` now performs against a production-shaped section (saved
// `nodePresentation` + `sectionId`, legacy role-suffixed child ids, a
// responsive/mobile override), and (2) a static assertion that the source
// actually wires the 3-arg call so a future edit can't quietly regress to the
// 2-arg lossy path.

test("eject(production wiring): resolving a saved section's nodePresentation + child ids reproduces a lossless eject", () => {
  // Mirrors what `loadSectionForEditAction(sectionId)` returns: the curated
  // section's SAVED props, including `nodePresentation` keyed by role — this
  // does NOT live on the tree node, only on the section's server-side props.
  const savedSectionProps = {
    sectionTypeKey: "cta_banner",
    nodePresentation: {
      headline: {
        align: "center" as const,
        fontSizePx: 40,
        textColor: "#222222",
        breakpoints: {
          mobile: { align: "left" as const, fontSizePx: 24 },
        },
      },
    },
  };
  const sectionId = "legacy:body:0:cta";
  const tree: BuilderNodeTree = [
    {
      id: sectionId,
      kind: "section",
      props: { sectionId: "sec-cta-1", sectionTypeKey: "cta_banner" },
      children: [
        roleChild(sectionId, ":heading:headline", "heading", {
          text: "Book now",
          level: 2,
        }),
      ],
    } as BuilderNode,
  ];

  // The exact composition `ejectSection` performs: child ids from the CURRENT
  // tree node + the saved section's nodePresentation → the role map → the
  // 3-arg eject call.
  const sectionNode = tree[0] as BuilderNode & { children: BuilderNode[] };
  const childIds = sectionNode.children.map((c) => c.id);
  const rolePresentation = buildEjectRolePresentation(
    childIds,
    savedSectionProps.nodePresentation,
  );
  const result = ejectSectionInTree(tree, sectionId, rolePresentation);

  assert.equal(result.ejected, true);
  const [head] = ejectedChildren(result);
  const headStyle = styleOf(head);
  assert.equal(headStyle.align, "center", "desktop style carried onto the ejected child");
  assert.equal(headStyle.fontSize, "40px");
  assert.equal(headStyle.textColor, "#222222");
  assert.equal(
    headStyle.responsive?.mobile?.align,
    "left",
    "mobile override carried onto style.responsive.mobile",
  );
  assert.equal(headStyle.responsive?.mobile?.fontSize, "24px");
});

test("eject(production wiring, static): the production eject path is the 4-arg lossless call", () => {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const chromeDir = join(thisDir, "..", "..", "..", "components", "edit-chrome");
  // edit-context delegates the three section-lock doors to one hook…
  const editContext = readFileSync(join(chromeDir, "edit-context.tsx"), "utf8");
  assert.match(
    editContext,
    /useSectionLockActions\(/,
    "edit-context.tsx must delegate ejectSection to useSectionLockActions (use-section-lock-actions.ts)",
  );
  assert.match(
    editContext,
    /ejectSection,\s*unejectSection,\s*repairSectionStyling/,
    "all three doors must come off that hook and reach the context value",
  );
  // …and that hook is what calls the eject-lossless runners. Following the hop
  // rather than dropping it: the chain edit-context -> hook -> runner -> 4-arg
  // transform must stay provable, or a dead control can hide in the seam.
  const lockActions = readFileSync(
    join(chromeDir, "use-section-lock-actions.ts"),
    "utf8",
  );
  assert.match(
    lockActions,
    /runEjectSection\(/,
    "useSectionLockActions must delegate to runEjectSection (eject-lossless.ts)",
  );
  assert.match(
    lockActions,
    /runRepairSectionStyling\(/,
    "useSectionLockActions must delegate the RETROACTIVE repair to runRepairSectionStyling",
  );
  // …which resolves saved styling + the curated CSS baseline and commits the
  // 4-arg lossless transform (rolePresentation AND roleBaseline).
  const losslessRunner = readFileSync(join(chromeDir, "eject-lossless.ts"), "utf8");
  assert.match(
    losslessRunner,
    /ejectSectionInTree\(\s*current,\s*sectionNodeId,\s*rolePresentation,\s*roleBaseline,?\s*\)/,
    "runEjectSection must call the 4-arg (lossless + baseline) ejectSectionInTree, not a lossy form",
  );
  assert.match(
    losslessRunner,
    /resolveSectionEjectBaseline\(/,
    "the lossless runner must resolve the curated CSS baseline (section-eject-baseline.ts)",
  );
  assert.match(
    losslessRunner,
    /await loadSectionForEditAction\(sectionId\)/,
    "the lossless runner must resolve the section's saved nodePresentation via loadSectionForEditAction",
  );
  // The last seam: the chip is rendered by selection-layer, and its restore
  // action must carry a LIVE run. A control wired to nothing renders exactly
  // like a working one.
  const selectionLayer = readFileSync(
    join(chromeDir, "selection-layer.tsx"),
    "utf8",
  );
  assert.match(
    selectionLayer,
    /restoreStyling=\{/,
    "the section chip must be handed a restoreStyling target",
  );
  assert.match(
    selectionLayer,
    /run: \(\) => repairSectionStyling\(/,
    "the restore target's run must call the context action, not a stub",
  );
});
