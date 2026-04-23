import Link from "next/link";

import { Eyebrow } from "../_components/Eyebrow";
import { IconArrowRight } from "../_components/icons";
import { Reveal } from "../_components/Reveal";
import { CTA_PRIMARY, CTA_SECONDARY } from "../_data/nav";

export const metadata = {
  title: "About",
  description:
    "Creator Circuit is a curated creator discovery platform — modern, premium, built for both brands and creators.",
};

const PRINCIPLES = [
  {
    num: "I",
    title: "Curation beats scale.",
    copy: "A smaller, better-vetted roster outperforms a million-creator marketplace every time. Fit drives performance — not volume.",
  },
  {
    num: "II",
    title: "Creators aren't inventory.",
    copy: "Every creator on this platform chose to be here. We route briefs they'll actually want, on terms they'll actually accept.",
  },
  {
    num: "III",
    title: "Briefs beat vibes.",
    copy: "The more structure a brief has, the better the shortlist. We translate fuzzy goals into executable specs — and the results compound.",
  },
  {
    num: "IV",
    title: "Measure or move on.",
    copy: "Every campaign closes with a recap. Reach, engagement, CTR, conversions where we can track them. Next brief starts with last brief's data.",
  },
  {
    num: "V",
    title: "Craft matters.",
    copy: "Good creators treat this like a craft. We reward that — with better briefs, clearer rates, and brands who actually appreciate the work.",
  },
  {
    num: "VI",
    title: "Built for the long game.",
    copy: "The best creator–brand relationships last years, not weeks. We design for the second, third, and tenth booking — not just the first.",
  },
];

