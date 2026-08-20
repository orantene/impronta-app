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

/**
 * Where the moving pixels come from.
 *
 * `slideshow` (2026-08-17) is ADDITIVE: it appends a third lane and changes
 * nothing about the first two. A stored `{source:"upload"|"youtube", …}` value
 * resolves to exactly the same object it resolved to before, which is the whole
 * back-compat contract — every container already carrying a video background
 * keeps rendering byte-identical markup.
 */
export const BACKGROUND_MEDIA_SOURCES = ["upload", "youtube", "slideshow"] as const;
export type BackgroundMediaSource = (typeof BACKGROUND_MEDIA_SOURCES)[number];

/** Default scrim colour when an author sets an overlay but no colour. */
export const BACKGROUND_MEDIA_DEFAULT_OVERLAY_COLOR = "#000000";

/** How a slideshow moves from one image to the next. */
export const BACKGROUND_SLIDESHOW_TRANSITIONS = ["crossfade", "cut"] as const;
export type BackgroundSlideshowTransition =
  (typeof BACKGROUND_SLIDESHOW_TRANSITIONS)[number];

/**
 * Dwell time per image. Six seconds is long enough to read a headline over the
 * picture and short enough that the second image is clearly coming — the two
 * failure modes of a background slideshow are "it is a strobe" and "I never saw
 * it change".
 */
export const BACKGROUND_SLIDESHOW_DEFAULT_INTERVAL_MS = 6000;
export const BACKGROUND_SLIDESHOW_MIN_INTERVAL_MS = 2000;
export const BACKGROUND_SLIDESHOW_MAX_INTERVAL_MS = 20000;

/**
 * Crossfade length. Capped at a third of the dwell so the layer is a still
 * picture for most of every cycle rather than a permanent dissolve, no matter
 * how short the author sets the interval.
 */
export const BACKGROUND_SLIDESHOW_FADE_MS = 900;

/**
 * Hard cap on images. Not a taste call: every image past the first is a real
 * network fetch on the visitor's page, and an unbounded list is how a page
 * ships 60 full-bleed photos behind one headline.
 */
export const BACKGROUND_SLIDESHOW_MAX_SLIDES = 20;

/** One picture in a background slideshow. */
export interface BackgroundSlideProps {
  /** Media-library file URL (or a pasted https URL), exactly like `src`. */
  url: string;
  /**
   * Stable identity for the inspector's row list — React keys, drag reorder and
   * the "which row is pinned" highlight. Optional so a hand-written value still
   * validates; the inspector always writes one.
   */
  id?: string;
  /** Library row id when the picture came from the library (may be null). */
  mediaId?: string | null;
  /** Per-image CSS object-position, falling back to the value's `focalPoint`. */
  focalPoint?: string;
}

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
  /**
   * `slideshow` lane only — the ordered pictures to cycle through. Ignored by
   * the other two sources, which is what keeps this key additive: writing it
   * onto an existing video background changes nothing about how that background
   * renders.
   */
  slides?: BackgroundSlideProps[];
  /** `slideshow` lane only — dwell per image, ms. */
  intervalMs?: number;
  /** `slideshow` lane only — crossfade (default) or a hard cut. */
  transition?: BackgroundSlideshowTransition;
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

const backgroundSlideSchema = z
  .object({
    url: z.string().max(2048),
    id: z.string().max(64).optional(),
    mediaId: z.string().max(120).nullable().optional(),
    focalPoint: z.string().max(40).optional(),
  })
  .strict();

export const backgroundMediaSchema = z
  .object({
    source: z.enum(BACKGROUND_MEDIA_SOURCES),
    src: z.string().max(2048),
    mediaId: z.string().max(120).nullable().optional(),
    poster: z.string().max(2048).optional(),
    overlay: z.number().int().min(0).max(100).optional(),
    overlayColor: backgroundMediaColorSchema.optional(),
    focalPoint: z.string().max(40).optional(),
    // Slideshow lane. All three are `.optional()`, so every value stored before
    // 2026-08-17 still parses against this same strict object.
    slides: z.array(backgroundSlideSchema).max(BACKGROUND_SLIDESHOW_MAX_SLIDES).optional(),
    intervalMs: z
      .number()
      .int()
      .min(BACKGROUND_SLIDESHOW_MIN_INTERVAL_MS)
      .max(BACKGROUND_SLIDESHOW_MAX_INTERVAL_MS)
      .optional(),
    transition: z.enum(BACKGROUND_SLIDESHOW_TRANSITIONS).optional(),
  })
  .strict();

