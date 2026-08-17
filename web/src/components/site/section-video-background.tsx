/**
 * section-video-background.tsx — the ONE renderer for a SECTION's video
 * background (`presentation.videoBackground` / `videoPoster` / `videoOverlay`).
 *
 * WHY THIS EXISTS
 * ───────────────
 * Two bugs, both found by reading the two call sites side by side (2026-08-17):
 *
 *   1. `TalentSiteRenderer.tsx` COMPUTED `presentationVideoBackground(...)`,
 *      used the result to set `position:relative; overflow:hidden` on the
 *      wrapper, and then never rendered the video or the overlay. Every talent
 *      storefront silently dropped a background the homepage renderer honored,
 *      and the wrapper style made it look intentional.
 *
 *   2. The doc comment on `presentationVideoBackground` (presentation.ts) has
 *      always claimed "we feature-detect prefers-reduced-motion at runtime;
 *      when the user prefers reduced motion, we fall back to the poster image
 *      and skip the <video> entirely." No such code was ever written. The video
 *      autoplayed for everyone.
 *
 * One component, used by both, fixes both and deletes a duplicated inline-style
 * blob. The reduced-motion rule and the layer geometry live in `globals.css`
 * (loaded by the root layout, so it is present on every surface that can render
 * a section) rather than in a per-call-site `<style>`.
 *
 * NOTE ON UNITS: `videoOverlay` here is a 0-1 FLOAT, unlike the 0-100 int used
 * by `hero`, `cta_banner` and the builder's container `backgroundMedia`. That
 * inconsistency predates this component; it is normalized at this boundary so
 * the CSS never has to care.
 */
import type { CSSProperties } from "react";

import type { VideoBackgroundProps } from "@/lib/site-admin/sections/shared/presentation";

export function SectionVideoBackground({ video }: { video: VideoBackgroundProps }) {
  const src = typeof video.src === "string" ? video.src.trim() : "";
  if (!src) return null;

  const overlay =
    typeof video.overlay === "number"
      ? Math.min(1, Math.max(0, video.overlay))
      : 0;

  const style = {
    "--section-video-overlay": String(overlay),
  } as CSSProperties;

  return (
    <div className="site-section-video-bg" aria-hidden="true" style={style}>
      {video.poster ? (
        // eslint-disable-next-line @next/next/no-img-element -- decorative background still from tenant storage; the optimizer's remotePatterns would 400 on unlisted hosts.
        <img
          className="site-section-video-bg__poster"
          src={video.poster}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <video
        className="site-section-video-bg__video"
        src={src}
        poster={video.poster}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        tabIndex={-1}
        aria-hidden="true"
      />
      {overlay > 0 ? <span className="site-section-video-bg__scrim" /> : null}
    </div>
  );
}
