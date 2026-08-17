/**
 * canvas-hover-attribution.test.ts
 *
 * Regression lock for the "grab handle blinks on/off while you hover it" bug
 * (owner report 2026-08-16). The mechanism, reproduced structurally below:
 * the drag grip is painted in the selection layer's `[data-edit-overlay]` root
 * rather than inside the block it drags, so ancestry-only hover resolution
 * reported the pointer as OFF the canvas the moment it reached the grip. The
 * grip renders only while its block is hovered, so it unmounted, which put the
 * pointer back on the block, which remounted the grip: an oscillation at
 * pointer-event rate.
 *
 * The assertion that matters is the first one: hovering the grip must resolve
 * to the SAME node id as hovering the block. That is what makes the mount
 * condition stable, and it is a stronger claim than "it stopped blinking" —
 * a hover latch would also stop the blink while still reporting the wrong id.
 *
 * NEGATIVE-TEST PROTOCOL (run by hand when this file was authored): deleting
 * the attribution branch from `resolveHoveredBuilderNodeId` — i.e. restoring
 * the chrome bail as the first check — fails "an affordance resolves to the
 * node it declares" and "hovering the grip does not change the hovered node",
 * and the simulated oscillation test reports an alternating id sequence.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/canvas-hover-attribution.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";

import {
  HOVER_GAP_ATTR,
  HOVER_NODE_ATTR,
  hoverAttributionProps,
  hoverGapAttributionProps,
  isHoverAffordanceForNode,
  pageGapKey,
  resolveHoverAttribution,
  resolveHoveredBuilderNodeId,
  resolveHoveredGapKey,
} from "./canvas-hover-attribution";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.HTMLElement = dom.window.HTMLElement;

const doc = dom.window.document;

/**
 * The real shape: a band container holding a heading, plus a SIBLING overlay
 * root (the selection layer) that paints the grip over the heading's corner.
 */
function buildCanvas(): {
  heading: HTMLElement;
  band: HTMLElement;
  grip: HTMLElement;
  overlay: HTMLElement;
} {
  doc.body.innerHTML = "";
  const band = doc.createElement("div");
  band.setAttribute("data-builder-node-id", "builder-container-e2e-baseline-band");
  const heading = doc.createElement("h2");
  heading.setAttribute("data-builder-node-id", "builder-heading-e2e-baseline-heading");
  heading.textContent = "A photograph should read at a glance";
  band.appendChild(heading);
  doc.body.appendChild(band);

  // The selection layer: a fixed overlay root OUTSIDE the canvas subtree.
  const overlay = doc.createElement("div");
  overlay.setAttribute("data-edit-overlay", "");
  const grip = doc.createElement("button");
  grip.setAttribute("data-builder-node-hover-grip", "");
  grip.setAttribute("data-builder-node-id", "builder-heading-e2e-baseline-heading");
  overlay.appendChild(grip);
  doc.body.appendChild(overlay);

  return { heading, band, grip, overlay };
}

test("a canvas element still resolves by DOM ancestry", () => {
  const { heading } = buildCanvas();
  assert.equal(
    resolveHoveredBuilderNodeId(heading),
    "builder-heading-e2e-baseline-heading",
  );
  // Innermost wins, exactly as `closest` always did.
  const text = heading.firstChild;
  assert.equal(
    resolveHoveredBuilderNodeId(text),
    "builder-heading-e2e-baseline-heading",
  );
});

test("editor chrome without a declaration is still not a canvas hover", () => {
  buildCanvas();
  const rail = doc.createElement("div");
  rail.setAttribute("data-edit-drawer", "");
  const row = doc.createElement("div");
  // A layers-rail row carries data-builder-node-id too; it must NOT read as a
  // canvas hover through this resolver.
  row.setAttribute("data-builder-node-id", "builder-heading-e2e-baseline-heading");
  rail.appendChild(row);
  doc.body.appendChild(rail);
  assert.equal(resolveHoveredBuilderNodeId(row), null);
});

test("an overlay affordance resolves to the node it declares", () => {
  const { grip } = buildCanvas();
  // Before the fix this returned null: the grip's [data-edit-overlay] ancestor
  // won over its own identity.
  grip.setAttribute(HOVER_NODE_ATTR, "builder-heading-e2e-baseline-heading");
  assert.equal(
    resolveHoveredBuilderNodeId(grip),
    "builder-heading-e2e-baseline-heading",
  );
  // A child of the affordance (the ⠿ svg the pointer actually lands on).
  const svg = doc.createElement("span");
  grip.appendChild(svg);
  assert.equal(
    resolveHoveredBuilderNodeId(svg),
    "builder-heading-e2e-baseline-heading",
  );
});

