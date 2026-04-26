/**
 * Client-safe subset of the section registry.
 *
 * The full registry in `./registry.ts` imports each section's Component +
 * Editor + server-side helpers. Some section Components (e.g.
 * featured_talent) depend on server-only APIs (`next/headers`,
 * `node:crypto`) via their fetch helpers. When a "use client" module
 * (like section-editor.tsx) imports from `./registry.ts`, webpack pulls
 * all of that server-only graph into the client bundle and errors.
 *
 * This module mirrors the registry shape but only re-exports:
 *   - section meta (label, description, businessPurpose, visibleToAgency)
 *   - Editor component (always client — "use client" at the top of each
 *     section's Editor.tsx file)
 *   - current schema version
 *
 * Server paths keep importing `./registry.ts` for full access. Client
 * paths import from here and get no server-only transitive deps.
 */

import type { ComponentType } from "react";

import { heroMeta } from "./hero/meta";
import { HeroEditor } from "./hero/Editor";

import { trustStripMeta } from "./trust_strip/meta";
import { TrustStripEditor } from "./trust_strip/Editor";

import { ctaBannerMeta } from "./cta_banner/meta";
import { CtaBannerEditor } from "./cta_banner/Editor";

import { categoryGridMeta } from "./category_grid/meta";
import { CategoryGridEditor } from "./category_grid/Editor";

import { destinationsMosaicMeta } from "./destinations_mosaic/meta";
import { DestinationsMosaicEditor } from "./destinations_mosaic/Editor";

import { testimonialsTrioMeta } from "./testimonials_trio/meta";
import { TestimonialsTrioEditor } from "./testimonials_trio/Editor";

import { processStepsMeta } from "./process_steps/meta";
import { ProcessStepsEditor } from "./process_steps/Editor";

import { featuredTalentMeta } from "./featured_talent/meta";
import { FeaturedTalentEditor } from "./featured_talent/Editor";

import { galleryStripMeta } from "./gallery_strip/meta";
import { GalleryStripEditor } from "./gallery_strip/Editor";

import { imageCopyAlternatingMeta } from "./image_copy_alternating/meta";
import { ImageCopyAlternatingEditor } from "./image_copy_alternating/Editor";

import { pressStripMeta } from "./press_strip/meta";
import { PressStripEditor } from "./press_strip/Editor";

import { valuesTrioMeta } from "./values_trio/meta";
import { ValuesTrioEditor } from "./values_trio/Editor";

import { marqueeMeta } from "./marquee/meta";
import { MarqueeEditor } from "./marquee/Editor";

import { statsMeta } from "./stats/meta";
import { StatsEditor } from "./stats/Editor";

import { faqAccordionMeta } from "./faq_accordion/meta";
import { FaqAccordionEditor } from "./faq_accordion/Editor";

import { splitScreenMeta } from "./split_screen/meta";
import { SplitScreenEditor } from "./split_screen/Editor";

import { timelineMeta } from "./timeline/meta";
import { TimelineEditor } from "./timeline/Editor";

import { pricingGridMeta } from "./pricing_grid/meta";
import { PricingGridEditor } from "./pricing_grid/Editor";

import { teamGridMeta } from "./team_grid/meta";
import { TeamGridEditor } from "./team_grid/Editor";

import { contactFormMeta } from "./contact_form/meta";
import { ContactFormEditor } from "./contact_form/Editor";

import { anchorNavMeta } from "./anchor_nav/meta";
import { AnchorNavEditor } from "./anchor_nav/Editor";

import { beforeAfterMeta } from "./before_after/meta";
import { BeforeAfterEditor } from "./before_after/Editor";

import { contentTabsMeta } from "./content_tabs/meta";
import { ContentTabsEditor } from "./content_tabs/Editor";

import { codeEmbedMeta } from "./code_embed/meta";
import { CodeEmbedEditor } from "./code_embed/Editor";

import { blogIndexMeta } from "./blog_index/meta";
import { BlogIndexEditor } from "./blog_index/Editor";

import { comparisonTableMeta } from "./comparison_table/meta";
import { ComparisonTableEditor } from "./comparison_table/Editor";

