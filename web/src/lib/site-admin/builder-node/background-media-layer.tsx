/**
 * background-media-layer.tsx — the markup for a video / YouTube background.
 *
 * Extracted rather than inlined into `render.tsx` (5,287 lines and on nobody's
 * budget table only because it has an eslint `max-lines` suppression) so the
 * feature is readable in one screen and testable without the renderer.
 *
 * THE STACK, BACK TO FRONT
 * ────────────────────────
 *   poster <img>   — painted first, so the block is never an empty hole while
 *                    the video buffers, and so `prefers-reduced-motion` only
 *                    has to HIDE the moving element to land on a correct still.
 *   <video>/<iframe> — the motion. Muted + looped + inert.
 *   scrim <span>   — the legibility wash. Colour + opacity come from the
 *                    author's overlay setting.
 *
 * Everything is `aria-hidden` and `pointer-events:none` (set in the sheet): a
 * decorative background must not be reachable by a screen reader, must not take
 * focus, and must not swallow clicks meant for the content on top of it.
 *
 * The geometry (cover-crop, the container-query sizing that makes a 16:9 iframe
 * fill an arbitrary box, and the reduced-motion rule) lives in the renderer's
 * static sheet — see BACKGROUND_MEDIA_CSS below, which `render.tsx` splices in.
 */
import type { CSSProperties, ReactNode } from "react";

import { BackgroundSlideshow } from "./background-slideshow";
import {
  resolveBackgroundMedia,
  type BackgroundMediaProps,
} from "./background-media";

/**
 * Slideshow geometry. Declared ABOVE `BACKGROUND_MEDIA_CSS` because that
 * template literal interpolates it: a `const` referenced before its
 * initialiser is a TDZ crash at module evaluation, and no gate in this repo
 * catches a chunk-eval crash (see `incident_card_design_token_keys_tdz_cycle`).
 *
 * Images stack exactly like the poster does; only the active one is opaque.
 * The fade length is a per-node variable rather than a constant so "cut"
 * (0ms) and "crossfade" are the same rule with a different number.
 *
 * The reduced-motion block is SEPARATE from the video/iframe one above it on
 * purpose: that rule is pinned character-for-character by
 * `background-media-render.test.ts`, and widening its selector list would
 * break a guard that is testing something real.
 */
const BACKGROUND_SLIDESHOW_CSS = `
.site-builder-bg-media__slide{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity var(--bn-bg-slide-fade,0ms) linear}
.site-builder-bg-media__slide[data-active]{opacity:1}
@media (prefers-reduced-motion:reduce){.site-builder-bg-media__slide{transition:none}.site-builder-bg-media__slide:not([data-active]){display:none}}
`.trim();

/**
 * Static CSS for the layer. Exported so `render.tsx` owns exactly one import
 * line instead of forty lines of selectors.
 *
 * WHY `container-type:size` + `cq` UNITS. A YouTube iframe is locked to 16:9.
 * To make it COVER a box of unknown aspect you have to size it against that
 * box's own dimensions, and the wrapper is `position:absolute;inset:0`, so it
 * has definite dimensions and can be a size container. `max()` of "fill the
 * box" and "the height 16:9 demands for this width" is the cover rule, with
 * `min-width/min-height:100%` as the floor for engines without `cq` units.
 *
 * WHY THE FRAME FADES IN. A YouTube player paints its own chrome — title bar,
 * spinner — for about a second before the first frame arrives, and the iframe
 * sits ON TOP of the poster, so that chrome is what a visitor sees on load.
 * Holding the frame transparent for that beat lets the poster cover it, then
 * the video takes over with nothing to see in between. It is keyed off
 * `data-bn-bg-poster` because without a poster underneath, fading the frame in
 * would trade a flash of YouTube for a hole. CSS-only: no JS, no hydration.
 *
 * WHY THE CHILD RULE. `.site-builder-node--container` is flex or grid. The
 * layer itself is `position:absolute`, so it is out of flow and cannot become a
 * flex/grid item — but the AUTHOR'S children still need to sit above it, so
 * they get `position:relative;z-index:1`. `isolation:isolate` on the container
 * pins that ordering inside this block: no z-index emitted here can escape into
 * the editor's selection chrome.
 */
