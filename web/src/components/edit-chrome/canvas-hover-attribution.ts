"use client";

/**
 * canvas-hover-attribution.ts — who does an overlay affordance BELONG to?
 *
 * THE BUG THIS MODULE EXISTS TO FIX (owner report, 2026-08-16: "the grab is on
 * off on off when hovering it… literally only when I put the mouse trying to
 * grab it it's blinking non stop").
 *
 * Canvas affordances — the on-hover drag grip, the resize / rotate / move
 * handles, the selection chip, the "Replace image" pill — are NOT children of
 * the block they act on. They are painted in the selection layer's fixed
 * overlay root (`<div data-edit-overlay class="pointer-events-none absolute
 * inset-0">`), positioned over the block in viewport coordinates. Most of them
 * are `pointer-events: auto`, because they are things you grab.
 *
 * Hover, meanwhile, was resolved purely from DOM ancestry:
 *
 *   1. bail to `null` when the pointer is inside `[data-edit-topbar]`,
 *      `[data-edit-drawer]` or `[data-edit-overlay]` (so hovering the layers
 *      rail does not light a canvas block), else
 *   2. `target.closest("[data-builder-node-id]")`.
 *
 * Step 1 catches the affordances too, because they live under the overlay root.
 * So moving the pointer ONTO a block's own drag grip reported "no block is
 * hovered". For the grip that is a self-cancelling loop: the grip only renders
 * while its block is hovered, so hover clears → the grip unmounts → the pointer
 * is now over the block again → hover sets → the grip remounts under the
 * pointer → hover clears. The blink is the loop running at pointer-event rate,
 * and it fires exactly when the operator aims at the grip. Same shape for the
 * "Replace image" pill, which the inline editor unmounted the instant you
 * reached for it.
 *
 * THE FIX IS ATTRIBUTION, NOT A LATCH. A hover latch (ignore changes for
 * ~120ms) would stop the flicker while still reporting the wrong node as
 * hovered, which is a correctness bug and not only a visual one: the layers
 * rail highlight, the box-model bands and the inspector all read that id.
 * Instead each affordance DECLARES the node it is part of, with
 * `data-hover-node-for="<nodeId>"`, and hover resolution prefers that
 * declaration over DOM ancestry. The affordance is then treated as part of its
 * own block: hovering it reports that block, so nothing unmounts and nothing
 * oscillates.
 *
 * An empty declaration (`data-hover-node-for=""`) is a deliberate "this
 * affordance belongs to no block" and resolves to `null`, so a future overlay
 * can opt out without being mistaken for un-attributed chrome.
 */

/** The attribute an overlay affordance uses to name the node it belongs to. */
export const HOVER_NODE_ATTR = "data-hover-node-for";

/**
 * The section-scoped twin. Curated sections track their own hovered id
 * (`data-section-id`), and their control rail has the identical problem: it is
 * painted in the overlay root, so `closest("[data-cms-section]")` from the rail
 * finds nothing and the rail unmounts the moment the pointer reaches it.
 */
export const HOVER_SECTION_ATTR = "data-hover-section-for";

/** Chrome surfaces whose interior is never a canvas hover. */
const CHROME_SELECTOR =
  "[data-edit-topbar], [data-edit-drawer], [data-edit-overlay]";

const NODE_SELECTOR = "[data-builder-node-id]";

const ATTRIBUTION_SELECTOR = `[${HOVER_NODE_ATTR}]`;

/**
 * Spread onto an overlay affordance so hover resolution counts it as part of
 * `nodeId`. A null/undefined id spreads nothing (the affordance keeps the old
 * ancestry behaviour rather than silently claiming an empty node).
 */
export function hoverAttributionProps(
  nodeId: string | null | undefined,
): Record<string, string> {
  return nodeId ? { [HOVER_NODE_ATTR]: nodeId } : {};
}

/** The nearest Element for an event target (text nodes report their parent). */
export function hoverEventElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

/**
 * The node id declared by the affordance under `target`, or `null` when the
 * target is not inside a declaring affordance at all.
 *
 * Distinguishes "no declaration" (`null`) from "declared as belonging to
 * nothing" (`""` → the returned `nodeId` is null but `attributed` is true), so
 * callers that need the difference can ask for it via
 * {@link resolveHoverAttribution}.
 */
export function resolveHoverAttribution(target: EventTarget | null): {
  attributed: boolean;
  nodeId: string | null;
} {
  const el = hoverEventElement(target);
  const declaring = el?.closest<HTMLElement>(ATTRIBUTION_SELECTOR) ?? null;
  if (!declaring) return { attributed: false, nodeId: null };
  const raw = declaring.getAttribute(HOVER_NODE_ATTR) ?? "";
  return { attributed: true, nodeId: raw === "" ? null : raw };
}

/** Convenience: the declared node id, or null when nothing declares one. */
export function resolveHoverAttributedNodeId(
  target: EventTarget | null,
): string | null {
  return resolveHoverAttribution(target).nodeId;
}

/** True when `target` sits inside an affordance declared as part of `nodeId`. */
export function isHoverAffordanceForNode(
  target: EventTarget | null,
  nodeId: string | null | undefined,
): boolean {
  if (!nodeId) return false;
  return resolveHoverAttribution(target).nodeId === nodeId;
}

/**
 * THE hover resolution for the canvas: which builder node is under `target`?
 *
 * Order matters and is the whole point of the module:
 *   1. an explicit `data-hover-node-for` declaration wins outright — an
 *      affordance is part of the block it acts on, wherever it is painted;
 *   2. otherwise editor chrome (topbar / drawers / overlay) is not the canvas;
 *   3. otherwise plain DOM ancestry.
 */
export function resolveHoveredBuilderNodeId(
  target: EventTarget | null,
): string | null {
  const el = hoverEventElement(target);
  if (!el) return null;
  const attribution = resolveHoverAttribution(el);
  if (attribution.attributed) return attribution.nodeId;
  if (el.closest(CHROME_SELECTOR)) return null;
  return (
    el.closest<HTMLElement>(NODE_SELECTOR)?.getAttribute("data-builder-node-id") ??
    null
  );
}

/**
 * Spread onto an overlay affordance that belongs to a curated SECTION (the
 * per-section control rail). Same contract as {@link hoverAttributionProps}.
 */
export function hoverSectionAttributionProps(
  sectionId: string | null | undefined,
): Record<string, string> {
  return sectionId ? { [HOVER_SECTION_ATTR]: sectionId } : {};
}

/**
 * Which curated section is under `target`? Declaration first, then the section
 * wrapper by DOM ancestry (the historical behaviour).
 */
export function resolveHoveredSectionId(
  target: EventTarget | null,
): string | null {
  const el = hoverEventElement(target);
  if (!el) return null;
  const declaring = el.closest<HTMLElement>(`[${HOVER_SECTION_ATTR}]`);
  if (declaring) {
    const raw = declaring.getAttribute(HOVER_SECTION_ATTR) ?? "";
    return raw === "" ? null : raw;
  }
  return (
    el.closest<HTMLElement>("[data-cms-section]")?.getAttribute("data-section-id") ??
    null
  );
}
