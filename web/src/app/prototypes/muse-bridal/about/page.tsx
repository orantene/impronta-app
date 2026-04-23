import { Eyebrow } from "../_components/Eyebrow";
import { Reveal } from "../_components/Reveal";
import { SectionFinalCTA } from "../_components/SectionFinalCTA";
import { SectionHero } from "../_components/SectionHero";
import { SectionTestimonials } from "../_components/SectionTestimonials";
import { IMAGERY } from "../_data/imagery";
import { TESTIMONIALS } from "../_data/testimonials";

/**
 * About page.
 *
 * Template → `about-editorial` variant. Blocks map to CMS sections:
 *   - `story_block` (founder letter)
 *   - `philosophy_values` (3-up)
 *   - `imagery_band` (triple image rail)
 *   - `press_strip`
 */

const VALUES = [
  {
    label: "Curated, not crowded",
    detail:
      "We invite new members only when the collective needs a new voice. Fewer artists, steadier standards.",
  },
  {
    label: "Composed, not stitched",
    detail:
      "Booking a Muse team means booking artists who already share a visual language — not four strangers on a call sheet.",
  },
  {
    label: "Quiet, not performative",
    detail:
      "We work the way our couples want their day to feel: unhurried, intentional, and human.",
  },
];

const PRESS = [
  "Vogue México",
  "Condé Nast Traveler",
  "Martha Stewart Weddings",
  "Brides",
  "Hola! México",
  "Harper's Bazaar",
];

export default function AboutPage() {
  return (
    <>
      <SectionHero
        eyebrow="About"
        headline={
          <>
            A collective built on{" "}
            <em
              style={{
                fontFamily: "var(--muse-font-display)",
                fontStyle: "italic",
                fontWeight: 300,
                color: "var(--muse-blush)",
              }}
            >
              quiet craft.
            </em>
          </>
        }
        subhead="Muse Bridal Collective was founded to solve one problem — beautiful wedding-day teams that don't communicate. We changed that."
        image={IMAGERY.heroAbout}
        compact
        overlay={0.5}
      />

      {/* ── Story ────────────────────────────────────────────────── */}
      <section className="muse-section" id="philosophy">
        <div className="muse-shell--narrow">
          <div
            style={{
              display: "grid",
              gap: 48,
              gridTemplateColumns: "minmax(0, 200px) minmax(0, 1fr)",
              alignItems: "start",
            }}
          >
            <Reveal>
              <Eyebrow>The story</Eyebrow>
            </Reveal>
            <Reveal delay={1} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <p
                style={{
                  fontFamily: "var(--muse-font-display)",
                  fontSize: "clamp(26px, 3.2vw, 34px)",
                  lineHeight: 1.3,
                  color: "var(--muse-espresso-deep)",
                }}
              >
                We started as three friends — a planner, a photographer, and a
                floral designer — who kept working the same events together. Our
                couples were happier; our days felt calmer; the work was
                better.
              </p>
              <p style={{ fontSize: 17 }}>
                Muse Bridal Collective is the institutional version of that
                discovery. A small, invited roster of makeup artists,
                hairstylists, photographers, videographers, planners, florists,
                content creators and live musicians who know each other, work
                in the same visual key, and can compose an entire wedding-day
                team in one conversation.
              </p>
              <p style={{ fontSize: 17 }}>
                We operate from Tulum, Mexico City, Los Cabos and Valle de
                Guadalupe, and we travel fluently across the Mediterranean and
                the Middle East. Every member is invited by the house and
                reviewed every year.
              </p>
              <p
                style={{
                  fontFamily: "var(--muse-font-display)",
                  fontStyle: "italic",
                  fontWeight: 300,
                  fontSize: 22,
                  color: "var(--muse-blush)",
                }}
              >
                — Elena, Mateo &amp; Florencia
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Imagery band ────────────────────────────────────────── */}
      <section style={{ padding: "0 0 var(--muse-section-y)" }}>
        <div className="muse-shell">
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(3, 1fr)",
            }}
          >
            {[IMAGERY.aboutStudio, IMAGERY.aboutMood, IMAGERY.aboutDetail].map(
              (src, i) => (
                <Reveal
                  key={src + i}
                  delay={(i % 3) as 0 | 1 | 2}
                  style={{
                    aspectRatio: i === 1 ? "3 / 4" : "1 / 1",
                    borderRadius: "var(--muse-radius)",
                    overflow: "hidden",
                    background: "var(--muse-champagne-soft)",
                  }}
                >
                  <img
                    src={src}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </Reveal>
              ),
            )}
          </div>
        </div>
      </section>

      {/* ── Values ──────────────────────────────────────────────── */}
      <section
        className="muse-section"
        style={{ background: "var(--muse-champagne-soft)" }}
      >
        <div className="muse-shell">
          <Reveal style={{ textAlign: "center", marginBottom: 56, maxWidth: 700, marginInline: "auto" }}>
            <Eyebrow>What guides us</Eyebrow>
            <h2 style={{ fontSize: "clamp(36px, 5vw, 58px)", marginTop: 18 }}>
              Three principles our members agree on.
            </h2>
          </Reveal>
          <div
            style={{
              display: "grid",
              gap: 24,
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            {VALUES.map((v, i) => (
              <Reveal
                key={v.label}
                delay={(i % 4) as 0 | 1 | 2 | 3}
                style={{
                  padding: "36px 32px",
                  background: "var(--muse-ivory)",
                  borderRadius: "var(--muse-radius)",
                  border: "1px solid var(--muse-line-soft)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--muse-font-display)",
                    fontStyle: "italic",
                    fontWeight: 300,
                    fontSize: 38,
                    color: "var(--muse-blush)",
                    display: "block",
                    marginBottom: 12,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 style={{ fontSize: 24, marginBottom: 10 }}>{v.label}</h3>
                <p style={{ fontSize: 15 }}>{v.detail}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <SectionTestimonials items={TESTIMONIALS} />

      {/* ── Press strip ─────────────────────────────────────────── */}
      <section
        id="press"
        style={{
          padding: "64px 0",
          borderBlock: "1px solid var(--muse-line-soft)",
          background: "var(--muse-ivory-warm)",
        }}
      >
        <div className="muse-shell">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 40,
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muse-espresso)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "var(--muse-muted)",
              }}
            >
              As seen in
            </span>
            {PRESS.map((name) => (
              <span
                key={name}
                style={{
                  fontFamily: "var(--muse-font-display)",
                  fontStyle: "italic",
                  fontWeight: 300,
                  fontSize: 22,
                  color: "var(--muse-espresso-deep)",
                  opacity: 0.75,
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <SectionFinalCTA
        eyebrow="Join the collective"
        title={
          <>
            Artists &amp; studios —{" "}
            <em
              style={{
                fontFamily: "var(--muse-font-display)",
                fontStyle: "italic",
                fontWeight: 300,
                color: "var(--muse-blush)",
              }}
            >
              we&apos;re listening.
            </em>
          </>
        }
        copy="Invitations are opened twice a year. If your work belongs here, introduce yourself. We read everything."
        primary={{ label: "Apply to join", href: "/prototypes/muse-bridal/contact?intent=apply" }}
        secondary={{ label: "Press inquiries", href: "/prototypes/muse-bridal/contact?intent=press" }}
        image={IMAGERY.heroHome}
      />
    </>
  );
}
