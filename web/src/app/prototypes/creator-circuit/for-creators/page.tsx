import Link from "next/link";

import { Eyebrow } from "../_components/Eyebrow";
import { IconArrowRight, IconCheck, IconStar } from "../_components/icons";
import { Reveal } from "../_components/Reveal";
import { BASE, CTA_SECONDARY } from "../_data/nav";

export const metadata = {
  title: "For Creators",
  description:
    "A curated, invite-first roster for creators who want premium campaigns, clean briefs, and actual follow-through.",
};

const WHY_JOIN = [
  {
    title: "Campaigns that match your craft.",
    copy: "No spray-and-pray DM outreach. We only route briefs to creators whose niche, platform, and content style actually fit.",
  },
  {
    title: "Clean briefs, confirmed budgets.",
    copy: "Every brief arrives with scope, timeline, deliverables, and rate already locked. You say yes or no — no negotiation loops.",
  },
  {
    title: "Premium brands, real paydays.",
    copy: "Our brand roster skips the $100-product-swap pitches. Typical engagements start at $1.5K and scale well into 5 figures for larger drops.",
  },
  {
    title: "Less admin, more content.",
    copy: "We handle the sourcing, contracts, scheduling, revisions, and reporting. You handle the work you actually signed up for.",
  },
  {
    title: "Rep-grade profile.",
    copy: "Your Creator Circuit profile doubles as a media kit — stats, samples, deliverables, rates — shareable with any brand, in or out of platform.",
  },
  {
    title: "Performance feedback loop.",
    copy: "Post-campaign data flows back to you. Know what hooked, what converted, what brands want more of — and price accordingly.",
  },
];

const FIT_CRITERIA = [
  {
    label: "UGC Creators",
    copy: "Strong hooks, fast turnaround, portfolio of performance-ready paid ad content.",
  },
  {
    label: "Influencers & Talent",
    copy: "Real engaged audience of 25K+ (platform-relevant), authentic niche, premium brand-fit.",
  },
  {
    label: "Hybrid Creators",
    copy: "Equally sharp on organic posts and paid UGC — the rarest and fastest-growing category.",
  },
  {
    label: "Niche Specialists",
    copy: "Travel, food, wellness, beauty, tech, parenting, lifestyle — depth beats breadth here.",
  },
];

const EARNINGS_ROWS = [
  { tier: "UGC pack (6 variants)", range: "$1.5K – $4K" },
  { tier: "Single sponsored post", range: "$2K – $12K" },
  { tier: "Launch campaign (multi-post)", range: "$5K – $40K" },
  { tier: "Hospitality / travel partnership", range: "$3K – $25K + stay" },
  { tier: "Ambassador / usage-rights packages", range: "Custom + monthly retainer" },
];