const STATS = [
  { value: "320+", label: "Creators in the network" },
  { value: "48h", label: "Average brief → shortlist" },
  { value: "12", label: "Niches we curate across" },
  { value: "2021", label: "Founded, quietly" },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section
        style={{
          paddingTop: 140,
          paddingBottom: "clamp(72px, 9vw, 128px)",
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(124, 58, 237, 0.08), transparent)",
        }}
      >
        <div className="cc-shell">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
              maxWidth: 920,
              margin: "0 auto",
              textAlign: "center",
              alignItems: "center",
            }}
          >
            <Reveal>
              <Eyebrow tone="accent">About Creator Circuit</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h1
                className="cc-section-title"
                style={{ fontSize: "clamp(44px, 6vw, 96px)" }}
              >
                Modern creator discovery, <em>built the way it should&apos;ve been</em>.
              </h1>
            </Reveal>
            <Reveal delay={2}>
              <p
                style={{
                  fontSize: 19,
                  lineHeight: 1.55,
                  color: "var(--cc-muted)",
                  maxWidth: 680,
                }}
              >
                Random DM outreach is broken. Creator databases are noisy. Agencies are
                slow. Creator Circuit is what happens when you rebuild the whole thing
                around actual campaign outcomes.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Manifesto */}
      <section className="cc-section">
        <div className="cc-shell--narrow">
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <Reveal>
              <Eyebrow>The thesis</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h2
                style={{
                  fontFamily: "var(--cc-font-display)",
                  fontSize: "clamp(28px, 3.6vw, 44px)",
                  fontWeight: 500,
                  letterSpacing: "-0.024em",
                  lineHeight: 1.22,
                  color: "var(--cc-ink)",
                }}
              >
                The creator economy grew into a ten-figure channel without a single piece
                of infrastructure that actually matches it. Brands run million-dollar
                campaigns out of{" "}
                <span
                  style={{
                    background: "linear-gradient(135deg, #7c3aed 0%, #fb7185 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  spreadsheets and DMs
                </span>
                . Creators juggle pitches in inbox chaos. Everyone deserves better.
              </h2>
            </Reveal>
            <Reveal delay={2}>
              <p
                style={{
                  fontSize: 17,
                  color: "var(--cc-muted)",
                  lineHeight: 1.7,
                }}
              >
                Creator Circuit started from one question: what if creator sourcing worked
                like a great casting director — curated, fast, and obsessed with fit? That
                question turned into a platform, then a roster, then a workflow, then a
                reporting layer. Today, brands send briefs and get shortlists in under 48
                hours. Creators show up to briefs that match their craft, their niche, and
                their rate card.
              </p>
            </Reveal>
            <Reveal delay={3}>
              <p
                style={{
                  fontSize: 17,
                  color: "var(--cc-muted)",
                  lineHeight: 1.7,
                }}
              >
                We&apos;re deliberately small. The roster is invite-first. The briefs are
                personally reviewed. We&apos;ll never chase a million creators or an open
                marketplace model — because we&apos;ve watched that model commoditize both
                sides of the table. Instead, we&apos;re building the version of this
                category that&apos;s premium for brands, respectful of creators, and
                transparent about outcomes.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section
        className="cc-section"
        style={{ background: "var(--cc-surface-warm)" }}
      >
        <div className="cc-shell">
          <div className="cc-section-head">
            <Reveal>
              <Eyebrow tone="accent">How we operate</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h2 className="cc-section-title">
                Six principles that shape every decision.
              </h2>
            </Reveal>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 14,
            }}
          >
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.num} delay={(i % 3) as 0 | 1 | 2}>
                <article
                  style={{
                    background: "var(--cc-surface)",
                    border: "1px solid var(--cc-line)",
                    borderRadius: "var(--cc-radius-lg)",
                    padding: "28px 26px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    height: "100%",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--cc-font-display)",
                      fontSize: 28,
                      fontWeight: 600,
                      color: "var(--cc-coral)",
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                    }}
                  >
                    {p.num}
                  </span>
                  <h3 style={{ fontSize: 20, letterSpacing: "-0.02em" }}>{p.title}</h3>
                  <p
                    style={{
                      fontSize: 14.5,
                      color: "var(--cc-muted)",
                      lineHeight: 1.6,
                    }}
                  >
                    {p.copy}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="cc-section">
        <div className="cc-shell">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 0,
              borderTop: "1px solid var(--cc-line)",
              borderBottom: "1px solid var(--cc-line)",
            }}
          >
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={(i % 4) as 0 | 1 | 2 | 3}>
                <div
                  style={{
                    padding: "40px 28px",
                    borderRight:
                      i < STATS.length - 1 ? "1px solid var(--cc-line)" : "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--cc-font-display)",
                      fontSize: "clamp(40px, 4.5vw, 56px)",
                      fontWeight: 600,
                      letterSpacing: "-0.04em",
                      lineHeight: 1,
                      color: "var(--cc-ink)",
                    }}
                  >
                    {s.value}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--cc-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      fontWeight: 600,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Founder note */}
      <section className="cc-section">
        <div className="cc-shell">
          <div className="cc-split-2up cc-split-2up--founder">
            <div
              style={{
                position: "relative",
                borderRadius: "var(--cc-radius-lg)",
                overflow: "hidden",
                aspectRatio: "4 / 5",
                background: "var(--cc-surface-warm)",
              }}
            >
              <img
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=900&q=80"
                alt="Creator Circuit founder at work"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <Reveal>
                <Eyebrow>A note from the founder</Eyebrow>
              </Reveal>
              <Reveal delay={1}>
                <h2
                  className="cc-section-title"
                  style={{ fontSize: "clamp(28px, 3.4vw, 42px)" }}
                >
                  The quickest test of a creator platform: would I use it?
                </h2>
              </Reveal>
              <Reveal delay={2}>
                <p
                  style={{
                    fontSize: 16,
                    lineHeight: 1.7,
                    color: "var(--cc-muted)",
                  }}
                >
                  I spent five years running growth at consumer brands and, before that,
                  five years as a working creator. Both sides of the table were equally
                  frustrated — and for the same reason. The tools didn&apos;t match the
                  work.
                </p>
              </Reveal>
              <Reveal delay={3}>
                <p
                  style={{
                    fontSize: 16,
                    lineHeight: 1.7,
                    color: "var(--cc-muted)",
                  }}
                >
                  Creator Circuit is the platform I wanted as a brand marketer and the
                  inbox I wanted as a creator. Curated. Transparent. Fast. Built around the
                  campaigns that actually make careers and categories — not the noise in
                  between.
                </p>
              </Reveal>
              <Reveal delay={4}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    marginTop: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--cc-font-display)",
                      fontSize: 20,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    Elena Rivera
                  </span>
                  <span style={{ fontSize: 13, color: "var(--cc-muted)" }}>
                    Founder &amp; CEO, Creator Circuit
                  </span>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* CTA split */}
      <section className="cc-section">
        <div className="cc-shell">
          <Reveal>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: 14,
              }}
            >
              <div
                style={{
                  background: "var(--cc-ink)",
                  color: "var(--cc-canvas)",
                  borderRadius: "var(--cc-radius-xl)",
                  padding: "clamp(40px, 5vw, 64px)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--cc-font-display)",
                    fontSize: "clamp(26px, 3vw, 36px)",
                    fontWeight: 600,
                    letterSpacing: "-0.028em",
                    lineHeight: 1.1,
                    color: "var(--cc-canvas)",
                  }}
                >
                  Brand team? Start with a brief.
                </span>
                <p
                  style={{
                    fontSize: 14,
                    color: "rgba(250, 250, 248, 0.72)",
                    lineHeight: 1.55,
                  }}
                >
                  48-hour shortlist. No commitment.
                </p>
                <Link
                  href={CTA_PRIMARY.href}
                  className="cc-btn cc-btn--light cc-btn--sm"
                  style={{ alignSelf: "flex-start" }}
                >
                  {CTA_PRIMARY.label}
                  <IconArrowRight className="cc-btn__arrow" size={14} />
                </Link>
              </div>

              <div
                style={{
                  background: "var(--cc-violet)",
                  color: "var(--cc-canvas)",
                  borderRadius: "var(--cc-radius-xl)",
                  padding: "clamp(40px, 5vw, 64px)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--cc-font-display)",
                    fontSize: "clamp(26px, 3vw, 36px)",
                    fontWeight: 600,
                    letterSpacing: "-0.028em",
                    lineHeight: 1.1,
                    color: "var(--cc-canvas)",
                  }}
                >
                  Creator? Apply to the roster.
                </span>
                <p
                  style={{
                    fontSize: 14,
                    color: "rgba(250, 250, 248, 0.82)",
                    lineHeight: 1.55,
                  }}
                >
                  Invite-first. Personally reviewed. Two-week reply window.
                </p>
                <Link
                  href={CTA_SECONDARY.href}
                  className="cc-btn cc-btn--light cc-btn--sm"
                  style={{ alignSelf: "flex-start" }}
                >
                  {CTA_SECONDARY.label}
                  <IconArrowRight className="cc-btn__arrow" size={14} />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
