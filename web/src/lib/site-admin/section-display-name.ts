/**
 * Section display-name resolver — one source of truth for the operator-
 * facing label of a section.
 *
 * QA-2 fix (2026-04-29): the navigator and selection chip used to render
 *   `cleanSectionName(section.name) || section.name`
 * which meant "Featured professionals — new" (a generic seeder default)
 * even when the section's actual headline on canvas read "A short list,
 * always on call." Operators couldn't tell which section they had selected
 * by looking at the editor — the label said one thing, the canvas said
 * another. This module gives every consumer a unified rule:
 *
 *   1. If we know the section's primary headline content (passed in or
 *      derivable from props) and it's substantive, use that — it's the
 *      string the operator visually identifies the section by.
 *   2. Otherwise fall back to `cleanSectionName(rawName)` — the seeded
 *      default with hex/template suffixes stripped.
 *   3. Otherwise fall back to the raw name (last-resort safety net).
 *
 * `HEADLINE_PROP_BY_TYPE` is duplicated in `heading-lint-action.ts` for
 * historical reasons (server-only file kept its own copy to avoid client-
 * side imports). New consumers should import from here.
 *
 * No side-effects, no runtime imports beyond JS standard library — safe
 * for both server and client trees.
 */

import { cleanSectionName } from "./clean-section-name";

/**
 * Section type → property key whose value is the section's primary
 * headline. Mirrors `HEADLINE_PROP_BY_TYPE` in
 * `lib/site-admin/edit-mode/heading-lint-action.ts`. The server probe
 * keeps its own copy for `"use server"` boundary cleanliness.
 *
 * Sections not in this map (site_header, site_footer, marquee, etc.)
 * have no operator-meaningful headline; consumers fall back to the
 * stored name.
 */
export const HEADLINE_PROP_BY_TYPE: Readonly<Record<string, "headline" | "eyebrow" | "title">> = {
  hero: "headline",
  cta_banner: "headline",
  category_grid: "headline",
  destinations_mosaic: "headline",
  testimonials_trio: "headline",
  process_steps: "headline",
  image_copy_alternating: "headline",
  values_trio: "headline",
  press_strip: "eyebrow",
  gallery_strip: "headline",
  featured_talent: "headline",
  trust_strip: "headline",
  stats: "headline",
  faq_accordion: "headline",
  split_screen: "headline",
  timeline: "headline",
  pricing_grid: "headline",
  team_grid: "headline",
  contact_form: "headline",
  before_after: "headline",
  content_tabs: "headline",
  code_embed: "headline",
  blog_index: "headline",
  comparison_table: "headline",
  lottie: "headline",
  sticky_scroll: "headline",
  masonry: "headline",
  scroll_carousel: "headline",
  magazine_layout: "headline",
  hero_split: "headline",
  logo_cloud: "headline",
  image_orbit: "headline",
  video_reel: "headline",
  map_overlay: "headline",
  donation_form: "headline",
  code_snippet: "headline",
  event_listing: "headline",
  lookbook: "headline",
  booking_widget: "headline",
  blog_detail: "title",
};

/** Length below which a probed/derived headline is considered too short
 *  to be meaningful. Single characters and 1-2 letter typos shouldn't
 *  win over a clean stored name. */
const MIN_DISPLAY_HEADLINE_LENGTH = 3;

/** Length above which we truncate the display label so the navigator row
 *  doesn't blow out at long marketing copy. The full string still lives
 *  on the section's actual `headline` prop — this is display-only.
 *  Trailing ellipsis is added when truncation happens. */
const MAX_DISPLAY_HEADLINE_LENGTH = 64;

/**
 * Read the primary headline value out of a section's loaded props.
 * Returns an empty string when the type has no mapped prop, the prop
 * is missing, or the value is not a string.
 */
export function resolveSectionHeadlineFromProps(
  typeKey: string | null | undefined,
  props: Record<string, unknown> | null | undefined,
): string {
  if (!typeKey || !props) return "";
  const propKey = HEADLINE_PROP_BY_TYPE[typeKey];
  if (!propKey) return "";
  const v = props[propKey];
  if (typeof v !== "string") return "";
  return v.trim();
}

/**
 * Compute the operator-facing display name for a section.
 *
 * Inputs (all optional, but at least one must yield a non-empty result):
 *  - `headline`: pre-resolved headline string (from probe, server payload,
 *                or `resolveSectionHeadlineFromProps`). Preferred when set.
 *  - `props` + `typeKey`: raw section props; this fn will probe them
 *                if `headline` is omitted.
 *  - `rawName`: the stored seeder name (fallback when no headline).
 */
export function sectionDisplayName(args: {
  typeKey: string | null | undefined;
  rawName: string | null | undefined;
  headline?: string | null;
  props?: Record<string, unknown> | null;
}): string {
  const headline =
    args.headline?.trim() ||
    resolveSectionHeadlineFromProps(args.typeKey, args.props);

  if (headline && headline.length >= MIN_DISPLAY_HEADLINE_LENGTH) {
    if (headline.length <= MAX_DISPLAY_HEADLINE_LENGTH) return headline;
    return `${headline.slice(0, MAX_DISPLAY_HEADLINE_LENGTH - 1).trimEnd()}…`;
  }

  const cleaned = cleanSectionName(args.rawName);
  if (cleaned) return cleaned;
  return (args.rawName ?? "").trim();
}