import { lottieMeta } from "./lottie/meta";
import { LottieEditor } from "./lottie/Editor";
import { stickyScrollMeta } from "./sticky_scroll/meta";
import { StickyScrollEditor } from "./sticky_scroll/Editor";
import { masonryMeta } from "./masonry/meta";
import { MasonryEditor } from "./masonry/Editor";
import { scrollCarouselMeta } from "./scroll_carousel/meta";
import { ScrollCarouselEditor } from "./scroll_carousel/Editor";
import { blogDetailMeta } from "./blog_detail/meta";
import { BlogDetailEditor } from "./blog_detail/Editor";
import { magazineLayoutMeta } from "./magazine_layout/meta";
import { MagazineLayoutEditor } from "./magazine_layout/Editor";
import { heroSplitMeta } from "./hero_split/meta";
import { HeroSplitEditor } from "./hero_split/Editor";

import { logoCloudMeta } from "./logo_cloud/meta";
import { LogoCloudEditor } from "./logo_cloud/Editor";
import { imageOrbitMeta } from "./image_orbit/meta";
import { ImageOrbitEditor } from "./image_orbit/Editor";
import { videoReelMeta } from "./video_reel/meta";
import { VideoReelEditor } from "./video_reel/Editor";
import { mapOverlayMeta } from "./map_overlay/meta";
import { MapOverlayEditor } from "./map_overlay/Editor";
import { donationFormMeta } from "./donation_form/meta";
import { DonationFormEditor } from "./donation_form/Editor";
import { codeSnippetMeta } from "./code_snippet/meta";
import { CodeSnippetEditor } from "./code_snippet/Editor";
import { eventListingMeta } from "./event_listing/meta";
import { EventListingEditor } from "./event_listing/Editor";
import { lookbookMeta } from "./lookbook/meta";
import { LookbookEditor } from "./lookbook/Editor";
import { bookingWidgetMeta } from "./booking_widget/meta";
import { BookingWidgetEditor } from "./booking_widget/Editor";

import type { SectionEditorProps, SectionMeta } from "./types";

export interface SectionEditorRegistryEntry {
  meta: SectionMeta;
  currentVersion: number;
  Editor: ComponentType<SectionEditorProps<Record<string, unknown>>>;
}

export const SECTION_EDITOR_REGISTRY: Record<
  string,
  SectionEditorRegistryEntry
