/**
 * background-media.ts — the ONE resolver behind "put a moving background
 * behind this block".
 *
 * WHY THIS IS A MODULE AND NOT A FEW FIELDS IN THE RENDERER
 * ────────────────────────────────────────────────────────
 * A background video has three separate correctness problems, and every one of
 * them is a place a naive implementation silently ships something broken:
 *
 *   1. THE URL IS UNTRUSTED. An author pastes it. For the YouTube lane we must
 *      never put the pasted string into an iframe `src`: we parse it to an
 *      11-char video id and REBUILD a youtube-nocookie embed URL from that id.
 *      That is the same discipline `lib/talent-integrations/media-embed.ts`
 *      already enforces for featured media, so this module reuses that parser
 *      rather than adding a fourth embed host allow-list to a codebase that
 *      already has three that disagree (registry.ts `ALLOWED_EMBED_HOST_SUFFIXES`,
 *      code_embed `ALLOWED_HOSTS`, media-embed's per-provider host sets).
 *
 *   2. A BACKGROUND MUST NOT EAT THE TEXT. Autoplaying video behind a headline
 *      is unreadable without a scrim, so `overlay` is part of the value, not an
 *      afterthought an author has to discover. Unit is int 0-100, matching
 *      `hero`/`cta_banner` — NOT the 0-1 float that
 *      `sections/shared/presentation.ts` `videoOverlay` uses. Callers get a
 *      normalized 0-1 `overlayOpacity` out of here so neither convention leaks.
 *
 *   3. MOTION IS NOT ALWAYS WELCOME. Every resolved value carries a
 *      `posterUrl` when one can be had — the author's poster for an upload, and
 *      for YouTube the derived `i.ytimg.com` still. The layer renders that
 *      poster as a real `<img>` UNDER the moving element, so the
 *      `prefers-reduced-motion` rule in the renderer sheet only has to hide the
 *      video/iframe and a correct still is already painted behind it. No JS, no
 *      flash of empty box.
 *
 * PURE. No React, no DOM, no `server-only` — it is imported by the renderer
 * (server), the inspector (client), and its own unit test.
 */
import { z } from "zod";

import { parseMediaUrl, safeEmbedUrl } from "@/lib/talent-integrations/media-embed";

/** Where the moving pixels come from. */
export const BACKGROUND_MEDIA_SOURCES = ["upload", "youtube"] as const;
export type BackgroundMediaSource = (typeof BACKGROUND_MEDIA_SOURCES)[number];

/** Default scrim colour when an author sets an overlay but no colour. */
export const BACKGROUND_MEDIA_DEFAULT_OVERLAY_COLOR = "#000000";

/**
 * The stored shape. Lives on `container.props.backgroundMedia`.
 *
 * OPTIONAL AND BACK-COMPAT: a container without this key renders exactly the
 * markup it renders today — no wrapper, no extra attribute, no CSS hook.
 */
export interface BackgroundMediaProps {
  source: BackgroundMediaSource;
  /**
   * `upload` → the media-library file URL of the video.
   * `youtube` → the URL the author pasted. NEVER used as an iframe src
   * directly; {@link resolveBackgroundMedia} rebuilds the embed from the id.
   */
  src: string;
  /** Library row id when the upload came from the media library (may be null
   *  for a pasted URL, exactly like `MediaFieldValue.mediaId`). */
  mediaId?: string | null;
  /** Still frame. Also the reduced-motion fallback. Derived for YouTube. */
  poster?: string;
  /** Scrim strength, int 0-100 (hero / cta_banner convention). */
  overlay?: number;
  /** Scrim colour. Short CSS colour string; falls back to black. */
  overlayColor?: string;
  /** CSS object-position for the crop, e.g. "center", "50% 20%". */
  focalPoint?: string;
}

/**
 * A CSS colour short enough and plain enough to drop into a style value with no
 * further escaping. Deliberately narrow: hex, rgb/rgba, hsl/hsla, named colours
 * and `var(--token…)` all fit; anything with a quote, semicolon, brace or a
 * `url(` does not. Same defensive posture as the style schema's length caps.
 */
