/**
 * Promo share links (design C, L4). Pure.
 *
 * `<site>/p/<slug>` on a talent site, `/t/<profileCode>/p/<slug>` on the hub.
 * The only query keys are `via` (a short source tag) and `t` (an opaque signed
 * token for personal promos). No PII, no UTM soup.
 */

export const VIA_TAGS = [
  "ig_story", "ig_post", "tiktok", "wa", "qr", "qr_print", "link", "email", "code", "site",
] as const;
export type ViaTag = (typeof VIA_TAGS)[number];

export function parseVia(raw: unknown): ViaTag | null {
  return typeof raw === "string" && (VIA_TAGS as readonly string[]).includes(raw) ? (raw as ViaTag) : null;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
export function isValidPromoSlug(slug: unknown): slug is string {
  return typeof slug === "string" && SLUG.test(slug);
}

export function promoPath(slug: string, profileCode?: string | null): string {
  return profileCode
    ? `/t/${encodeURIComponent(profileCode)}/p/${encodeURIComponent(slug)}`
    : `/p/${encodeURIComponent(slug)}`;
}

export function buildPromoLink(input: {
  origin: string;
  slug: string;
  profileCode?: string | null;
  via?: ViaTag | null;
  token?: string | null;
}): string {
  const q = new URLSearchParams();
  if (input.via) q.set("via", input.via);
  if (input.token) q.set("t", input.token);
  const qs = q.toString();
  return `${input.origin.replace(/\/+$/, "")}${promoPath(input.slug, input.profileCode)}${qs ? `?${qs}` : ""}`;
}

/** The share-sheet channel buttons and the tag each one writes. */
export const CHANNEL_VIA = {
  whatsapp: "wa",
  instagram_story: "ig_story",
  instagram_post: "ig_post",
  tiktok: "tiktok",
  copy_link: "link",
  qr_screen: "qr",
  qr_print: "qr_print",
} as const satisfies Record<string, ViaTag>;

export function whatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
