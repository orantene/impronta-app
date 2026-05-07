import { anchorNavMeta } from "./anchor_nav/meta";
import { beforeAfterMeta } from "./before_after/meta";
import { blogDetailMeta } from "./blog_detail/meta";
import { blogIndexMeta } from "./blog_index/meta";
import { bookingWidgetMeta } from "./booking_widget/meta";
import { categoryGridMeta } from "./category_grid/meta";
import { codeEmbedMeta } from "./code_embed/meta";
import { codeSnippetMeta } from "./code_snippet/meta";
import { comparisonTableMeta } from "./comparison_table/meta";
import { contactFormMeta } from "./contact_form/meta";
import { contentTabsMeta } from "./content_tabs/meta";
import { ctaBannerMeta } from "./cta_banner/meta";
import { destinationsMosaicMeta } from "./destinations_mosaic/meta";
import { donationFormMeta } from "./donation_form/meta";
import { eventListingMeta } from "./event_listing/meta";
import { faqAccordionMeta } from "./faq_accordion/meta";
import { featuredTalentMeta } from "./featured_talent/meta";
import { galleryStripMeta } from "./gallery_strip/meta";
import { heroMeta } from "./hero/meta";
import { heroSplitMeta } from "./hero_split/meta";
import { imageCopyAlternatingMeta } from "./image_copy_alternating/meta";
import { imageOrbitMeta } from "./image_orbit/meta";
import { logoCloudMeta } from "./logo_cloud/meta";
import { lookbookMeta } from "./lookbook/meta";
import { lottieMeta } from "./lottie/meta";
import { magazineLayoutMeta } from "./magazine_layout/meta";
import { mapOverlayMeta } from "./map_overlay/meta";
import { marqueeMeta } from "./marquee/meta";
import { masonryMeta } from "./masonry/meta";
import { pressStripMeta } from "./press_strip/meta";
import { pricingGridMeta } from "./pricing_grid/meta";
import { processStepsMeta } from "./process_steps/meta";
import { scrollCarouselMeta } from "./scroll_carousel/meta";
import { siteFooterMeta } from "./site_footer/meta";
import { siteHeaderMeta } from "./site_header/meta";
import { splitScreenMeta } from "./split_screen/meta";
import { statsMeta } from "./stats/meta";
import { stickyScrollMeta } from "./sticky_scroll/meta";
import { teamGridMeta } from "./team_grid/meta";
import { testimonialsTrioMeta } from "./testimonials_trio/meta";
import { timelineMeta } from "./timeline/meta";
import { trustStripMeta } from "./trust_strip/meta";
import { valuesTrioMeta } from "./values_trio/meta";
import { videoReelMeta } from "./video_reel/meta";
import type { SectionMeta } from "./types";

const SECTION_META_REGISTRY = {
  anchor_nav: anchorNavMeta,
  before_after: beforeAfterMeta,
  blog_detail: blogDetailMeta,
  blog_index: blogIndexMeta,
  booking_widget: bookingWidgetMeta,
  category_grid: categoryGridMeta,
  code_embed: codeEmbedMeta,
  code_snippet: codeSnippetMeta,
  comparison_table: comparisonTableMeta,
  contact_form: contactFormMeta,
  content_tabs: contentTabsMeta,
  cta_banner: ctaBannerMeta,
  destinations_mosaic: destinationsMosaicMeta,
  donation_form: donationFormMeta,
  event_listing: eventListingMeta,
  faq_accordion: faqAccordionMeta,
  featured_talent: featuredTalentMeta,
  gallery_strip: galleryStripMeta,
  hero: heroMeta,
  hero_split: heroSplitMeta,
  image_copy_alternating: imageCopyAlternatingMeta,
  image_orbit: imageOrbitMeta,
  logo_cloud: logoCloudMeta,
  lookbook: lookbookMeta,
  lottie: lottieMeta,
  magazine_layout: magazineLayoutMeta,
  map_overlay: mapOverlayMeta,
  marquee: marqueeMeta,
  masonry: masonryMeta,
  press_strip: pressStripMeta,
  pricing_grid: pricingGridMeta,
  process_steps: processStepsMeta,
  scroll_carousel: scrollCarouselMeta,
  site_footer: siteFooterMeta,
  site_header: siteHeaderMeta,
  split_screen: splitScreenMeta,
  stats: statsMeta,
  sticky_scroll: stickyScrollMeta,
  team_grid: teamGridMeta,
  testimonials_trio: testimonialsTrioMeta,
  timeline: timelineMeta,
  trust_strip: trustStripMeta,
  values_trio: valuesTrioMeta,
  video_reel: videoReelMeta,
} as const satisfies Record<string, SectionMeta>;

export function getSectionMeta(key: string): SectionMeta | null {
  if (!(key in SECTION_META_REGISTRY)) return null;
  return SECTION_META_REGISTRY[key as keyof typeof SECTION_META_REGISTRY];
}

export function listSectionMetaKeys(): ReadonlyArray<string> {
  return Object.keys(SECTION_META_REGISTRY).sort();
}
