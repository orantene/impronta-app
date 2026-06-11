/**
 * WS4-TASK2: Client-safe export of the per-section AI-rewritable field list.
 *
 * This mirrors `REWRITABLE_FIELDS` in ai-rewrite-action.ts (a "use server"
 * module that cannot export plain constants). The server action enforces the
 * same allow-list server-side; this client copy drives the inspector UI so it
 * only surfaces the AI button for fields the server will actually accept.
 *
 * Keep in sync with the `REWRITABLE_FIELDS` const in ai-rewrite-action.ts.
 */

export const AI_REWRITABLE_FIELDS: Readonly<Record<string, ReadonlyArray<string>>> = {
  hero: ["headline", "subheadline"],
  cta_banner: ["eyebrow", "headline", "copy", "reassurance"],
  category_grid: ["eyebrow", "headline", "copy"],
  destinations_mosaic: ["eyebrow", "headline", "copy", "footnote"],
  testimonials_trio: ["eyebrow", "headline"],
  process_steps: ["eyebrow", "headline", "copy"],
  image_copy_alternating: ["eyebrow", "headline"],
  values_trio: ["eyebrow", "headline"],
  press_strip: ["eyebrow"],
  gallery_strip: ["eyebrow", "headline", "caption"],
  featured_talent: ["eyebrow", "headline", "copy"],
  trust_strip: ["eyebrow", "headline"],
  stats: ["eyebrow", "headline"],
  faq_accordion: ["eyebrow", "headline", "intro"],
  split_screen: ["eyebrow", "headline", "body"],
  marquee: [],
  timeline: ["eyebrow", "headline"],
  pricing_grid: ["eyebrow", "headline", "intro"],
  team_grid: ["eyebrow", "headline", "intro"],
  contact_form: ["eyebrow", "headline", "intro", "successMessage"],
  before_after: ["eyebrow", "headline"],
  content_tabs: ["eyebrow", "headline"],
  code_embed: ["eyebrow", "headline", "caption"],
  anchor_nav: [],
  blog_index: ["eyebrow", "headline"],
  comparison_table: ["eyebrow", "headline", "intro"],
  lottie: ["eyebrow", "headline", "caption"],
  sticky_scroll: ["eyebrow", "headline"],
  masonry: ["eyebrow", "headline"],
  scroll_carousel: ["eyebrow", "headline"],
  blog_detail: ["category", "title", "byline", "body", "pullQuote"],
  magazine_layout: ["eyebrow", "headline"],
  hero_split: ["eyebrow", "headline", "subheadline"],
  logo_cloud: ["eyebrow", "headline"],
  image_orbit: ["eyebrow", "headline"],
  video_reel: ["eyebrow", "headline"],
  map_overlay: ["eyebrow", "headline"],
  donation_form: ["eyebrow", "headline", "intro", "trustNote"],
  code_snippet: ["eyebrow", "headline"],
  event_listing: ["eyebrow", "headline"],
  lookbook: ["eyebrow", "headline"],
  booking_widget: ["eyebrow", "headline", "intro", "buttonLabel"],
};

/**
 * Returns the AI-rewritable text fields for a given section type.
 * Returns an empty array when the section type is unknown or has no
 * rewritable fields.
 */
export function getAiRewritableFields(sectionTypeKey: string): ReadonlyArray<string> {
  return AI_REWRITABLE_FIELDS[sectionTypeKey] ?? [];
}
