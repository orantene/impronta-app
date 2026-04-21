import { cn } from "@/lib/utils";
import type { MarketingPhoto } from "@/lib/marketing/photography";

type FrameTone = "cream" | "ink" | "forest";
type FrameAspect = "portrait" | "landscape" | "square" | "wide";
type FrameSize = "sm" | "md" | "lg";

const ASPECT_CLASSES: Record<FrameAspect, string> = {
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
  square: "aspect-square",
  wide: "aspect-[16/9]",
};

const RADIUS_BY_SIZE: Record<FrameSize, string> = {
  sm: "rounded-[18px]",
  md: "rounded-[22px]",
  lg: "rounded-[28px]",
};

const FOCAL_MAP: Record<NonNullable<MarketingPhoto["focal"]>, string> = {
  center: "50% 50%",
  top: "50% 28%",
  bottom: "50% 72%",
  "left-center": "28% 50%",
  "right-center": "72% 50%",
};

/**
 * Brand-native photography frame.
 *
 * Every lifestyle image on the marketing site renders through this frame so
 * treatment stays consistent: same rounded corners, same hairline border,
 * same subtle grade layer over the photo, same caption slot. The caller
 * picks the photo (via `MARKETING_PHOTOS`), the tone, the aspect ratio, and
 * the scene-relative size — no image CSS leaks into section code.
 *
 * The grade overlay is intentional: it pulls every photo toward the Rostra
 * palette so a curated Unsplash photo doesn't feel disconnected from the
 * ink/forest/cream system. The overlay is gentle enough to keep skin tones
 * and scenes readable, strong enough to unify disparate source photos.
 */
export function EditorialFrame({
  photo,
  tone = "cream",
  aspect = "landscape",
  size = "md",
  priority = false,
  className,
  caption,
  eyebrow,
}: {
  photo: MarketingPhoto;
  tone?: FrameTone;
  aspect?: FrameAspect;
  size?: FrameSize;
  priority?: boolean;
  className?: string;
  caption?: string;
  eyebrow?: string;
}) {
  const borderColor =
    tone === "ink"
      ? "var(--plt-hairline-inverse-strong, rgba(241,237,227,0.18))"
      : tone === "forest"
        ? "rgba(46,107,82,0.28)"
        : "var(--plt-hairline-strong)";

  const gradeOverlay =
    tone === "ink"
      ? "linear-gradient(180deg, rgba(15,23,20,0.12) 0%, rgba(15,23,20,0.36) 100%)"
      : tone === "forest"
        ? "linear-gradient(180deg, rgba(31,74,58,0.14) 0%, rgba(31,74,58,0.32) 100%)"
        : "linear-gradient(180deg, rgba(245,242,234,0.00) 45%, rgba(15,23,20,0.08) 100%)";

  const shadow =
    tone === "ink"
      ? "0 32px 60px -28px rgba(0,0,0,0.45)"
      : tone === "forest"
        ? "0 32px 64px -28px rgba(31,74,58,0.42)"
        : "0 28px 60px -32px rgba(15,23,20,0.22)";

  return (
    <figure
      className={cn(
        "relative overflow-hidden",
        RADIUS_BY_SIZE[size],
        ASPECT_CLASSES[aspect],
        className,
      )}
      style={{
        border: `1px solid ${borderColor}`,
        boxShadow: shadow,
        background: "var(--plt-bg-deep)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url({ w: 1600, q: 72 })}
        srcSet={[640, 960, 1280, 1600]
          .map((w) => `${photo.url({ w, q: 70 })} ${w}w`)
          .join(", ")}
        sizes="(min-width: 1024px) 40vw, 90vw"
        alt={photo.alt}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: FOCAL_MAP[photo.focal ?? "center"] }}
      />

      {/* Brand grade — unifies disparate photos under the palette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: gradeOverlay }}
      />

      {/* Subtle grain — same texture as the rest of the surface, keeps photos from feeling pasted-in */}
      <div
        aria-hidden
        className="plt-grain pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay"
      />

      {(eyebrow || caption) && (
        <figcaption className="absolute inset-x-4 bottom-4 flex flex-col gap-1 sm:inset-x-5 sm:bottom-5">
          {eyebrow ? (
            <span
              className="plt-mono text-[0.625rem] font-medium uppercase tracking-[0.22em]"
              style={{
                color:
                  tone === "cream"
                    ? "rgba(241,237,227,0.78)"
                    : "rgba(241,237,227,0.82)",
              }}
            >
              {eyebrow}
            </span>
          ) : null}
          {caption ? (
            <span
              className="plt-display text-[0.9375rem] font-medium leading-[1.35] sm:text-[1rem]"
              style={{ color: "rgba(241,237,227,0.96)" }}
            >
              {caption}
            </span>
          ) : null}
        </figcaption>
      )}
    </figure>
  );
}
