"use client";

/**
 * carousel-slide-follow.ts — "select a slide, see that slide".
 *
 * Owner bug, verbatim: "the z-index of the selected slider is overlay and look
 * like a bug."
 *
 * The mechanism is not z-index, it is geometry. Every hero slide is
 * `position:absolute; inset:0` and the inactive ones are `opacity:0` but STILL
 * LAID OUT (`site-bn-hero__slide` in `builder-node/render.tsx`), and the slide
 * wrapper carries no `data-builder-node-id` — the id sits on the child inside
 * `…__slide-bg` / `…__slide-content`, which are also `inset:0`. So selecting
 * slide 2 measured the WHOLE hero and drew the selection ring on top of
 * whatever slide happened to be visible. The operator selected one thing and
 * the chrome outlined another: it reads exactly like a broken overlay.
 *
 * The honest fix is to make the canvas show what is selected. Whenever the
 * selected node lives inside a carousel, pin that carousel to the slide that
 * contains it. Works from every entry point at once — the canvas, the Layers
 * navigator, the nested-blocks panel, the inspector's own slide list — because
 * they all funnel through the one selected-node id.
 *
 * Mounted by `ClientBuilderCanvas`, which already holds the live tree.
 */

import { useEffect } from "react";

import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { setCarouselSlide } from "@/lib/site-admin/builder-node/carousel-edit-bridge";
import { useSelectedBuilderNodeId } from "./selection-bridge";

export interface CarouselSlideHit {
  /** The carousel node id — the key the pin is stored under. */
  carouselId: string;
  /** Index of the direct carousel child that contains the selection. */
  slideIndex: number;
}

function nodeChildrenOf(node: BuilderNode): readonly BuilderNode[] {
  return (node as { children?: readonly BuilderNode[] }).children ?? [];
}

/**
 * Find the innermost carousel that contains `selectedId`, and which of its
 * direct children (slides) the selection sits in. Returns null when the
 * selection is not inside a carousel at all — including when the CAROUSEL
 * ITSELF is what is selected, because pinning then would override a slide the
 * operator deliberately stepped to with the canvas arrows.
 *
 * Innermost wins: a carousel nested inside a slide of another carousel pins
 * the inner one, which is the carousel the operator is actually working in.
 */
export function resolveCarouselSlideForNode(
  tree: BuilderNodeTree,
  selectedId: string | null,
): CarouselSlideHit | null {
  if (!selectedId) return null;

  let found: CarouselSlideHit | null = null;

  // Depth-first. `hit` carries the nearest enclosing (carousel, slideIndex) so
  // a match deep inside a slide still knows which slide it came from; because
  // we overwrite it on the way down, the INNERMOST carousel is the one that
  // survives at the matching node.
  function walk(node: BuilderNode, hit: CarouselSlideHit | null): void {
    if (found) return;
    if (node.id === selectedId) {
      found = hit;
      return;
    }
    const children = nodeChildrenOf(node);
    if (node.kind === "carousel") {
      children.forEach((slide, slideIndex) => {
        const slideHit: CarouselSlideHit = { carouselId: node.id, slideIndex };
        // The slide node itself matches too — selecting a slide from the layer
        // tree must pin it, not just selecting something inside it.
        walk(slide, slideHit);
      });
      return;
    }
    for (const child of children) walk(child, hit);
  }

  for (const root of tree) walk(root, null);
  return found;
}

/**
 * Keep the canvas showing whichever slide holds the current selection. No-op
 * when nothing is selected or the selection is outside every carousel — the
 * previous pin stays, so stepping through slides with the canvas arrows is not
 * undone by clicking a heading elsewhere on the page.
 */
export function useCarouselSlideFollow(tree: BuilderNodeTree): void {
  const selectedBuilderNodeId = useSelectedBuilderNodeId();
  useEffect(() => {
    const hit = resolveCarouselSlideForNode(tree, selectedBuilderNodeId);
    if (!hit) return;
    setCarouselSlide(hit.carouselId, hit.slideIndex);
  }, [tree, selectedBuilderNodeId]);
}
