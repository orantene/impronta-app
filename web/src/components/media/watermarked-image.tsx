// watermarked-image.tsx
// Renders a talent photo with an agency logo overlay.
//
// Resolution order:
//   1. per-image override  (media_assets.watermark_override_json)
//   2. workspace default   (agencies.settings.branding.watermark_preset)
//   3. no watermark        (either missing or enabled:false)
//
// Usage: server component — pass resolved preset + logo URL from your data
// loader so this stays pure and cache-friendly.
//
// Soft rendering only (CSS overlay). For baked PNG exports use the
// /api/media/bake-watermark route instead.

import Image from "next/image";

// ─── Types ───────────────────────────────────────────────────────────────────

export type WatermarkPosition =
  | "tl" | "tc" | "tr"
  | "ml" | "mc" | "mr"
  | "bl" | "bc" | "br";

export type WatermarkPreset = {
  enabled:     boolean;
  position:    WatermarkPosition;
  /** Logo width as % of image shorter edge. 4–25. */
  size_pct:    number;
  /** 0.0 – 1.0 */
  opacity:     number;
  /** Inset from edge as % of image shorter edge. 0–10. */
  padding_pct: number;
  /** Which logo variant to render. "light" uses logo_url; "dark" uses logo_dark_url. */
  variant:     "light" | "dark";
};

export type WatermarkedImageProps = {
  /** Public URL of the talent photo */
  src:            string;
  alt:            string;
  width:          number;
  height:         number;
  /** Resolved watermark preset (override merged over workspace default). Null = no watermark. */
  preset:         WatermarkPreset | null;
  /** Agency logo URL for the 'light' variant */
  logoUrl:        string | null;
  /** Agency logo URL for the 'dark' variant (falls back to logoUrl) */
  logoDarkUrl?:   string | null;
  className?:     string;
  style?:         React.CSSProperties;
  /** Passed to next/image priority prop */
  priority?:      boolean;
};

// ─── Position → CSS ──────────────────────────────────────────────────────────

function resolvePosition(
  position: WatermarkPosition,
  paddingPct: number,
): React.CSSProperties {
  const p = `${paddingPct}%`;
  const map: Record<WatermarkPosition, React.CSSProperties> = {
    tl: { top: p, left: p },
    tc: { top: p, left: "50%", transform: "translateX(-50%)" },
    tr: { top: p, right: p },
    ml: { top: "50%", left: p, transform: "translateY(-50%)" },
    mc: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
    mr: { top: "50%", right: p, transform: "translateY(-50%)" },
    bl: { bottom: p, left: p },
    bc: { bottom: p, left: "50%", transform: "translateX(-50%)" },
    br: { bottom: p, right: p },
  };
  return map[position];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WatermarkedImage({
  src,
  alt,
  width,
  height,
  preset,
  logoUrl,
  logoDarkUrl,
  className,
  style,
  priority,
}: WatermarkedImageProps) {
  const showWatermark =
    preset?.enabled === true &&
    (logoUrl !== null && logoUrl !== undefined);

  const activeLogo =
    preset?.variant === "dark" && logoDarkUrl ? logoDarkUrl : logoUrl;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        display: "inline-block",
        overflow: "hidden",
        width,
        height,
        ...style,
      }}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
      />

      {showWatermark && preset && activeLogo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeLogo}
          alt="" // decorative — screen readers skip
          aria-hidden
          style={{
            position: "absolute",
            ...resolvePosition(preset.position, preset.padding_pct),
            width: `${preset.size_pct}%`,
            height: "auto",
            opacity: preset.opacity,
            pointerEvents: "none",
            userSelect: "none",
            // Prevent the logo from breaking outside the container
            maxWidth: "40%",
          }}
        />
      )}
    </div>
  );
}
