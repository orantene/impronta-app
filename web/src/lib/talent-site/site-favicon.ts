/**
 * DS-18: a talent or business site's tab icon is the business's own, never the
 * Tulala platform icon the root layout sets. Pure, so the choice is testable.
 *
 * Order: the site logo, then the owner's avatar, then a generated initials icon
 * (an inline `data:image/svg+xml` URL, so no new route and no reachability
 * change).
 */

export type SiteFaviconInput = {
  logoUrl?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  accentColor?: string | null;
};

const DEFAULT_ACCENT = "#111111";

function usableImageUrl(raw: string | null | undefined): string | null {
  const url = raw?.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return null;
}

/** First letter of the first two words, upper-cased ("Jorg Beauty" -> "JB"). */
export function siteInitials(displayName: string | null | undefined): string {
  const words = (displayName ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
  if (words.length === 0) return "";
  const letters = words.length === 1 ? [...words[0]!].slice(0, 1) : [[...words[0]!][0]!, [...words[1]!][0]!];
  return letters.join("").toLocaleUpperCase();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeAccent(raw: string | null | undefined): string {
  const c = raw?.trim();
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : DEFAULT_ACCENT;
}

function initialsSvgDataUrl(initials: string, accent: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="14" fill="${accent}"/>` +
    `<text x="32" y="32" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="Helvetica,Arial,sans-serif" font-size="${initials.length > 1 ? 28 : 34}" ` +
    `font-weight="700" fill="#ffffff">${escapeXml(initials)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** The icon URL for a site, or null when there is nothing to build one from (keep the platform icon). */
export function siteFaviconFor(input: SiteFaviconInput): string | null {
  const image = usableImageUrl(input.logoUrl) ?? usableImageUrl(input.avatarUrl);
  if (image) return image;
  const initials = siteInitials(input.displayName);
  if (!initials) return null;
  return initialsSvgDataUrl(initials, safeAccent(input.accentColor));
}
