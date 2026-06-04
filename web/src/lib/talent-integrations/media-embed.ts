/**
 * Safe media-embed helper for talent featured-media items.
 *
 * Two responsibilities, both security boundaries:
 *   1. parseMediaUrl(url)        — normalize a pasted URL to a recognized
 *                                  { provider, externalId, canonicalUrl }.
 *                                  Anything that is not a recognized provider
 *                                  watch/track/playlist URL is rejected.
 *   2. safeEmbedUrl(provider,id) — map a recognized { provider, id } pair to a
 *                                  privacy-friendly iframe `src`. Unknown
 *                                  providers return null.
 *
 * We NEVER trust raw HTML or arbitrary iframe src strings. The public profile
 * only ever renders an iframe whose `src` came out of `safeEmbedUrl`, whose
 * host is one of the fixed allowlisted embed hosts below.
 *
 * Allowlisted embed hosts (must stay in sync with next.config.ts frame-src):
 *   - www.youtube-nocookie.com   (YouTube, privacy-friendly no-cookie domain)
 *   - player.vimeo.com           (Vimeo)
 *   - open.spotify.com           (Spotify embed)
 *   - w.soundcloud.com           (SoundCloud player)
 */

export const MEDIA_EMBED_PROVIDERS = [
  "youtube",
  "vimeo",
  "spotify",
  "soundcloud",
] as const;

export type MediaEmbedProvider = (typeof MEDIA_EMBED_PROVIDERS)[number];

export function isMediaEmbedProvider(value: string): value is MediaEmbedProvider {
  return (MEDIA_EMBED_PROVIDERS as readonly string[]).includes(value);
}

/** Maps a media-embed provider to the catalog provider_key it belongs to. */
export const MEDIA_EMBED_PROVIDER_KEYS: Record<MediaEmbedProvider, string> = {
  youtube: "youtube",
  vimeo: "vimeo",
  spotify: "spotify",
  soundcloud: "soundcloud",
};

/** Item kind stored on talent_integration_items for each provider/url shape. */
export type MediaEmbedItemKind = "video" | "track" | "playlist" | "album" | "profile";

export type ParsedMediaUrl = {
  provider: MediaEmbedProvider;
  /** Stable id used as external_item_id + to rebuild the safe embed URL. */
  externalId: string;
  /** Normalized canonical public URL we store as the item url. */
  canonicalUrl: string;
  itemKind: MediaEmbedItemKind;
};

/** Hostname allowlist per provider for the INPUT URL (what the talent pastes). */
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const SPOTIFY_HOSTS = new Set(["open.spotify.com"]);
const SOUNDCLOUD_HOSTS = new Set([
  "soundcloud.com",
  "www.soundcloud.com",
  "m.soundcloud.com",
]);

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID_RE = /^\d{6,}$/;
const SPOTIFY_KINDS = new Set(["track", "playlist", "album", "artist"]);
const SPOTIFY_ID_RE = /^[A-Za-z0-9]{22}$/;

function toUrl(raw: string): URL | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const url = new URL(trimmed);
    // Only http(s). Reject javascript:, data:, file:, etc.
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function normalizeHost(url: URL): string {
  return url.hostname.toLowerCase();
}

function parseYouTube(url: URL): ParsedMediaUrl | null {
  const host = normalizeHost(url);
  if (!YOUTUBE_HOSTS.has(host)) return null;

  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (url.pathname.startsWith("/watch")) {
    id = url.searchParams.get("v");
  } else {
    const segments = url.pathname.split("/").filter(Boolean);
    // /embed/<id>, /shorts/<id>, /v/<id>
    if (
      segments.length >= 2 &&
      (segments[0] === "embed" || segments[0] === "shorts" || segments[0] === "v")
    ) {
      id = segments[1] ?? null;
    }
  }
  if (!id || !YOUTUBE_ID_RE.test(id)) return null;
  return {
    provider: "youtube",
    externalId: id,
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    itemKind: "video",
  };
}

