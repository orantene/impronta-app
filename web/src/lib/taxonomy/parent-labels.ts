/**
 * User-friendly short labels for parent_category taxonomy terms.
 *
 * The Supabase `taxonomy_terms` table stores canonical full names
 * ("Hosts & Promo", "Music & DJs", "Chefs & Culinary", "Photo, Video &
 * Creative", "Influencers & Creators", etc.) for schema/internal use.
 *
 * UI surfaces (storefront facet, prototype picker, profile drawer) should
 * render the SHORT labels instead, per the 2026 reset rule:
 *   "Master vocabulary deep, UI shallow."
 *
 * Keyed by both:
 *   - The live Supabase parent_category slugs (kebab-case, e.g.
 *     "hosts-promo", "music-djs"), AND
 *   - The prototype's hardcoded fixture ids (snake_case, e.g.
 *     "hosts", "music"), so the same helper works in both data sources.
 */

export const SHORT_PARENT_LABEL: Record<string, string> = {
  // Live Supabase parent_category slugs (kebab-case, term_type='parent_category')
  "models": "Models",
  "hosts-promo": "Hosts",
  "performers": "Performers",
  "music-djs": "Music",
  "chefs-culinary": "Chefs",
  "wellness-beauty": "Wellness",
  "photo-video-creative": "Photo & Video",
  "influencers-creators": "Creators",
  "event-staff": "Event Staff",
  "hospitality-property": "Hospitality",
  "travel-concierge": "Travel",
  "transportation": "Transportation",
  "home-technical-services": "Home Services",
  "security-protection": "Security",
  "sports-fitness": "Sports & Fitness",
  "kids-family-services": "Kids & Family",
  "speakers-coaches-experts": "Speakers",
  "production-bts": "Production",
  "animals-specialty-acts": "Animals",

  // Prototype fixture ids (snake_case, used by web/src/app/prototypes/admin-shell)
  "hosts": "Hosts",
  "music": "Music",
  "chefs": "Chefs",
  "wellness": "Wellness",
  "photo_video": "Photo & Video",
  "creators": "Creators",
  "event_staff": "Event Staff",
  "hospitality": "Hospitality",
  "security": "Security",
};

/**
 * Returns the short display label for a parent_category, falling back to
 * the canonical name when the slug isn't in the map.
 */
export function shortParentLabel(p: { id?: string | null; slug?: string | null; name?: string | null; label?: string | null }): string {
  const key = p.slug ?? p.id ?? "";
  return SHORT_PARENT_LABEL[key] ?? p.name ?? p.label ?? key;
}
