/**
 * Full-page composition preset — the complete "Noir & Or" Impronta homepage.
 *
 * Unlike the section-pack factories (one block each), this assembles ALL the Noir
 * blocks into a single drop-in PAGE template: hero → disciplines marquee →
 * featured board → divisions → story house → campaigns rail → stats → testimonials
 * → CTA → footer. It is composed by CALLING the same block factories, so the page
 * template and the individual "+" gallery section packs never drift — and because
 * every section is just a freeform BuilderNode subtree, each one is individually
 * selectable + editable on the canvas after the page is dropped.
 *
 * Registered as a `category: "page"` preset (alongside the other full-page
 * templates) + dispatched from `composition-presets.ts`.
 */
import { makeId } from "./create";
import type { BuilderNode } from "./types";
import { createMarqueeTickerPreset } from "./composition-preset-factories-noir";
import { createFeaturedFacesBoardPreset } from "./composition-preset-factories-noir-featured";
import { createTestimonialsTrioPreset } from "./composition-preset-factories-noir-testimonials";
import { createStatBandEditorialPreset } from "./composition-preset-factories-noir-stats";
import { createCampaignsLookbookRailPreset } from "./composition-preset-factories-noir-campaigns";
import { createCtaBannerSpotlightPreset } from "./composition-preset-factories-noir-cta";
import { createDivisionsRowPreset } from "./composition-preset-factories-noir-divisions";
import {
  buildHeroSlider,
  buildStoryHouse,
} from "../add-gallery/section-templates-freeform";

export function createImprontaNoirHomePreset(): Exclude<
  BuilderNode,
  { kind: "section" }
> {
  // story-house's tplSection() returns a freeform `container` (tplSection is a
  // labelled-container helper, NOT a legacy `section` node), wrapped one level.
  // Unwrap to its inner container so the homepage hosts the content directly —
  // same content + spacing, with the page providing the surrounding ground.
  const storySection = buildStoryHouse();
  const storyChildren =
    "children" in storySection && Array.isArray(storySection.children)
      ? storySection.children
      : [];
  const storyInner: BuilderNode = storyChildren[0] ?? storySection;

  return {
    id: makeId("container"),
    kind: "container",
    props: {
      htmlTag: "main",
      layout: "stack",
      style: {
        backgroundColor: "var(--token-color-background, #100e13)",
        width: "100%",
        // Full-bleed: without this the root container takes the default ~1120px
        // content max-width and the full-width sections get boxed in + centered.
        maxWidthFree: "100%",
        gap: "0px",
      },
    },
    // Top-to-bottom homepage order. Each entry is a fresh freeform tree (unique
    // ids minted per factory call), so the assembled page is collision-free and
    // every section explodes into editable nodes on drop.
    children: [
      buildHeroSlider(),
      createMarqueeTickerPreset(),
      createFeaturedFacesBoardPreset(),
      createDivisionsRowPreset(),
      storyInner,
      createCampaignsLookbookRailPreset(),
      createStatBandEditorialPreset(),
      createTestimonialsTrioPreset(),
      createCtaBannerSpotlightPreset(),
      // Footer intentionally omitted: on a real tenant the global Site Shell
      // footer already renders beneath the page body, so the block's own
      // footer-editorial would duplicate it. (Also trims the node budget.)
    ],
  };
}