function parseVimeo(url: URL): ParsedMediaUrl | null {
  const host = normalizeHost(url);
  if (!VIMEO_HOSTS.has(host)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  // vimeo.com/<id>, vimeo.com/channels/x/<id>, player.vimeo.com/video/<id>
  const id = segments.length ? segments[segments.length - 1] : null;
  if (!id || !VIMEO_ID_RE.test(id)) return null;
  return {
    provider: "vimeo",
    externalId: id,
    canonicalUrl: `https://vimeo.com/${id}`,
    itemKind: "video",
  };
}

function parseSpotify(url: URL): ParsedMediaUrl | null {
  const host = normalizeHost(url);
  if (!SPOTIFY_HOSTS.has(host)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  // /track/<id>, /playlist/<id>, /album/<id>, /artist/<id>
  // also tolerate /embed/track/<id>
  const cleaned = segments[0] === "embed" ? segments.slice(1) : segments;
  const kind = cleaned[0];
  const id = cleaned[1];
  if (!kind || !id || !SPOTIFY_KINDS.has(kind) || !SPOTIFY_ID_RE.test(id)) {
    return null;
  }
  const itemKind: MediaEmbedItemKind =
    kind === "track"
      ? "track"
      : kind === "album"
        ? "album"
        : kind === "artist"
          ? "profile"
          : "playlist";
  return {
    provider: "spotify",
    externalId: `${kind}/${id}`,
    canonicalUrl: `https://open.spotify.com/${kind}/${id}`,
    itemKind,
  };
}

function parseSoundCloud(url: URL): ParsedMediaUrl | null {
  const host = normalizeHost(url);
  if (!SOUNDCLOUD_HOSTS.has(host)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  // SoundCloud has no stable numeric id in the public URL without an API call.
  // The SoundCloud player accepts the canonical track/profile URL directly, so
  // we keep the path as the external id and rebuild a canonical https URL.
  if (segments.length < 1) return null;
  // Reject obvious non-content paths.
  if (segments[0] === "you" || segments[0] === "stream" || segments[0] === "search") {
    return null;
  }
  const path = segments.join("/");
  const itemKind: MediaEmbedItemKind = segments.length >= 2 ? "track" : "profile";
  return {
    provider: "soundcloud",
    externalId: path,
    canonicalUrl: `https://soundcloud.com/${path}`,
    itemKind,
  };
}

/**
 * Parse + normalize a pasted media URL. Returns null for anything that is not a
 * recognized provider content URL (the caller MUST reject null).
 */
export function parseMediaUrl(raw: string): ParsedMediaUrl | null {
  const url = toUrl(raw);
  if (!url) return null;
  return (
    parseYouTube(url) ??
    parseVimeo(url) ??
    parseSpotify(url) ??
    parseSoundCloud(url)
  );
}

/**
 * Build a privacy-friendly iframe `src` for a recognized { provider, id }.
 * Returns null for unknown providers or malformed ids — the public render must
 * skip any item that returns null here.
 */
export function safeEmbedUrl(
  provider: string,
  externalId: string,
): string | null {
  if (!isMediaEmbedProvider(provider)) return null;
  const id = externalId.trim();
  if (!id) return null;

  switch (provider) {
    case "youtube": {
      if (!YOUTUBE_ID_RE.test(id)) return null;
      return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    case "vimeo": {
      if (!VIMEO_ID_RE.test(id)) return null;
      return `https://player.vimeo.com/video/${id}`;
    }
    case "spotify": {
      const [kind, spotifyId] = id.split("/");
      if (!kind || !spotifyId) return null;
      if (!SPOTIFY_KINDS.has(kind) || !SPOTIFY_ID_RE.test(spotifyId)) return null;
      return `https://open.spotify.com/embed/${kind}/${spotifyId}`;
    }
    case "soundcloud": {
      // The SoundCloud widget takes the canonical content URL. Reject anything
      // that does not look like a soundcloud.com path segment list.
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9_/-]*[A-Za-z0-9])?$/.test(id)) return null;
      const canonical = `https://soundcloud.com/${id}`;
      return (
        "https://w.soundcloud.com/player/?url=" +
        encodeURIComponent(canonical) +
        "&visual=false&show_comments=false&hide_related=true"
      );
    }
    default:
      return null;
  }
}

/** Frame-src hosts the public embed iframes load from. */
export const MEDIA_EMBED_FRAME_HOSTS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://open.spotify.com",
  "https://w.soundcloud.com",
] as const;
