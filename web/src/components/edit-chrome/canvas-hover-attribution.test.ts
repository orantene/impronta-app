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
  HOVER_NODE_ATTR,
  hoverAttributionProps,
  isHoverAffordanceForNode,
  resolveHoverAttribution,
  resolveHoveredBuilderNodeId,
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