/** One validated slideshow image, ready to drop into an `<img>`. */
export interface ResolvedBackgroundSlide {
  url: string;
  /** Always a value — the slide's own, else the background's, else "center". */
  focalPoint: string;
}

/** The shared empty slide list. Returned by identity for the non-slideshow lanes. */
const NO_SLIDES: readonly ResolvedBackgroundSlide[] = Object.freeze([]);

/** What the renderer actually needs. Every field is already safe to emit. */
export interface ResolvedBackgroundMedia {
  source: BackgroundMediaSource;
  /**
   * `upload` → the validated https/relative video URL for `<video src>`.
   * `youtube` → a rebuilt `www.youtube-nocookie.com/embed/<id>?…` URL whose
   * host is in the CSP `frame-src` allow-list.
   * `slideshow` → the FIRST image, so a caller that only understands the two
   * original lanes still has a usable single URL rather than an empty string.
   */
  url: string;
  /** Still frame to paint under the moving element, or null when none is known. */
  posterUrl: string | null;
  /** 0-1, ready for a CSS `opacity`. */
  overlayOpacity: number;
  overlayColor: string;
  /** CSS object-position. Always a value, defaulting to "center". */
  focalPoint: string;
  /**
   * `slideshow` → the validated, ordered images (never empty: a slideshow with
   * no usable picture resolves to null instead). Every other source → the one
   * shared frozen empty array, so the field is safe to read unconditionally.
   */
  slides: readonly ResolvedBackgroundSlide[];
  /** Dwell per image in ms. Clamped; meaningless outside the slideshow lane. */
  intervalMs: number;
  /** Crossfade length in ms. 0 for a hard cut and for the non-slideshow lanes. */
  fadeMs: number;
}

/**
 * Player parameters for a YouTube BACKGROUND (not a player the visitor drives).
 *
 * `mute=1` is not politeness, it is the precondition for autoplay: every modern
 * browser blocks an unmuted autoplay, and a background that never starts is the
 * whole feature failing silently.
 *
 * WHY THERE IS NO `playlist` HERE, AND WHY THAT COSTS US A CLIENT COMPONENT.
 * The only URL-level way to loop a single YouTube video is `loop=1` PLUS
 * `playlist=<that same id>` — and naming a playlist puts the player in playlist
 * mode, which paints prev / pause / next buttons over the middle of the frame.
 * `controls=0` does not suppress them; they are playlist chrome, not player
 * controls. Verified on the live Impronta hero by swapping only that parameter:
 * with `playlist` the three buttons are there, without it they are gone.
 *
 * So the loop moves to `background-youtube-frame.tsx`, which replays the video
 * over the IFrame API — hence `enablejsapi=1`. That component also carries the
 * fallback below, so a player that never answers still loops.
 */
function youtubeBackgroundParams(): string {
  return new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    disablekb: "1",
    fs: "0",
    modestbranding: "1",
    playsinline: "1",
    rel: "0",
    iv_load_policy: "3",
    enablejsapi: "1",
  }).toString();
}

/**
 * The URL to fall back to when the IFrame API never answers: today's
 * playlist-loop embed. It loops without any JavaScript at all, at the cost of
 * the playlist buttons — which is the right trade in a failure case, because a
 * hero that stops on YouTube's end screen is far worse than three small icons.
 *
 * Lives here rather than in the client component so it is testable without a
 * DOM, and so the two URL shapes stay next to each other.
 */
