/**
 * Platform name → registry glyph.
 *
 * The single map behind every place a social or contact mark is drawn. Before
 * this, `SocialGlyph` (render.tsx) and `ClusterIcon` (site_header) each carried
 * their own `switch` over the SAME path data, and the curated footer drew no
 * glyph at all — it printed the platform's name as text.
 *
 * Aliases are load-bearing, not tidiness: the `social_links` node's enum says
 * `x` where the curated footer's says `twitter`, and the footer also knows
 * pinterest/vimeo/spotify/github while the node knows whatsapp. Both spellings
 * resolve here so neither surface can show a blank where the other shows a
 * mark.
 */

import type { BuilderIconName } from "./icon-registry";

const PLATFORM_ICONS: Record<string, BuilderIconName> = {
  instagram: "instagram",
  tiktok: "tiktok",
  facebook: "facebook",
  youtube: "youtube",
  linkedin: "linkedin",
  x: "x",
  twitter: "x",
  whatsapp: "whatsapp",
  pinterest: "pinterest",
  vimeo: "vimeo",
  spotify: "spotify",
  github: "github",
  email: "email",
  mail: "email",
  phone: "phone",
  // Header-cluster item kinds that are not platforms but share the drawing.
  inquiry: "send",
  saved: "bookmark",
  favorites: "heart",
  search: "search",
  account: "user",
};

/** Generic link mark for a platform we do not have a glyph for. */
export const SOCIAL_FALLBACK_ICON: BuilderIconName = "web_link";

export function socialPlatformIconName(platform: string): BuilderIconName {
  return PLATFORM_ICONS[platform.toLowerCase()] ?? SOCIAL_FALLBACK_ICON;
}