const CSS_COLOR_RE = /^[A-Za-z0-9_\-#.,()%/\s]{1,64}$/;

function isSafeCssColor(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  if (!CSS_COLOR_RE.test(value)) return false;
  // `url(` is the only function in the permitted charset that can fetch, and a
  // colour never needs it.
  return !/url\s*\(/i.test(value);
}

const backgroundMediaColorSchema = z
  .string()
  .max(64)
  .refine(isSafeCssColor, {
    message: "Overlay colour must be a plain CSS colour (hex, rgb(), hsl(), a name, or var(--token)).",
  });

export const backgroundMediaSchema = z
  .object({
    source: z.enum(BACKGROUND_MEDIA_SOURCES),
    src: z.string().max(2048),
    mediaId: z.string().max(120).nullable().optional(),
    poster: z.string().max(2048).optional(),
    overlay: z.number().int().min(0).max(100).optional(),
    overlayColor: backgroundMediaColorSchema.optional(),
    focalPoint: z.string().max(40).optional(),
  })
  .strict();

/** What the renderer actually needs. Every field is already safe to emit. */
export interface ResolvedBackgroundMedia {
  source: BackgroundMediaSource;
  /**
   * `upload` → the validated https/relative video URL for `<video src>`.
   * `youtube` → a rebuilt `www.youtube-nocookie.com/embed/<id>?…` URL whose
   * host is in the CSP `frame-src` allow-list.
   */
  url: string;
  /** Still frame to paint under the moving element, or null when none is known. */
  posterUrl: string | null;
  /** 0-1, ready for a CSS `opacity`. */
  overlayOpacity: number;
  overlayColor: string;
  /** CSS object-position. Always a value, defaulting to "center". */
  focalPoint: string;
}

/**
 * Player parameters for a YouTube BACKGROUND (not a player the visitor drives).
 *
 * `loop=1` is a documented no-op on its own — YouTube only loops a single video
 * when `playlist` names that same id, which is why the id is threaded in below.
 * `mute=1` is not politeness, it is the precondition for autoplay: every modern
 * browser blocks an unmuted autoplay, and a background that never starts is the
 * whole feature failing silently.
 */
function youtubeBackgroundParams(videoId: string): string {
  return new URLSearchParams({
    autoplay: "1",
    mute: "1",
    loop: "1",
    playlist: videoId,
    controls: "0",
    disablekb: "1",
    fs: "0",
    modestbranding: "1",
    playsinline: "1",
    rel: "0",
    iv_load_policy: "3",
  }).toString();
}

/**
 * A media URL we are willing to put in a `src`. Same-origin absolute paths and
 * https only — mirroring `add-gallery/template-preview-url.ts`
 * `isSafeTemplatePreviewUrl`, including its protocol-relative `//host` trap.
 */
function safeMediaUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("//")) return null;
  if (value.startsWith("/")) return value;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  return parsed.protocol === "https:" ? parsed.toString() : null;
}

/**
 * The YouTube still. `hqdefault` rather than `maxresdefault` on purpose:
 * maxres does not exist for every video and 404s to a grey placeholder, and a
 * background poster that is sometimes grey is worse than one that is always
 * 480p behind a scrim.
 */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Normalize a stored value into something the layer can render, or null.
 *
 * Returning null is a FIRST-CLASS outcome, not an error: an author who pasted a
 * URL that is not a YouTube video, or cleared the field, must get a block with
 * no background rather than a broken iframe or a thrown render.
 */
export function resolveBackgroundMedia(
  value: BackgroundMediaProps | null | undefined,
): ResolvedBackgroundMedia | null {
  if (!value) return null;

  const overlayRaw = typeof value.overlay === "number" ? value.overlay : 0;
  const overlayOpacity = Math.min(100, Math.max(0, Math.round(overlayRaw))) / 100;
  const overlayColor =
    value.overlayColor && isSafeCssColor(value.overlayColor)
      ? value.overlayColor.trim()
      : BACKGROUND_MEDIA_DEFAULT_OVERLAY_COLOR;
  const focalPoint =
    value.focalPoint && value.focalPoint.trim() ? value.focalPoint.trim() : "center";
  const authoredPoster = safeMediaUrl(value.poster);

  if (value.source === "youtube") {
    const parsed = parseMediaUrl(value.src ?? "");
    // Vimeo/Spotify/SoundCloud parse fine but are not what this field offers,
    // so anything other than YouTube is a miss rather than a silent substitution.
    if (!parsed || parsed.provider !== "youtube") return null;
    const embed = safeEmbedUrl("youtube", parsed.externalId);
    if (!embed) return null;
    return {
      source: "youtube",
      url: `${embed}?${youtubeBackgroundParams(parsed.externalId)}`,
      posterUrl: authoredPoster ?? youtubeThumbnailUrl(parsed.externalId),
      overlayOpacity,
      overlayColor,
      focalPoint,
    };
  }

  const url = safeMediaUrl(value.src);
  if (!url) return null;
  return {
    source: "upload",
    url,
    posterUrl: authoredPoster,
    overlayOpacity,
    overlayColor,
    focalPoint,
  };
}

/**
 * True when a stored value will actually paint something. The renderer uses it
 * to decide whether to emit the `data-bn-bg-media` hook at all, which is what
 * keeps every existing container byte-identical.
 */
export function hasRenderableBackgroundMedia(
  value: BackgroundMediaProps | null | undefined,
): boolean {
  return resolveBackgroundMedia(value) !== null;
}
