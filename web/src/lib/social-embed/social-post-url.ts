/**
 * Instagram / TikTok post URL parsing for the `social_post` builder block.
 *
 * WHY NO oEmbed API CALL:
 * Meta's oEmbed endpoint has flip-flopped on whether an app access token and
 * App Review are required (token mandated in 2020, widely reported as reversed
 * in 2026, while the official reference still shows `{access-token}` in its
 * examples). Rather than bet a shipped feature on that ambiguity — and inherit
 * its rate limits — this block renders the providers' OWN documented embed
 * markup: a `<blockquote>` that each provider's `embed.js` hydrates client-side.
 * No token, no API call, no rate limit, no review. Same mechanism WordPress and
 * every major site uses.
 *
 * SECURITY:
 * The pasted string is operator input that ends up in public page markup, so it
 * is never echoed back. We parse to a strict { provider, id } and REBUILD a
 * canonical URL from an allow-list. Anything unrecognized returns null and the
 * caller must reject it — same contract as `parseMediaUrl` in
 * lib/talent-integrations/media-embed.ts.
 */

export const SOCIAL_POST_PROVIDERS = ["instagram", "tiktok"] as const;

export type SocialPostProvider = (typeof SOCIAL_POST_PROVIDERS)[number];

export function isSocialPostProvider(v: string): v is SocialPostProvider {
  return (SOCIAL_POST_PROVIDERS as readonly string[]).includes(v);
}

export type ParsedSocialPost = {
  provider: SocialPostProvider;
  /** Provider-native id: Instagram shortcode, TikTok numeric video id. */
  id: string;
  /** Canonical URL REBUILT from the allow-list — never the raw input. */
  canonicalUrl: string;
  /** TikTok's blockquote needs the author handle; Instagram's does not. */
  handle: string | null;
};

function toUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    // Accept a bare host paste ("instagram.com/p/...") by assuming https.
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withScheme);
    // Only https — an http embed would be blocked as mixed content anyway.
    if (url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function hostIs(url: URL, ...hosts: string[]): boolean {
  const h = url.hostname.toLowerCase().replace(/^www\./, "");
  return hosts.includes(h);
}

/** Instagram shortcodes are URL-safe base64-ish: letters, digits, - and _. */
const IG_SHORTCODE = /^[A-Za-z0-9_-]{5,30}$/;
/** TikTok video ids are numeric (19 digits today; allow a range). */
const TIKTOK_VIDEO_ID = /^\d{5,25}$/;
/** @handle without the @, per TikTok's own rules. */
const TIKTOK_HANDLE = /^[A-Za-z0-9._]{1,24}$/;

/**
 * instagram.com/p/<code>      — feed post
 * instagram.com/reel/<code>   — reel
 * instagram.com/tv/<code>     — IGTV (legacy, still resolves)
 *
 * Profile and story URLs are deliberately NOT accepted: neither is embeddable,
 * and silently rendering an empty blockquote reads as a broken page.
 */
function parseInstagram(url: URL): ParsedSocialPost | null {
  if (!hostIs(url, "instagram.com")) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const kindIndex = parts.findIndex((p) => p === "p" || p === "reel" || p === "tv");
  if (kindIndex === -1) return null;
  const id = parts[kindIndex + 1];
  if (!id || !IG_SHORTCODE.test(id)) return null;
  const kind = parts[kindIndex];
  return {
    provider: "instagram",
    id,
    canonicalUrl: `https://www.instagram.com/${kind}/${id}/`,
    handle: null,
  };
}

/**
 * tiktok.com/@handle/video/<id> — the only embeddable shape.
 *
 * Short links (vm.tiktok.com/XXXX) are NOT accepted: resolving them needs a
 * network redirect follow, which would put an outbound request in the render
 * path. The inspector tells the operator to paste the full URL instead.
 */
function parseTikTok(url: URL): ParsedSocialPost | null {
  if (!hostIs(url, "tiktok.com")) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const videoIndex = parts.findIndex((p) => p === "video");
  if (videoIndex === -1) return null;
  const id = parts[videoIndex + 1];
  if (!id || !TIKTOK_VIDEO_ID.test(id)) return null;
  const rawHandle = parts[videoIndex - 1] ?? "";
  const handle = rawHandle.startsWith("@") ? rawHandle.slice(1) : "";
  if (!handle || !TIKTOK_HANDLE.test(handle)) return null;
  return {
    provider: "tiktok",
    id,
    canonicalUrl: `https://www.tiktok.com/@${handle}/video/${id}`,
    handle,
  };
}

/**
 * Parse + normalize a pasted Instagram/TikTok post URL. Returns null for
 * anything unrecognized — the caller MUST reject null rather than render it.
 */
export function parseSocialPostUrl(raw: string): ParsedSocialPost | null {
  const url = toUrl(raw);
  if (!url) return null;
  return parseInstagram(url) ?? parseTikTok(url);
}

/** Script each provider's blockquote needs in order to hydrate. */
export const SOCIAL_POST_EMBED_SCRIPTS: Record<SocialPostProvider, string> = {
  instagram: "https://www.instagram.com/embed.js",
  tiktok: "https://www.tiktok.com/embed.js",
};

/**
 * Hosts the CSP must allow for these embeds to render. Kept beside the parser
 * so the allow-list and the renderer cannot drift (a missing directive fails
 * SILENTLY — the blockquote just never hydrates).
 */
export const SOCIAL_POST_CSP = {
  script: "https://www.instagram.com https://www.tiktok.com",
  frame:
    "https://www.instagram.com https://www.tiktok.com https://www.tiktok.com/embed",
} as const;
