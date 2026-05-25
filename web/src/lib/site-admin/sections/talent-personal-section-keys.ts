/**
 * Section type keys allowed on Talent Max personal sites.
 * Kept free of registry imports so server actions and validation can check
 * allowlists without pulling client/editor modules into tests.
 */
export const TALENT_PERSONAL_SECTION_TYPE_KEYS = [
  "hero",
  "cta_banner",
  "editorial_split_hero",
  "testimonials_trio",
  "image_copy_alternating",
  "values_trio",
  "press_strip",
  "gallery_strip",
  "marquee",
  "stats",
  "faq_accordion",
  "split_screen",
  "timeline",
  "anchor_nav",
  "before_after",
  "content_tabs",
  "masonry",
  "scroll_carousel",
  "hero_split",
  "logo_cloud",
  "image_orbit",
  "video_reel",
  "lookbook",
  "booking_widget",
  "blank_section",
] as const;

export type TalentPersonalSectionTypeKey = (typeof TALENT_PERSONAL_SECTION_TYPE_KEYS)[number];

export function isTalentPersonalSectionTypeKey(key: string): boolean {
  return (TALENT_PERSONAL_SECTION_TYPE_KEYS as readonly string[]).includes(key);
}