export const BACKGROUND_MEDIA_CSS = `
.site-builder-node[data-bn-bg-media]{position:relative;isolation:isolate;overflow:hidden}
.site-builder-node[data-bn-bg-media] > :not(.site-builder-bg-media){position:relative;z-index:1}
.site-builder-bg-media{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;border-radius:inherit;container-type:size}
.site-builder-bg-media__poster,.site-builder-bg-media__video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border:0;display:block}
.site-builder-bg-media__frame{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);border:0;min-width:100%;min-height:100%;width:max(100%,calc(100cqh * 16 / 9));height:max(100%,calc(100cqw * 9 / 16))}
.site-builder-bg-media__scrim{position:absolute;inset:0;display:block;background:var(--bn-bg-overlay-color,#000);opacity:var(--bn-bg-overlay,0)}
.site-builder-bg-media[data-bn-bg-poster] .site-builder-bg-media__frame{opacity:0;animation:bn-bg-frame-in 500ms ease 1100ms forwards}
@keyframes bn-bg-frame-in{to{opacity:1}}
@media (prefers-reduced-motion:reduce){.site-builder-bg-media__video,.site-builder-bg-media__frame{display:none}}
${BACKGROUND_SLIDESHOW_CSS}
`.trim();

/**
 * The iframe sandbox for the YouTube lane.
 *
 * `allow-same-origin` is present because the YouTube player needs its own
 * origin to function (storage + postMessage) and WITHOUT it the frame renders a
 * permanent error card. It is safe here specifically because the frame is
 * cross-origin: `allow-scripts allow-same-origin` is only a sandbox escape when
 * the framed document shares the embedder's origin, and youtube-nocookie.com
 * never does. No `allow-popups`, no `allow-forms`, no `allow-top-navigation` —
 * a background cannot need any of them.
 */
const YOUTUBE_SANDBOX = "allow-scripts allow-same-origin allow-presentation";

/**
 * Render the background layer for a node, or null when there is nothing
 * renderable (no value, cleared value, or a pasted URL that is not a YouTube
 * video). Null is the back-compat path: the caller emits no attribute and no
 * child, so the node's markup is byte-identical to today's.
 */
export function renderBackgroundMediaLayer(
  value: BackgroundMediaProps | null | undefined,
  nodeId: string,
): ReactNode {
  const resolved = resolveBackgroundMedia(value);
  if (!resolved) return null;

  const wrapperStyle = {
    "--bn-bg-overlay": String(resolved.overlayOpacity),
    "--bn-bg-overlay-color": resolved.overlayColor,
    ...(resolved.source === "slideshow"
      ? { "--bn-bg-slide-fade": `${resolved.fadeMs}ms` }
      : null),
  } as CSSProperties;

  return (
    <div
      key={`${nodeId}:bg-media`}
      className="site-builder-bg-media"
      data-bn-bg-media-source={resolved.source}
      {...(resolved.posterUrl ? { "data-bn-bg-poster": "" } : {})}
      aria-hidden="true"
      style={wrapperStyle}
    >
      {resolved.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- decorative background still; the optimizer's remotePatterns would 400 on i.ytimg.com and on tenant storage hosts.
        <img
          className="site-builder-bg-media__poster"
          src={resolved.posterUrl}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          style={{ objectPosition: resolved.focalPoint }}
        />
      ) : null}
      {resolved.source === "slideshow" ? (
        <BackgroundSlideshow
          nodeId={nodeId}
          slides={resolved.slides}
          intervalMs={resolved.intervalMs}
        />
      ) : resolved.source === "upload" ? (
        <video
          className="site-builder-bg-media__video"
          src={resolved.url}
          poster={resolved.posterUrl ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          tabIndex={-1}
          aria-hidden="true"
          style={{ objectPosition: resolved.focalPoint }}
        />
      ) : (
        <iframe
          className="site-builder-bg-media__frame"
          src={resolved.url}
          // An empty title plus aria-hidden is the correct pairing for a purely
          // decorative frame: a NAMED frame would be announced as content.
          title=""
          aria-hidden="true"
          tabIndex={-1}
          loading="lazy"
          sandbox={YOUTUBE_SANDBOX}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      <span className="site-builder-bg-media__scrim" />
    </div>
  );
}