export function youtubeBackgroundLoopFallbackUrl(embedUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(embedUrl);
  } catch {
    return null;
  }
  const videoId = url.pathname.split("/").pop();
  if (!videoId) return null;
  url.searchParams.delete("enablejsapi");
  url.searchParams.set("loop", "1");
  url.searchParams.set("playlist", videoId);
  return url.toString();
}

/**
 * YouTube player states worth naming. The rest (unstarted, buffering, cued)
 * are not decisions a background has to make.
 */
export const YOUTUBE_PLAYER_ENDED = 0;
export const YOUTUBE_PLAYER_PLAYING = 1;

/**
 * Pull the player state out of one IFrame API message, or null when the
 * message carries no state.
 *
 * TWO SHAPES, BOTH REAL. `onStateChange` puts a bare number in `info`, while
 * the `infoDelivery` stream — which is what the player actually emits most of
 * the time — nests it as `info.playerState`. Reading only the documented
 * `onStateChange` shape would mean never seeing the video end. Both shapes were
 * captured off the live player before this was written.
 *
 * Pure and exported so the loop's one real decision is testable without a DOM;
 * the component around it is all timers and postMessage plumbing.
 */
export function youtubePlayerStateFromMessage(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const info = (data as { info?: unknown }).info;
  if (typeof info === "number") return info;
  if (info && typeof info === "object") {
    const state = (info as { playerState?: unknown }).playerState;
    if (typeof state === "number") return state;
  }
  return null;
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

  if (value.source === "slideshow") {
    // Same URL discipline as the video lanes: an author-pasted string is
    // untrusted, so anything that is not same-origin-absolute or https is
    // DROPPED rather than emitted into a `src`.
    const slides: ResolvedBackgroundSlide[] = [];
    for (const slide of value.slides ?? []) {
      if (slides.length >= BACKGROUND_SLIDESHOW_MAX_SLIDES) break;
      const url = safeMediaUrl(slide?.url);
      if (!url) continue;
      const slideFocal =
        slide.focalPoint && slide.focalPoint.trim() ? slide.focalPoint.trim() : focalPoint;
      slides.push({ url, focalPoint: slideFocal });
    }
    // No usable picture is the same first-class "nothing to paint" outcome the
    // video lanes already have: the container renders with no layer at all.
    if (slides.length === 0) return null;
    const intervalMs = Math.min(
      BACKGROUND_SLIDESHOW_MAX_INTERVAL_MS,
      Math.max(
        BACKGROUND_SLIDESHOW_MIN_INTERVAL_MS,
        Math.round(value.intervalMs ?? BACKGROUND_SLIDESHOW_DEFAULT_INTERVAL_MS),
      ),
    );
    return {
      source: "slideshow",
      url: slides[0]!.url,
      // The first image IS the still, so there is nothing to paint under it.
      posterUrl: authoredPoster,
      overlayOpacity,
      overlayColor,
      focalPoint,
      slides,
      intervalMs,
      fadeMs:
        value.transition === "cut"
          ? 0
          : Math.min(BACKGROUND_SLIDESHOW_FADE_MS, Math.round(intervalMs / 3)),
    };
  }

  if (value.source === "youtube") {
    const parsed = parseMediaUrl(value.src ?? "");
    // Vimeo/Spotify/SoundCloud parse fine but are not what this field offers,
    // so anything other than YouTube is a miss rather than a silent substitution.
    if (!parsed || parsed.provider !== "youtube") return null;
    const embed = safeEmbedUrl("youtube", parsed.externalId);
    if (!embed) return null;
    return {
      source: "youtube",
      url: `${embed}?${youtubeBackgroundParams()}`,
      posterUrl: authoredPoster ?? youtubeThumbnailUrl(parsed.externalId),
      overlayOpacity,
      overlayColor,
      focalPoint,
      slides: NO_SLIDES,
      intervalMs: BACKGROUND_SLIDESHOW_DEFAULT_INTERVAL_MS,
      fadeMs: 0,
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
    slides: NO_SLIDES,
    intervalMs: BACKGROUND_SLIDESHOW_DEFAULT_INTERVAL_MS,
    fadeMs: 0,
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
