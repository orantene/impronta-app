/**
 * F5 (TUL-1273 #8): share images that WhatsApp and friends actually show.
 *
 * WhatsApp skips a link preview image that is too heavy (over roughly 300 KB).
 * Photos uploaded by a business are full-size originals, so `og:image` pointed
 * at them and the preview was blank.
 *
 * The fix routes an optimizable photo through the Next image optimizer at 1200
 * px wide (`w=1200` is in the default `deviceSizes`) at quality 75. A crawler
 * sends no `Accept: image/avif`, so the optimizer answers WebP/JPEG at a few
 * tens of KB. The generated brand cards (`opengraph-image.tsx`) are already
 * 1200x630 PNGs and are untouched.
 *
 * PURE. Only hosts that `next.config.ts` lists in `images.remotePatterns` are
 * routed (anything else would 400 and leave the preview blank, which is worse
 * than a heavy image), so the allow-list lives here next to the rule.
 */

export const SHARE_IMAGE = {
  /** The card size every generated card uses. */
  width: 1200,
  height: 630,
  /** WhatsApp drops previews heavier than this. */
  maxBytes: 300 * 1024,
  quality: 75,
} as const;

/** Hosts in next.config.ts images.remotePatterns besides the project's own storage. */
const STATIC_OPTIMIZABLE_HOSTS: readonly string[] = ["images.unsplash.com", "i.pravatar.cc"];

function supabaseHost(supabaseUrl: string | undefined | null): string | null {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }
}

/** True when the optimizer is configured to fetch this absolute URL. */
export function isOptimizableImageUrl(absoluteUrl: string, supabaseUrl?: string | null): boolean {
  let u: URL;
  try {
    u = new URL(absoluteUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (/\.svg$/i.test(u.pathname)) return false;
  const own = supabaseHost(supabaseUrl);
  if (own && u.hostname === own) {
    return u.pathname.startsWith("/storage/v1/object/public/") || u.pathname.startsWith("/storage/v1/object/sign/");
  }
  return STATIC_OPTIMIZABLE_HOSTS.includes(u.hostname);
}

/**
 * The URL for `og:image` / `twitter:image`. An optimizable photo becomes a
 * 1200 px optimizer URL on the page's own origin; everything else (a generated
 * card, an SVG, a foreign host) is returned unchanged.
 */
export function shareImageUrl(
  absoluteUrl: string,
  origin: string,
  supabaseUrl: string | null | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string {
  const src = absoluteUrl.trim();
  if (!src || src.includes("/_next/image")) return src;
  if (!isOptimizableImageUrl(src, supabaseUrl)) return src;
  const base = origin.replace(/\/+$/, "");
  return `${base}/_next/image?url=${encodeURIComponent(src)}&w=${SHARE_IMAGE.width}&q=${SHARE_IMAGE.quality}`;
}

/** True when an image of this many bytes will still show in a WhatsApp preview. */
export function shareImageWithinBudget(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes > 0 && bytes <= SHARE_IMAGE.maxBytes;
}

/** Default widths: all in Next's default `deviceSizes`/`imageSizes`. */
export const SRCSET_WIDTHS = [480, 640, 828, 1200, 1920] as const;

/**
 * A `srcset` for an optimizable (or same-origin) image, so a phone does not
 * download the desktop file. Null when the optimizer cannot fetch the source;
 * the caller then keeps the plain `src`.
 */
export function optimizedSrcSet(
  src: string,
  widths: readonly number[] = SRCSET_WIDTHS,
  supabaseUrl: string | null | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  const s = src.trim();
  if (!s || s.startsWith("data:")) return null;
  const local = s.startsWith("/") && !s.startsWith("//");
  if (!local && !isOptimizableImageUrl(s, supabaseUrl)) return null;
  return widths.map((w) => `/_next/image?url=${encodeURIComponent(s)}&w=${w}&q=${SHARE_IMAGE.quality} ${w}w`).join(", ");
}
