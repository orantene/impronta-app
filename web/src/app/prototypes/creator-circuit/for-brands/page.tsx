import Link from "next/link";

import { Eyebrow } from "../_components/Eyebrow";
import { IconArrowRight, IconCheck, useCaseIcon } from "../_components/icons";
import { Reveal } from "../_components/Reveal";
import { USE_CASES } from "../_data/campaigns";
import { BASE, CTA_PRIMARY, CTA_SECONDARY } from "../_data/nav";

export const metadata = {
  title: "For Brands & Agencies",
  description:
    "Curated creator discovery, media-kit-first profiles, and campaign-ready workflow for growth, brand, and social teams.",
};

const SOURCING_STEPS = [
  {
    num: "01",
    title: "Share the brief.",
    copy: "Brand, product, campaign type, target market, audience size, and any non-negotiables. We parse it into a shortlist brief in under an hour.",
  },
  {
    num: "02",
    title: "Get a shortlist in 48 hours.",
    copy: "8–12 curated creators with rates, availability, deliverable fit, audience breakdowns, and side-by-side comparison — ready to share with your team.",
  },
  {
    num: "03",
    title: "Book directly in-platform.",
    copy: "No back-and-forth DMs. Confirm creator, scope, timeline, and paperwork in a single thread per booking.",
  },
  {
    num: "04",
    title: "Measure and iterate.",
    copy: "Post-campaign recap by default — reach, engagement, CTR, conversions where trackable. Feeds the next brief automatically.",
  },
];

const QUALITY_PRINCIPLES = [
  {
    title: "Authentic engagement.",
    copy: "Every creator is vetted for real-audience engagement, not inflated follower counts or pods.",
  },
  {
    title: "On-brand craft.",
    copy: "Portfolios reviewed for content quality, brand safety, and editorial alignment before they reach our roster.",
  },
  {
    title: "Reliable delivery.",
    copy: "Track record of on-time, on-brief output. The creators who make shortlists are the ones who show up.",
  },
  {
    title: "Rate transparency.",
    copy: "Starting rates surfaced by default. No pricing games, no 3-week negotiation loops.",
  },
];

const SPEED_BLOCKS = [
  { metric: "48h", label: "From brief to shortlist" },
  { metric: "7–14d", label: "Typical UGC delivery window" },
  { metric: "1 thread", label: "Per booking — no DM chains" },
  { metric: "30d", label: "Post-campaign recap delivered" },
];

