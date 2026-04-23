import Link from "next/link";

import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

/**
 * Full-bleed editorial hero.
 *
 * Future systemization (CMS → Hero Section Variants):
 *   - `fullbleed-editorial` (this one): image, dark gradient, serif, 2 CTAs.
 *   - `split-portrait`: half-image / half-copy for interior pages.
 *   - `slider-lifestyle`: multi-image crossfade with pause control.
 *   - `video-ambient`: silent video loop with poster fallback.
 *
 * CMS field model:
 *   - variant, eyebrow, headline, subhead, media.src, media.focal_point,
 *     overlay_strength (0–1), primary_cta, secondary_cta, trust_strip[]?
 */

type HeroCTA = { label: string; href: string };

export function SectionHero({
  eyebrow,
  headline,
  subhead,
  image,
  primary,
  secondary,
  overlay = 0.45,
  align = "left",
  compact = false,
}: {
  eyebrow: string;
  headline: React.ReactNode;
  subhead?: React.ReactNode;
  image: string;
  primary?: HeroCTA;
  secondary?: HeroCTA;
  overlay?: number;
  align?: "left" | "center";
  compact?: boolean;
}) {
  return (
    <section
      style={{
        position: "relative",
        minHeight: compact ? "64vh" : "92vh",
        display: "flex",
        alignItems: "flex-end",
        paddingTop: 140,
        paddingBottom: compact ? 64 : 120,
        overflow: "hidden",
        color: "var(--muse-ivory)",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
        }}
      >
        <img
          src={image}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, rgba(42,34,30,${overlay * 0.55}) 0%, rgba(42,34,30,${overlay * 0.25}) 40%, rgba(42,34,30,${overlay * 0.92}) 100%)`,
          }}
        />
      </div>

      <div className="muse-shell" style={{ position: "relative", zIndex: 2 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: align === "center" ? "center" : "flex-start",
            textAlign: align === "center" ? "center" : "left",
            gap: 28,
            maxWidth: 820,
            marginLeft: align === "center" ? "auto" : 0,
            marginRight: align === "center" ? "auto" : 0,
          }}
        >
          <Reveal>
            <Eyebrow tone="light">{eyebrow}</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h1
              style={{
                color: "var(--muse-ivory)",
                fontSize: compact ? "clamp(42px, 5.8vw, 72px)" : "clamp(46px, 7vw, 96px)",
                lineHeight: 1.02,
                letterSpacing: "-0.018em",
                fontWeight: 400,
                maxWidth: 720,
              }}
            >
              {headline}
            </h1>
          </Reveal>
          {subhead ? (
            <Reveal delay={2}>
              <p
                style={{
                  color: "rgba(246,241,234,0.86)",
                  fontSize: "clamp(16px, 1.3vw, 19px)",
                  lineHeight: 1.55,
                  maxWidth: 560,
                }}
              >
                {subhead}
              </p>
            </Reveal>
          ) : null}
          {(primary || secondary) && (
            <Reveal delay={3}>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {primary ? (
                  <Link href={primary.href} className="muse-btn muse-btn--light">
                    {primary.label}
                  </Link>
                ) : null}
                {secondary ? (
                  <Link
                    href={secondary.href}
                    className="muse-btn muse-btn--outline-light"
                  >
                    {secondary.label}
                  </Link>
                ) : null}
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}
