/**
 * LIVE TEXT: a heading or paragraph that follows the talent's own profile.
 *
 * `props.liveText` names ONE value the platform computes at render time from
 * real profile data (her headline, trade and city, years, languages, rating,
 * tagline, zone, hours, Instagram), in the visitor's locale. The stored `text`
 * stays the fallback, so a site with no data for a key still reads sensibly,
 * and a node whose value is empty is hidden (proof line, footer columns).
 *
 * Editing the text by hand hands the node back to the talent: the key is
 * dropped (`patchBuilderNodeProps`), so she is never overruled by the profile.
 * Dependency-free so the schema, the types, the inspector and the renderer
 * transform share one list.
 */
export const LIVE_TEXT_KEYS = [
  "hero_headline",
  "hero_eyebrow",
  "hero_tagline",
  "hero_proof",
  "footer_intro",
  "footer_where",
  "footer_hours",
  "footer_contact",
] as const;

export type LiveTextKey = (typeof LIVE_TEXT_KEYS)[number];

export function isLiveTextKey(value: unknown): value is LiveTextKey {
  return typeof value === "string" && (LIVE_TEXT_KEYS as readonly string[]).includes(value);
}

/** Keys with a value the stored text can stand in for (an empty live value keeps the text). */
export const LIVE_TEXT_KEEPS_FALLBACK: ReadonlySet<LiveTextKey> = new Set([
  "hero_headline",
  "hero_eyebrow",
  "hero_tagline",
]);