> = {
  hero: {
    meta: heroMeta,
    currentVersion: 1,
    Editor: HeroEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  trust_strip: {
    meta: trustStripMeta,
    currentVersion: 1,
    Editor: TrustStripEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  cta_banner: {
    meta: ctaBannerMeta,
    currentVersion: 1,
    Editor: CtaBannerEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  category_grid: {
    meta: categoryGridMeta,
    currentVersion: 1,
    Editor: CategoryGridEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  destinations_mosaic: {
    meta: destinationsMosaicMeta,
    currentVersion: 1,
    Editor: DestinationsMosaicEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  testimonials_trio: {
    meta: testimonialsTrioMeta,
    currentVersion: 1,
    Editor: TestimonialsTrioEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  process_steps: {
    meta: processStepsMeta,
    currentVersion: 1,
    Editor: ProcessStepsEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  featured_talent: {
    meta: featuredTalentMeta,
    currentVersion: 1,
    Editor: FeaturedTalentEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  gallery_strip: {
    meta: galleryStripMeta,
    currentVersion: 1,
    Editor: GalleryStripEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  image_copy_alternating: {
    meta: imageCopyAlternatingMeta,
    currentVersion: 1,
    Editor: ImageCopyAlternatingEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  press_strip: {
    meta: pressStripMeta,
    currentVersion: 1,
    Editor: PressStripEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  values_trio: {
    meta: valuesTrioMeta,
    currentVersion: 1,
    Editor: ValuesTrioEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  marquee: {
    meta: marqueeMeta,
    currentVersion: 1,
    Editor: MarqueeEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  stats: {
    meta: statsMeta,
    currentVersion: 1,
    Editor: StatsEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  faq_accordion: {
    meta: faqAccordionMeta,
    currentVersion: 1,
    Editor: FaqAccordionEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  split_screen: {
    meta: splitScreenMeta,
    currentVersion: 1,
    Editor: SplitScreenEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  timeline: {
    meta: timelineMeta,
    currentVersion: 1,
    Editor: TimelineEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  pricing_grid: {
    meta: pricingGridMeta,
    currentVersion: 1,
    Editor: PricingGridEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  team_grid: {
    meta: teamGridMeta,
    currentVersion: 1,
    Editor: TeamGridEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  contact_form: {
    meta: contactFormMeta,
    currentVersion: 1,
    Editor: ContactFormEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  anchor_nav: {
    meta: anchorNavMeta,
    currentVersion: 1,
    Editor: AnchorNavEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  before_after: {
    meta: beforeAfterMeta,
    currentVersion: 1,
    Editor: BeforeAfterEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  content_tabs: {
    meta: contentTabsMeta,
    currentVersion: 1,
    Editor: ContentTabsEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  code_embed: {
    meta: codeEmbedMeta,
    currentVersion: 1,
    Editor: CodeEmbedEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  blog_index: {
    meta: blogIndexMeta,
    currentVersion: 1,
    Editor: BlogIndexEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  comparison_table: {
    meta: comparisonTableMeta,
    currentVersion: 1,
    Editor: ComparisonTableEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  lottie: {
    meta: lottieMeta,
    currentVersion: 1,
    Editor: LottieEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  sticky_scroll: {
    meta: stickyScrollMeta,
    currentVersion: 1,
    Editor: StickyScrollEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  masonry: {
    meta: masonryMeta,
    currentVersion: 1,
    Editor: MasonryEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  scroll_carousel: {
    meta: scrollCarouselMeta,
    currentVersion: 1,
    Editor: ScrollCarouselEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  blog_detail: {
    meta: blogDetailMeta,
    currentVersion: 1,
    Editor: BlogDetailEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  magazine_layout: {
    meta: magazineLayoutMeta,
    currentVersion: 1,
    Editor: MagazineLayoutEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  hero_split: {
    meta: heroSplitMeta,
    currentVersion: 1,
    Editor: HeroSplitEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  logo_cloud: { meta: logoCloudMeta, currentVersion: 1, Editor: LogoCloudEditor as unknown as ComponentType<SectionEditorProps<Record<string, unknown>>> },
  image_orbit: { meta: imageOrbitMeta, currentVersion: 1, Editor: ImageOrbitEditor as unknown as ComponentType<SectionEditorProps<Record<string, unknown>>> },
  video_reel: { meta: videoReelMeta, currentVersion: 1, Editor: VideoReelEditor as unknown as ComponentType<SectionEditorProps<Record<string, unknown>>> },
  map_overlay: { meta: mapOverlayMeta, currentVersion: 1, Editor: MapOverlayEditor as unknown as ComponentType<SectionEditorProps<Record<string, unknown>>> },
  donation_form: { meta: donationFormMeta, currentVersion: 1, Editor: DonationFormEditor as unknown as ComponentType<SectionEditorProps<Record<string, unknown>>> },
  code_snippet: { meta: codeSnippetMeta, currentVersion: 1, Editor: CodeSnippetEditor as unknown as ComponentType<SectionEditorProps<Record<string, unknown>>> },
  event_listing: { meta: eventListingMeta, currentVersion: 1, Editor: EventListingEditor as unknown as ComponentType<SectionEditorProps<Record<string, unknown>>> },
  lookbook: { meta: lookbookMeta, currentVersion: 1, Editor: LookbookEditor as unknown as ComponentType<SectionEditorProps<Record<string, unknown>>> },
  booking_widget: { meta: bookingWidgetMeta, currentVersion: 1, Editor: BookingWidgetEditor as unknown as ComponentType<SectionEditorProps<Record<string, unknown>>> },
};

export function getSectionEditorEntry(
  key: string,
): SectionEditorRegistryEntry | null {
  return SECTION_EDITOR_REGISTRY[key] ?? null;
}