export default function ForCreatorsPage() {
  return (
    <>
      {/* Hero */}
      <section
        style={{
          paddingTop: 140,
          paddingBottom: "clamp(72px, 9vw, 128px)",
          background:
            "radial-gradient(70% 55% at 80% 0%, rgba(251, 113, 133, 0.1), transparent), radial-gradient(60% 55% at 10% 20%, rgba(163, 230, 53, 0.1), transparent)",
        }}
      >
        <div className="cc-shell">
          <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 20 }}>
            <Reveal>
              <Eyebrow tone="accent">For Creators</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h1
                className="cc-section-title"
                style={{ fontSize: "clamp(44px, 6vw, 88px)" }}
              >
                Campaigns <em>worth</em> saying yes to.
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
                Creator Circuit is invite-first. We bring you premium brand briefs — with
                clean scope, real budgets, and actual follow-through — so you can focus on
                making the work.
              </p>
            </Reveal>
            <Reveal delay={3}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                <Link href={CTA_SECONDARY.href} className="cc-btn cc-btn--violet cc-btn--lg">
                  Apply to the roster
                  <IconArrowRight className="cc-btn__arrow" size={16} />
                </Link>
                <Link href={`${BASE}/creators`} className="cc-btn cc-btn--outline cc-btn--lg">
                  See current creators
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Why join */}
      <section className="cc-section">
        <div className="cc-shell">
          <div className="cc-section-head">
            <Reveal>
              <Eyebrow>Why creators join</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h2 className="cc-section-title">
                Built to be <em>the best inbox</em> in your week.
              </h2>
            </Reveal>
            <Reveal delay={2}>
              <p className="cc-section-sub">
                Most creator platforms are noisy, extractive, or both. Creator Circuit is
                the opposite.
              </p>
            </Reveal>
          </div>

          <div className="cc-grid-benefits">
            {WHY_JOIN.map((b, i) => (
              <Reveal key={b.title} delay={(i % 3) as 0 | 1 | 2}>
                <article className="cc-benefit">
                  <span
                    className="cc-benefit__num"
                    style={{ color: "var(--cc-coral)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <h3 style={{ fontSize: 19, letterSpacing: "-0.02em" }}>{b.title}</h3>
                    <p style={{ fontSize: 14.5, color: "var(--cc-muted)", lineHeight: 1.55 }}>
                      {b.copy}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Who fits */}
      <section
        className="cc-section"
        style={{ background: "var(--cc-surface-warm)" }}
      >
        <div className="cc-shell">
          <div className="cc-section-head">
            <Reveal>
              <Eyebrow tone="accent">Who&apos;s a fit</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h2 className="cc-section-title">
                Creator types we&apos;re actively building around.
              </h2>
            </Reveal>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14,
            }}
          >
            {FIT_CRITERIA.map((f, i) => (
              <Reveal key={f.label} delay={(i % 4) as 0 | 1 | 2 | 3}>
                <article
                  style={{
                    background: "var(--cc-surface)",
                    border: "1px solid var(--cc-line)",
                    borderRadius: "var(--cc-radius-lg)",
                    padding: "26px 24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    height: "100%",
                  }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: "var(--cc-violet-soft)",
                      color: "var(--cc-violet-deep)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <IconStar size={18} />
                  </span>
                  <h3 style={{ fontSize: 19, letterSpacing: "-0.02em" }}>{f.label}</h3>
                  <p style={{ fontSize: 14, color: "var(--cc-muted)", lineHeight: 1.55 }}>
                    {f.copy}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal delay={2}>
            <p
              style={{
                fontSize: 14,
                color: "var(--cc-muted)",
                marginTop: 32,
                fontStyle: "italic",
                maxWidth: 640,
              }}
            >
              We say no to a lot of applications — not because the creators aren&apos;t
              great, but because curation is the product. If the roster fills with
              everyone, no brief gets the right shortlist.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Earnings ranges */}
      <section className="cc-section">
        <div className="cc-shell">
          <div className="cc-split-2up">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Reveal>
                <Eyebrow>Real ranges</Eyebrow>
              </Reveal>
              <Reveal delay={1}>
                <h2 className="cc-section-title" style={{ fontSize: "clamp(32px, 4vw, 52px)" }}>
                  What campaigns actually pay.
                </h2>
              </Reveal>
              <Reveal delay={2}>
                <p style={{ fontSize: 15, color: "var(--cc-muted)", lineHeight: 1.6 }}>
                  Ballpark ranges for Creator Circuit bookings. Final rates depend on your
                  niche, audience size, and campaign scope — but the floor is real.
                </p>
              </Reveal>
            </div>

            <div
              style={{
                background: "var(--cc-surface)",
                border: "1px solid var(--cc-line)",
                borderRadius: "var(--cc-radius-lg)",
                overflow: "hidden",
              }}
            >
              {EARNINGS_ROWS.map((row, i) => (
                <Reveal key={row.tier} delay={(i % 3) as 0 | 1 | 2}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "22px 28px",
                      borderBottom:
                        i < EARNINGS_ROWS.length - 1
                          ? "1px solid var(--cc-line)"
                          : "none",
                      gap: 16,
                    }}
                  >
                    <span
                      style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.01em" }}
                    >
                      {row.tier}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--cc-font-display)",
                        fontSize: 18,
                        fontWeight: 600,
                        color: "var(--cc-violet-deep)",
                        letterSpacing: "-0.02em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.range}
                    </span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What brands want */}
      <section
        className="cc-section"
        style={{ background: "var(--cc-ink)", color: "var(--cc-canvas)" }}
      >
        <div className="cc-shell">
          <div className="cc-section-head">
            <Reveal>
              <Eyebrow tone="light">What brands want</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h2
                className="cc-section-title"
                style={{ color: "var(--cc-canvas)" }}
              >
                The strongest applications <em>always</em> have these.
              </h2>
            </Reveal>
          </div>

          <ul
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 12,
              padding: 0,
              margin: 0,
              listStyle: "none",
            }}
          >
            {[
              "A clear niche. Not every topic — one or two you own.",
              "Portfolio link with 3–5 paid brand collaborations (UGC counts).",
              "Platform-native craft — hooks for TikTok, cover for YouTube, aesthetic for Pinterest.",
              "Response time under 48 hours on incoming briefs.",
              "Reliable deliverables — on time, on brief, revision-ready.",
              "A rate card. Even a rough one. No creator with real experience says \"whatever you think.\"",
            ].map((item, i) => (
              <Reveal key={item} delay={(i % 3) as 0 | 1 | 2}>
                <li
                  style={{
                    background: "rgba(250, 250, 248, 0.04)",
                    border: "1px solid rgba(250, 250, 248, 0.1)",
                    borderRadius: "var(--cc-radius-lg)",
                    padding: "22px 24px",
                    display: "flex",
                    gap: 14,
                    alignItems: "flex-start",
                    height: "100%",
                  }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: "var(--cc-lime)",
                      color: "var(--cc-ink)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconCheck size={16} />
                  </span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.55 }}>{item}</span>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* Apply CTA */}
      <section className="cc-section">
        <div className="cc-shell">
          <Reveal>
            <div
              style={{
                background: "var(--cc-violet)",
                color: "var(--cc-canvas)",
                borderRadius: "var(--cc-radius-xl)",
                padding: "clamp(48px, 6vw, 88px) clamp(32px, 5vw, 72px)",
                display: "flex",
                flexDirection: "column",
                gap: 20,
                alignItems: "flex-start",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: -80,
                  right: -60,
                  width: 320,
                  height: 320,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(163, 230, 53, 0.32) 0%, transparent 60%)",
                  pointerEvents: "none",
                }}
              />
              <span
                className="cc-chip"
                style={{
                  background: "rgba(250, 250, 248, 0.14)",
                  color: "var(--cc-canvas)",
                  borderColor: "transparent",
                  position: "relative",
                }}
              >
                Applications reviewed weekly
              </span>
              <h2
                style={{
                  fontFamily: "var(--cc-font-display)",
                  fontSize: "clamp(36px, 5vw, 64px)",
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.02,
                  color: "var(--cc-canvas)",
                  maxWidth: 700,
                  position: "relative",
                }}
              >
                Think you&apos;re a fit? Tell us about your work.
              </h2>
              <p
                style={{
                  fontSize: 17,
                  lineHeight: 1.55,
                  color: "rgba(250, 250, 248, 0.86)",
                  maxWidth: 540,
                  position: "relative",
                }}
              >
                Takes five minutes. We review every application personally and respond
                within two weeks — yes, no, or let&apos;s stay in touch.
              </p>
              <div style={{ position: "relative" }}>
                <Link
                  href={`${BASE}/contact`}
                  className="cc-btn cc-btn--light cc-btn--lg"
                >
                  Start your application
                  <IconArrowRight className="cc-btn__arrow" size={16} />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
