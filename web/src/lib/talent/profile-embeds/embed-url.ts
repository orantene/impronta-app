/**
 * Profile-embed URL allow-list — the security boundary for the Pro/Portfolio
 * "social and video embeds" band on the public talent profile.
 *
 * THE CONTRACT
 *   parseProfileEmbedUrl(raw)  — a pasted string in, a strict
 *                                { provider, externalId, canonicalUrl } out, or
 *                                null. The caller MUST reject null. Nothing
 *                                that is not a recognized provider content URL
 *                                on an allow-listed hostname survives.
 *   profileEmbedIframeSrc(p,id)— rebuilds a per-provider iframe `src` from the
 *                                stored { provider, externalId }. Never from a
 *                                stored URL, never from user text.
 *
 * WHY THIS SHAPE
 * Embed URLs are user input that ends up in public page markup. We never inject
 * raw HTML, never render an operator-supplied iframe src, and never echo the
 * pasted string back. Both the DB row and the DOM only ever carry values this
 * module minted. A lookalike host (`youtube.com.evil.tld`), a scheme attack
 * (`javascript:`, `data:`), and an open-redirect shape
 * (`youtube.com/redirect?q=https://evil.tld`) all fail the hostname + path +
 * id-regex triple check and return null.
 *
 * REUSE, NOT REINVENTION
 * Four of the six providers already have a hardened parser in
 * lib/talent-integrations/media-embed.ts (YouTube / Vimeo / Spotify /
 * SoundCloud) and the other two in lib/social-embed/social-post-url.ts
 * (Instagram / TikTok). This module composes those two allow-lists into the one
 * six-provider surface the Pro plan markets, and adds the iframe-src builders
 * Instagram and TikTok were missing (the social_post builder block hydrates a
 * <blockquote> via provider embed.js; a profile band wants a plain sandboxed
 * iframe, so we use each provider's documented iframe embed path instead).
 *
 * FRAME HOSTS — every host below is already present in next.config.ts
 * `frame-src` (builderEmbedCsp + talentMediaEmbedCsp + socialPostCsp). A host
 * added here without a matching CSP directive fails SILENTLY: the iframe stays
 * blank. PROFILE_EMBED_FRAME_HOSTS pins the set, and a test asserts every
 * generated src lands inside it.
 */

import {
  parseMediaUrl,
  safeEmbedUrl,
  type MediaEmbedProvider,
} from "@/lib/talent-integrations/media-embed";
import { parseSocialPostUrl } from "@/lib/social-embed/social-post-url";

export const PROFILE_EMBED_PROVIDERS = [
  "instagram",
  "tiktok",
  "youtube",
  "spotify",
  "soundcloud",
  "vimeo",
] as const;

export type ProfileEmbedProvider = (typeof PROFILE_EMBED_PROVIDERS)[number];

export function isProfileEmbedProvider(
  value: string,
): value is ProfileEmbedProvider {
  return (PROFILE_EMBED_PROVIDERS as readonly string[]).includes(value);
}

export const PROFILE_EMBED_PROVIDER_LABELS: Record<
  ProfileEmbedProvider,
  string
> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  vimeo: "Vimeo",
};

export type ParsedProfileEmbed = {
  provider: ProfileEmbedProvider;
  /** Provider-native id. Stored as talent_profile_embeds.external_id. */
  externalId: string;
  /** Canonical public URL REBUILT from the allow-list — never the raw input. */
  canonicalUrl: string;
};

/** Instagram shortcode: URL-safe base64-ish. Mirrors social-post-url.ts. */
const IG_SHORTCODE = /^[A-Za-z0-9_-]{5,30}$/;
/** TikTok video ids are numeric (19 digits today; allow a range). */
const TIKTOK_VIDEO_ID = /^\d{5,25}$/;

/**
 * Parse + normalize a pasted embed URL against the six-provider allow-list.
 * Returns null for anything unrecognized — the caller MUST reject null rather
 * than store or render it.
 */
export function parseProfileEmbedUrl(raw: string): ParsedProfileEmbed | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000) return null;

  // Instagram / TikTok first — their parser accepts a scheme-less paste, so it
  // must not see a string the media parser would have claimed.
  const social = parseSocialPostUrl(trimmed);
  if (social) {
    return {
      provider: social.provider,
      // TikTok's embed needs only the numeric video id; Instagram needs the
      // shortcode. Both are already validated by the parser above.
      externalId: social.id,
      canonicalUrl: social.canonicalUrl,
    };
  }

  const media = parseMediaUrl(trimmed);
  if (media) {
    // Belt and braces: the media parser's provider union is a strict subset of
    // ours, but assert it rather than assume.
    const provider: MediaEmbedProvider = media.provider;
    if (!isProfileEmbedProvider(provider)) return null;
    return {
      provider,
      externalId: media.externalId,
      canonicalUrl: media.canonicalUrl,
    };
  }

  return null;
}

/**
 * Build the sandboxed iframe `src` for a stored { provider, externalId }.
 * Returns null for an unknown provider or a malformed id — the public render
 * MUST skip any row that returns null here.
 */
export function profileEmbedIframeSrc(
  provider: string,
  externalId: string,
): string | null {
  if (!isProfileEmbedProvider(provider)) return null;
  const id = typeof externalId === "string" ? externalId.trim() : "";
  if (!id) return null;

  if (provider === "instagram") {
    if (!IG_SHORTCODE.test(id)) return null;
    // Instagram's documented iframe embed path. `/embed` renders the post
    // without needing embed.js.
    return `https://www.instagram.com/p/${id}/embed`;
  }

  if (provider === "tiktok") {
    if (!TIKTOK_VIDEO_ID.test(id)) return null;
    return `https://www.tiktok.com/embed/v2/${id}`;
  }

  // youtube | spotify | soundcloud | vimeo — already hardened.
  return safeEmbedUrl(provider, id);
}

/**
 * Every host profileEmbedIframeSrc can emit. Must stay a subset of the
 * `frame-src` directive in next.config.ts — a missing directive fails SILENTLY.
 */
export const PROFILE_EMBED_FRAME_HOSTS = [
  "https://www.instagram.com",
  "https://www.tiktok.com",
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://open.spotify.com",
  "https://w.soundcloud.com",
] as const;

/**
 * Validate a press-clipping link. Press items are plain anchors, not iframes,
 * so there is no host allow-list — but the scheme is a security boundary: a
 * stored `javascript:` or `data:` URL would become a live XSS sink in an
 * <a href>. Returns the normalized absolute URL, or null.
 */
export function normalizePressUrl(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname || !url.hostname.includes(".")) return null;
  return url.toString();
}