test("hovering the grip does not change which node is hovered", () => {
  const { heading, grip } = buildCanvas();
  grip.setAttribute(HOVER_NODE_ATTR, "builder-heading-e2e-baseline-heading");
  assert.equal(
    resolveHoveredBuilderNodeId(grip),
    resolveHoveredBuilderNodeId(heading),
  );
});

test("the grip never mis-attributes to the parent container", () => {
  const { grip, band } = buildCanvas();
  grip.setAttribute(HOVER_NODE_ATTR, "builder-heading-e2e-baseline-heading");
  assert.notEqual(
    resolveHoveredBuilderNodeId(grip),
    band.getAttribute("data-builder-node-id"),
  );
});

test("the mount condition no longer oscillates", () => {
  // Simulates the loop itself: the grip renders only while its node is
  // hovered, and the pointer sits on the grip whenever it exists. Ten ticks
  // must report one stable id, never an alternating sequence.
  const { heading, grip } = buildCanvas();
  grip.setAttribute(HOVER_NODE_ATTR, "builder-heading-e2e-baseline-heading");
  let hovered: string | null = null;
  const seen: Array<string | null> = [];
  for (let i = 0; i < 10; i += 1) {
    const gripMounted = hovered === "builder-heading-e2e-baseline-heading";
    hovered = resolveHoveredBuilderNodeId(gripMounted ? grip : heading);
    seen.push(hovered);
  }
  assert.deepEqual(
    new Set(seen),
    new Set(["builder-heading-e2e-baseline-heading"]),
    `hovered node oscillated: ${JSON.stringify(seen)}`,
  );
});

test("an empty declaration means 'belongs to no block'", () => {
  const { grip } = buildCanvas();
  grip.setAttribute(HOVER_NODE_ATTR, "");
  assert.deepEqual(resolveHoverAttribution(grip), {
    attributed: true,
    nodeId: null,
  });
  assert.equal(resolveHoveredBuilderNodeId(grip), null);
});

test("hoverAttributionProps only declares a real id", () => {
  assert.deepEqual(hoverAttributionProps("node-a"), {
    [HOVER_NODE_ATTR]: "node-a",
  });
  assert.deepEqual(hoverAttributionProps(null), {});
  assert.deepEqual(hoverAttributionProps(undefined), {});
  assert.deepEqual(hoverAttributionProps(""), {});
});

test("isHoverAffordanceForNode answers per node", () => {
  const { grip, heading } = buildCanvas();
  grip.setAttribute(HOVER_NODE_ATTR, "builder-heading-e2e-baseline-heading");
  assert.equal(
    isHoverAffordanceForNode(grip, "builder-heading-e2e-baseline-heading"),
    true,
  );
  assert.equal(isHoverAffordanceForNode(grip, "some-other-node"), false);
  // A plain canvas element is not an affordance for anything.
  assert.equal(
    isHoverAffordanceForNode(heading, "builder-heading-e2e-baseline-heading"),
    false,
  );
  assert.equal(isHoverAffordanceForNode(null, "node-a"), false);
});

/* ────────────────────────────────────────────────────────────────────────────
 * SEAM-SCOPED ATTRIBUTION — the "+ Add block" line between two root blocks.
 *
 * Owner report, 2026-08-16: the control "sits on the border line and do same
 * issue when hover it". Same class as the grip, different state: the pill is
 * painted in the same `[data-edit-overlay]` root, and the component's own
 * mousemove handler cleared the hovered gap whenever `elementFromPoint` landed
 * inside that root. Reaching for the pill therefore unmounted it, the pointer
 * fell back onto the block below, the seam matched again, the pill remounted.
 *
 * A seam belongs to NO block, so the honest declaration is the pair
 * `hoverGapAttributionProps` emits: the seam key (keeps the pill mounted) plus
 * the empty node declaration (keeps canvas node hover reporting null on
 * purpose). Declaring a neighbouring block as the owner would stop the blink by
 * lying to the layers rail, which is the trade this module exists to refuse.
 *
 * NEGATIVE-TEST PROTOCOL: dropping the seam key from the indicator (or the
 * `resolveHoveredGapKey` branch from the handler) fails "the pill's mount
 * condition no longer oscillates" with an alternating sequence.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Two root blocks with the seam affordance painted over their boundary. */
