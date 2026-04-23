import Link from "next/link";

import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

/**
 * Conversion block.
 *
 * CMS → Final CTA Section:
 *   - layout_variant: `centered-overlay` (this one) | `split-image` | `minimal-band`
 *   - background_mode: `image` | `solid` | `gradient`
 *   - primary_cta, secondary_cta
 *   - reassurance_line (optional italic line under CTAs)
 */

export function SectionFinalCTA({
  eyebrow,
  title,
  copy,
  primary,
  secondary,
  image,
  reassurance,
}: {
  eyebrow: string;
  title: React.ReactNode;
  copy: React.ReactNode;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  image: string;
  reassurance?: React.ReactNode;
}) {
  return (
    <section
      style={{
        position: "relative",
        padding: "0",
        color: "var(--muse-ivory)",
      }}
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          margin: "0 auto",
          width: "min(calc(100% - 48px), 1360px)",
          borderRadius: "var(--muse-radius-lg)",
          minHeight: 540,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "clamp(60px, 8vw, 120px) 24px",
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
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(42,34,30,0.35) 0%, rgba(42,34,30,0.6) 100%)",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
            maxWidth: 720,
          }}
        >
          <Reveal>
            <Eyebrow tone="light">{eyebrow}</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h2
              style={{
                color: "var(--muse-ivory)",
                fontSize: "clamp(38px, 5.6vw, 72px)",
                lineHeight: 1.05,
              }}
            >
              {title}
            </h2>
          </Reveal>
          <Reveal delay={2}>
            <p
              style={{
                color: "rgba(246,241,234,0.88)",
                fontSize: 17,
                lineHeight: 1.6,
                maxWidth: 540,
              }}
            >
              {copy}
            </p>
          </Reveal>
          <Reveal delay={3} style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
            <Link href={primary.href} className="muse-btn muse-btn--light">
              {primary.label}
            </Link>
            {secondary ? (
              <Link href={secondary.href} className="muse-btn muse-btn--outline-light">
                {secondary.label}
              </Link>
            ) : null}
          </Reveal>
          {reassurance ? (
            <Reveal
              delay={3}
              style={{
                fontFamily: "var(--muse-font-display)",
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: 17,
                color: "rgba(246,241,234,0.78)",
                marginTop: 6,
              }}
            >
              {reassurance}
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  );
}
