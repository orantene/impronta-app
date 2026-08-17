"use client";

/**
 * carousel-slide-model.ts — the slide manager's pure vocabulary.
 *
 * The React row list (`carousel-slide-manager.tsx`) does nothing but render
 * what this module derives, so "which thumbnail, which label, is this slide
 * blank" is unit-testable without a DOM.
 *
 * Why a slide needs its own model at all: a carousel child is NOT a "slide"
 * node — there is no such kind. It is whatever the operator dropped in
 * (`image`, `container`, `split`, `card`…), and the hero renderer lifts that
 * child's background onto the Ken-Burns layer at render time (see the
 * `site-bn-hero__slide-bg` branch in `builder-node/render.tsx`). So the
 * inspector has to look in the SAME two places the renderer does — an image
 * child's `src`, or any child's `style.backgroundImage` — or the slide list
 * shows a grey box next to a slide that plainly has a photo on it.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node";

export interface CarouselSlideModel {
  /** The child node's id — the selection target and the React key. */
  nodeId: string;
  /** 1-based, for the "Slide 3" fallback label and the row ordinal. */
  position: number;
  /** Operator-facing name (their own layer label when they set one). */
  label: string;
  /** Preview image URL, or null when the slide carries no picture. */
  thumbnailUrl: string | null;
  /** True when the slide has neither a picture nor any child content. */
  isEmpty: boolean;
}

/**
 * Pull a lone `url(...)` out of a CSS background shorthand. Mirrors
 * `singleBackgroundImageUrl` in `builder-node/render.tsx` — same bail on
 * gradients / multi-layer backgrounds, because a gradient has no thumbnail to
 * show and guessing one would be a lie.
 */
export function slideBackgroundUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/gradient\(/i.test(trimmed)) return null;
  const match = /^url\(\s*(['"]?)([^'")]+)\1\s*\)$/i.exec(trimmed);
  if (!match) return null;
  const url = match[2]!.trim();
  return url.length > 0 ? url : null;
}

/**
 * The picture this slide will actually paint, looked up the way the renderer
 * looks it up: an `image` child IS the background layer; any other child has
 * its `style.backgroundImage` lifted onto that layer.
 */
export function slideThumbnailUrl(child: BuilderNode): string | null {
  if (child.kind === "image") {
    const src = child.props.src;
    return typeof src === "string" && src.length > 0 ? src : null;
  }
  const style = (child.props as { style?: { backgroundImage?: string } }).style;
  return slideBackgroundUrl(style?.backgroundImage);
}

/** A slide with no picture AND no children reads as "nothing here yet". */
export function slideIsEmpty(child: BuilderNode): boolean {
  if (slideThumbnailUrl(child) !== null) return false;
  const children = (child as { children?: readonly BuilderNode[] }).children;
  return !children || children.length === 0;
}

/**
 * Build the row list. `displayName` is injected (the caller passes
 * `resolveLayerDisplayName`) so this module stays free of the registry and can
 * be tested with a two-line fake.
 */
export function buildCarouselSlideModels(
  children: readonly BuilderNode[],
  displayName: (node: BuilderNode) => string,
  slideFallbackLabel: (position: number) => string,
): CarouselSlideModel[] {
  return children.map((child, index) => {
    const position = index + 1;
    const derived = displayName(child).trim();
    return {
      nodeId: child.id,
      position,
      // `resolveLayerDisplayName` falls back to the node KIND ("Container",
      // "Image") for an unnamed node, which in a slide list is noise — every
      // row would say "Container". Prefer the positional name in that case and
      // keep the derived one only when it carries real content.
      label: derived.length > 0 ? derived : slideFallbackLabel(position),
      thumbnailUrl: slideThumbnailUrl(child),
      isEmpty: slideIsEmpty(child),
    };
  });
}

/**
 * Turn a `DraggableList` reorder (which hands back the whole new array) into
 * the ONE move the tree API speaks: `moveBuilderNodeToParentIndex(id, parent,
 * index)`. The list only ever performs a single splice, so exactly one node
 * changed position and every other id kept its relative order.
 *
 * Returns null when nothing moved, or when the two arrays are not a
 * permutation of each other — in which case the caller must not guess.
 */
export function singleMoveFromReorder(
  before: readonly string[],
  after: readonly string[],
): { nodeId: string; toIndex: number } | null {
  if (before.length !== after.length) return null;
  let first = 0;
  while (first < before.length && before[first] === after[first]) first += 1;
  if (first === before.length) return null;

  // Two candidates for "the one that moved": the id that now sits at the first
  // differing slot (dragged BACKWARD), or the id that used to sit there
  // (dragged FORWARD). Whichever one, when removed from both arrays, leaves
  // two identical sequences is the mover.
  for (const candidate of [after[first]!, before[first]!]) {
    const withoutBefore = before.filter((id) => id !== candidate);
    const withoutAfter = after.filter((id) => id !== candidate);
    if (
      withoutBefore.length === withoutAfter.length &&
      withoutBefore.every((id, index) => id === withoutAfter[index])
    ) {
      return { nodeId: candidate, toIndex: after.indexOf(candidate) };
    }
  }
  return null;
}

/**
 * Where a pin should land after the slide at `removedIndex` is deleted. Keeps
 * the canvas on a REAL slide instead of leaving the pin pointing past the end
 * (the carousel clamps, but the inspector's highlighted row would disagree
 * with the canvas for a frame, which reads as a bug).
 */
export function pinAfterRemoval(
  pinned: number,
  removedIndex: number,
  countBefore: number,
): number {
  const countAfter = Math.max(0, countBefore - 1);
  if (countAfter === 0) return 0;
  const shifted = removedIndex < pinned ? pinned - 1 : pinned;
  return Math.max(0, Math.min(shifted, countAfter - 1));
}