function buildSeam(): {
  blockAbove: HTMLElement;
  indicator: HTMLElement;
  pill: HTMLElement;
} {
  doc.body.innerHTML = "";
  const blockAbove = doc.createElement("section");
  blockAbove.setAttribute("data-cms-block", "");
  blockAbove.setAttribute("data-block-index", "0");
  blockAbove.setAttribute(
    "data-builder-node-id",
    "builder-container-e2e-baseline-band",
  );
  doc.body.appendChild(blockAbove);

  const overlay = doc.createElement("div");
  overlay.setAttribute("data-edit-overlay", "");
  const indicator = doc.createElement("div");
  indicator.setAttribute("data-canvas-between-blocks-indicator", "");
  for (const [attr, value] of Object.entries(
    hoverGapAttributionProps(pageGapKey(1)),
  )) {
    indicator.setAttribute(attr, value);
  }
  const pill = doc.createElement("button");
  pill.setAttribute("aria-label", "Add block here");
  pill.setAttribute("data-canvas-between-blocks-trigger", "");
  indicator.appendChild(pill);
  overlay.appendChild(indicator);
  doc.body.appendChild(overlay);

  return { blockAbove, indicator, pill };
}

/** The component's handleMove, in the order the real one runs its checks. */
function stepSeamHover(hit: Element, hoveredGap: string | null): string | null {
  if (resolveHoveredGapKey(hit) !== null) return hoveredGap; // our own chrome
  if (hit.closest("[data-edit-overlay]")) return null; // any other chrome
  return "root:1"; // the pointer is parked in the seam band
}

test("hoverGapAttributionProps declares the seam AND 'no block'", () => {
  assert.deepEqual(hoverGapAttributionProps(pageGapKey(2)), {
    [HOVER_GAP_ATTR]: "root:2",
    [HOVER_NODE_ATTR]: "",
  });
  assert.deepEqual(hoverGapAttributionProps(null), {});
  assert.deepEqual(hoverGapAttributionProps(undefined), {});
  assert.deepEqual(hoverGapAttributionProps(""), {});
});

test("the seam affordance resolves to its seam, from any descendant", () => {
  const { indicator, pill } = buildSeam();
  assert.equal(resolveHoveredGapKey(indicator), "root:1");
  // The pointer actually lands on the pill, or on the + svg inside it.
  assert.equal(resolveHoveredGapKey(pill), "root:1");
  const svg = doc.createElement("span");
  pill.appendChild(svg);
  assert.equal(resolveHoveredGapKey(svg), "root:1");
});

test("canvas elements and other overlay chrome declare no seam", () => {
  const { blockAbove } = buildSeam();
  assert.equal(resolveHoveredGapKey(blockAbove), null);
  assert.equal(resolveHoveredGapKey(null), null);
  const grip = doc.createElement("button");
  grip.setAttribute(HOVER_NODE_ATTR, "builder-container-e2e-baseline-band");
  doc.body.appendChild(grip);
  assert.equal(resolveHoveredGapKey(grip), null);
});

test("hovering the seam pill reports NO block, not a neighbouring one", () => {
  // The semantic half of the fix. The pointer is in the gap between blocks, so
  // "nothing is hovered" is the truthful answer; stopping the blink by naming
  // the block above would light the wrong row in the layers rail.
  const { pill, blockAbove } = buildSeam();
  assert.equal(resolveHoveredBuilderNodeId(pill), null);
  assert.deepEqual(resolveHoverAttribution(pill), {
    attributed: true,
    nodeId: null,
  });
  assert.notEqual(
    resolveHoveredBuilderNodeId(pill),
    blockAbove.getAttribute("data-builder-node-id"),
  );
});

test("the pill's mount condition no longer oscillates", () => {
  // Replays the handler: the pill mounts only while a gap is hovered, and the
  // pointer parked on the seam hits the pill whenever it exists. Ten ticks must
  // report one stable seam.
  const { blockAbove, pill } = buildSeam();
  let hoveredGap: string | null = null;
  const seen: Array<string | null> = [];
  for (let i = 0; i < 10; i += 1) {
    hoveredGap = stepSeamHover(hoveredGap === null ? blockAbove : pill, hoveredGap);
    seen.push(hoveredGap);
  }
  assert.deepEqual(
    new Set(seen),
    new Set(["root:1"]),
    `hovered gap oscillated: ${JSON.stringify(seen)}`,
  );
});

test("without the declaration the same loop DOES oscillate", () => {
  // The pre-fix control, kept so this file fails loudly if the seam key is ever
  // dropped and the test above starts passing for the wrong reason.
  const { blockAbove, pill, indicator } = buildSeam();
  indicator.removeAttribute(HOVER_GAP_ATTR);
  let hoveredGap: string | null = null;
  const seen: Array<string | null> = [];
  for (let i = 0; i < 10; i += 1) {
    hoveredGap = stepSeamHover(hoveredGap === null ? blockAbove : pill, hoveredGap);
    seen.push(hoveredGap);
  }
  assert.equal(
    new Set(seen).size,
    2,
    `expected the historical blink: ${JSON.stringify(seen)}`,
  );
});

test("pageGapKey names the root insert index", () => {
  assert.equal(pageGapKey(0), "root:0");
  assert.equal(pageGapKey(3), "root:3");
  assert.notEqual(pageGapKey(0), pageGapKey(1));
});