export default function ForBrandsPage() {
  return (
    <>
      {/* Hero */}
      <section
        style={{
          paddingTop: 140,
          paddingBottom: "clamp(72px, 9vw, 128px)",
          background:
            "radial-gradient(80% 60% at 20% 0%, rgba(124, 58, 237, 0.06), transparent), radial-gradient(80% 60% at 90% 10%, rgba(56, 189, 248, 0.07), transparent)",
        }}
      >
        <div className="cc-shell">
          <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 20 }}>
            <Reveal>
              <Eyebrow tone="accent">For Brands &amp; Agencies</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h1
                className="cc-section-title"
                style={{ fontSize: "clamp(44px, 6vw, 88px)" }}
              >
                Creator sourcing — <em>without the DM chaos</em>.
              </h1>
            </Reveal>
            <Reveal delay={2}>
              <p
                style={{
                  fontSize: 19,
                  lineHeight: 1.55,
                  color: "var(--cc-muted)",
                  maxWidth: 620,
                }}
              >
                Built for growth, brand, and social teams who need campaign-ready creators
                and a workflow that doesn&apos;t live in spreadsheets and Slack DMs.
              </p>
            </Reveal>
            <Reveal delay={3}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                <Link href={CTA_PRIMARY.href} className="cc-btn cc-btn--primary cc-btn--lg">
                  {CTA_PRIMARY.label}
                  <IconArrowRight className="cc-btn__arrow" size={16} />
                </Link>
                <Link href={`${BASE}/creators`} className="cc-btn cc-btn--outline cc-btn--lg">
                  Browse the roster
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* How sourcing works */}
      <section className="cc-section">
        <div className="cc-shell">
          <div className="cc-section-head">
            <Reveal>
              <Eyebrow>How it works</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h2 className="cc-section-title">
                From brief to live campaign in <em>under two weeks</em>.
              </h2>
            </Reveal>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            {SOURCING_STEPS.map((s, i) => (
              <Reveal key={s.num} delay={(i % 4) as 0 | 1 | 2 | 3}>
                <article
                  style={{
                    background: "var(--cc-surface)",
                    border: "1px solid var(--cc-line)",
                    borderRadius: "var(--cc-radius-lg)",
                    padding: "28px 24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    height: "100%",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--cc-font-display)",
                      fontSize: 44,
                      fontWeight: 600,
                      color: "var(--cc-violet)",
                      letterSpacing: "-0.04em",
                      lineHeight: 1,
                    }}
                  >
                    {s.num}
                  </span>
                  <h3 style={{ fontSize: 20, letterSpacing: "-0.02em" }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: "var(--cc-muted)", lineHeight: 1.55 }}>
                    {s.copy}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Campaign types */}
      <section className="cc-section" style={{ background: "var(--cc-surface-warm)" }}>
        <div className="cc-shell">
          <div className="cc-section-head">
            <Reveal>
              <Eyebrow tone="accent">Campaign types</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h2 className="cc-section-title">
                Every shape of creator work — <em>one roster</em>.
              </h2>
            </Reveal>
            <Reveal delay={2}>
              <p className="cc-section-sub">
                Whether you need 20 UGC variants for Meta or a single celebrity-tier launch
                post, we route the brief to the creators who actually deliver that craft.
              </p>
            </Reveal>
          </div>

          <div className="cc-grid-use-cases">
            {USE_CASES.map((uc, i) => (
              <Reveal key={uc.key} delay={(i % 3) as 0 | 1 | 2}>
                <article className="cc-use-case">
                  <div
                    className="cc-use-case__icon"
                    style={{
                      background:
                        uc.tint === "violet"
                          ? "var(--cc-violet-soft)"
                          : uc.tint === "coral"
                            ? "var(--cc-coral-soft)"
                            : uc.tint === "lime"
                              ? "var(--cc-lime-soft)"
                              : uc.tint === "sky"
                                ? "var(--cc-sky-soft)"
                                : "var(--cc-surface)",
                      color:
                        uc.tint === "violet"
                          ? "var(--cc-violet-deep)"
                          : uc.tint === "coral"
                            ? "#881337"
                            : uc.tint === "lime"
                              ? "#365314"
                              : uc.tint === "sky"
                                ? "#075985"
                                : "var(--cc-ink)",
                    }}
                  >
                    {useCaseIcon(uc.iconKey, 22)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <h3 style={{ fontSize: 20, letterSpacing: "-0.02em" }}>{uc.title}</h3>
                    <p style={{ fontSize: 14, color: "var(--cc-muted)", lineHeight: 1.5 }}>
                      {uc.copy}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Quality & curation */}
      <section className="cc-section">
        <div className="cc-shell">
          <div className="cc-split-2up">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Reveal>
                <Eyebrow>Curation standard</Eyebrow>
              </Reveal>
              <Reveal delay={1}>
                <h2 className="cc-section-title" style={{ fontSize: "clamp(32px, 4vw, 52px)" }}>
                  Every creator <em>earned</em> their spot on this roster.
                </h2>
              </Reveal>
              <Reveal delay={2}>
                <p style={{ fontSize: 15, color: "var(--cc-muted)", lineHeight: 1.6 }}>
                  We&apos;re not a self-serve creator database. We&apos;re a curated network —
                  applications reviewed, portfolios screened, rates verified, and every
                  campaign fed back into the system.
                </p>
              </Reveal>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {QUALITY_PRINCIPLES.map((p, i) => (
                <Reveal key={p.title} delay={(i % 4) as 0 | 1 | 2 | 3}>
                  <article
                    style={{
                      background: "var(--cc-surface)",
                      border: "1px solid var(--cc-line)",
                      borderRadius: "var(--cc-radius-lg)",
                      padding: "24px 28px",
                      display: "flex",
                      gap: 18,
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        background: "var(--cc-lime-soft)",
                        color: "#365314",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <IconCheck size={18} />
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <h3 style={{ fontSize: 19, letterSpacing: "-0.02em" }}>{p.title}</h3>
                      <p style={{ fontSize: 14.5, color: "var(--cc-muted)", lineHeight: 1.55 }}>
                        {p.copy}
                      </p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Speed / workflow */}
      <section
        className="cc-section"
        style={{
          background: "var(--cc-ink)",
          color: "var(--cc-canvas)",
        }}
      >
        <div className="cc-shell">
          <div className="cc-section-head">
            <Reveal>
              <Eyebrow tone="light">Speed &amp; workflow</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h2
                className="cc-section-title"
                style={{ color: "var(--cc-canvas)" }}
              >
                Designed for teams that ship fast.
              </h2>
            </Reveal>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            {SPEED_BLOCKS.map((b, i) => (
              <Reveal key={b.label} delay={(i % 4) as 0 | 1 | 2 | 3}>
                <div
                  style={{
                    background: "rgba(250, 250, 248, 0.04)",
                    border: "1px solid rgba(250, 250, 248, 0.1)",
                    borderRadius: "var(--cc-radius-lg)",
                    padding: "32px 28px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    minHeight: 180,
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--cc-font-display)",
                      fontSize: "clamp(44px, 5vw, 64px)",
                      fontWeight: 600,
                      letterSpacing: "-0.04em",
                      lineHeight: 1,
                      background:
                        i % 2 === 0
                          ? "linear-gradient(135deg, #a3e635 0%, #38bdf8 100%)"
                          : "linear-gradient(135deg, #fb7185 0%, #a3e635 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    {b.metric}
                  </span>
                  <span style={{ fontSize: 14, color: "rgba(250, 250, 248, 0.68)" }}>
                    {b.label}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="cc-section">
        <div className="cc-shell">
          <Reveal>
            <div className="cc-final-cta">
              <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 660 }}>
                <h2
                  style={{
                    fontFamily: "var(--cc-font-display)",
                    fontSize: "clamp(32px, 4vw, 52px)",
                    fontWeight: 600,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.04,
                    color: "var(--cc-canvas)",
                  }}
                >
                  Got a campaign on the horizon?
                </h2>
                <p
                  style={{
                    fontSize: 16,
                    lineHeight: 1.55,
                    color: "rgba(250, 250, 248, 0.78)",
                  }}
                >
                  Send us a brief — a shortlist hits your inbox in 48 hours. No pressure, no
                  retainer, no long intro call.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
                  <Link href={CTA_PRIMARY.href} className="cc-btn cc-btn--light cc-btn--lg">
                    {CTA_PRIMARY.label}
                    <IconArrowRight className="cc-btn__arrow" size={16} />
                  </Link>
                  <Link
                    href={CTA_SECONDARY.href}
                    className="cc-btn cc-btn--lg"
                    style={{
                      background: "transparent",
                      color: "var(--cc-canvas)",
                      border: "1px solid rgba(250, 250, 248, 0.28)",
                    }}
                  >
                    {CTA_SECONDARY.label}
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
