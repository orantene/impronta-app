import Link from "next/link";
import { notFound } from "next/navigation";

import { CreatorCard } from "../../_components/CreatorCard";
import { Eyebrow } from "../../_components/Eyebrow";
import {
  IconArrowRight,
  IconPin,
  IconPlay,
  platformIcon,
} from "../../_components/icons";
import { Reveal } from "../../_components/Reveal";
import {
  type Creator,
  CREATOR_BY_SLUG,
  CREATORS,
  formatEngagement,
  formatFollowers,
} from "../../_data/creators";
import { BASE, CTA_PRIMARY } from "../../_data/nav";

export function generateStaticParams() {
  return CREATORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const creator = CREATOR_BY_SLUG[slug];
  if (!creator) return {};
  return {
    title: `${creator.name} — ${creator.role}`,
    description: creator.pitch,
  };
}

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const creator = CREATOR_BY_SLUG[slug];
  if (!creator) notFound();

  const related = CREATORS.filter(
    (c) => c.slug !== creator.slug && c.niches.some((n) => creator.niches.includes(n)),
  ).slice(0, 4);

  return (
    <>
      <ProfileHero creator={creator} />
      <ProfileAbout creator={creator} />
      <ProfileSpecialties creator={creator} />
      <ProfileDeliverables creator={creator} />
      <ProfileSamples creator={creator} />
      <ProfileCollaborations creator={creator} />
      <ProfileAudience creator={creator} />
      <ProfileInquiry creator={creator} />
      {related.length > 0 ? <ProfileRelated related={related} /> : null}
    </>
  );
}

function ProfileHero({ creator }: { creator: Creator }) {
  return (
    <section className="cc-profile-hero">
      <div className="cc-shell">
        <Link
          href={`${BASE}/creators`}
          style={{
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--cc-muted)",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 32,
          }}
        >
          ← All creators
        </Link>

        <div className="cc-profile-grid">
          <Reveal>
            <div className="cc-profile-media">
              <img src={creator.portrait} alt={creator.name} />
              <div className="cc-profile-media__chips">
                <span className="cc-creator-card__badge cc-creator-card__badge--violet">
                  {creator.type === "UGC"
                    ? "UGC"
                    : creator.type === "Influencer"
                      ? "Influencer"
                      : "UGC + Influencer"}
                </span>
                {creator.featured ? (
                  <span className="cc-creator-card__badge">Featured</span>
                ) : null}
              </div>
              <div className="cc-profile-media__platforms">
                {creator.platforms.map((p) => (
                  <span
                    key={p.platform}
                    className="cc-creator-card__platform"
                    style={{ width: 36, height: 36 }}
                    aria-label={p.platform}
                  >
                    {platformIcon(p.platform, 16)}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>

          <div className="cc-profile-meta">
            <Reveal>
              <Eyebrow tone="accent">{creator.role}</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <div>
                <h1 className="cc-profile-meta__name">{creator.name}</h1>
                <div className="cc-profile-meta__handle">{creator.handle}</div>
              </div>
            </Reveal>
            <Reveal delay={2}>
              <p style={{ fontSize: 17, lineHeight: 1.55 }}>{creator.pitch}</p>
            </Reveal>

            <Reveal delay={2}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {creator.niches.map((n) => (
                  <span key={n} className="cc-chip cc-chip--violet">
                    {n}
                  </span>
                ))}
                <span className="cc-chip" style={{ color: "var(--cc-muted)" }}>
                  <IconPin size={12} /> {creator.city}
                </span>
              </div>
            </Reveal>

            <Reveal delay={3}>
              <div className="cc-profile-meta__stats">
                <div>
                  <div className="cc-profile-meta__stat-value">
                    {formatFollowers(creator.headlineFollowers)}
                  </div>
                  <div className="cc-profile-meta__stat-label">Total reach</div>
                </div>
                <div>
                  <div className="cc-profile-meta__stat-value">
                    {formatEngagement(creator.headlineEngagement)}
                  </div>
                  <div className="cc-profile-meta__stat-label">Engagement</div>
                </div>
                <div>
                  <div className="cc-profile-meta__stat-value">
                    {creator.platforms.length}
                  </div>
                  <div className="cc-profile-meta__stat-label">Platforms</div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={3}>
              <div className="cc-profile-platform-list">
                {creator.platforms.map((p) => (
                  <div key={p.platform} className="cc-profile-platform">
                    {platformIcon(p.platform, 20)}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        minWidth: 0,
                      }}
                    >
                      <span className="cc-profile-platform__label">{p.platform}</span>
                      <span className="cc-profile-platform__followers">
                        {formatFollowers(p.followers)}
                      </span>
                      <span className="cc-profile-platform__handle">{p.handle}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={4}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "20px 24px",
                  borderRadius: "var(--cc-radius)",
                  background: "var(--cc-ink)",
                  color: "var(--cc-canvas)",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "rgba(250, 250, 248, 0.56)",
                      fontWeight: 600,
                    }}
                  >
                    Starting from
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--cc-font-display)",
                      fontSize: 22,
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                    }}
                  >
                    {creator.startingFrom}
                  </div>
                </div>
                <Link
                  href={`${CTA_PRIMARY.href}?creator=${creator.slug}`}
                  className="cc-btn cc-btn--light"
                >
                  Inquire about {creator.name.split(" ")[0]}
                  <IconArrowRight className="cc-btn__arrow" size={14} />
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileAbout({ creator }: { creator: Creator }) {
  return (
    <section className="cc-section cc-section--compact">
      <div className="cc-shell">
        <Reveal>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 32,
              padding: "40px 0",
              borderTop: "1px solid var(--cc-line)",
              borderBottom: "1px solid var(--cc-line)",
            }}
          >
            <Eyebrow>About</Eyebrow>
            <p
              style={{
                fontFamily: "var(--cc-font-display)",
                fontSize: "clamp(22px, 2.5vw, 30px)",
                fontWeight: 500,
                letterSpacing: "-0.02em",
                lineHeight: 1.3,
                color: "var(--cc-ink)",
                maxWidth: 820,
              }}
            >
              {creator.bio}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ProfileSpecialties({ creator }: { creator: Creator }) {
  return (
    <section className="cc-section cc-section--compact">
      <div className="cc-shell">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 32,
          }}
        >
          <Reveal>
            <Eyebrow tone="accent">Content specialties</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {creator.contentStyles.map((style) => (
                <span
                  key={style}
                  className="cc-chip"
                  style={{ fontSize: 13, padding: "10px 18px" }}
                >
                  {style}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ProfileDeliverables({ creator }: { creator: Creator }) {
  return (
    <section className="cc-section cc-section--compact">
      <div className="cc-shell">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 2fr",
            gap: 40,
            alignItems: "flex-start",
          }}
          className="cc-profile-cols"
        >
          <Reveal>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Eyebrow>Deliverables</Eyebrow>
              <p style={{ fontSize: 14, color: "var(--cc-muted)", maxWidth: 280 }}>
                Formats {creator.name.split(" ")[0]} ships regularly.
              </p>
            </div>
          </Reveal>
          <Reveal delay={1}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
              }}
            >
              {creator.deliverables.map((d) => (
                <div
                  key={d}
                  style={{
                    padding: "16px 18px",
                    borderRadius: "var(--cc-radius)",
                    background: "var(--cc-surface)",
                    border: "1px solid var(--cc-line)",
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  {d}
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        <div
          style={{
            marginTop: 48,
            padding: 28,
            borderRadius: "var(--cc-radius-lg)",
            background: "var(--cc-surface-warm)",
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 24,
          }}
        >
          <Reveal>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Eyebrow tone="accent">Best for</Eyebrow>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {creator.bestFor.map((b) => (
                  <span key={b} className="cc-chip cc-chip--lime">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ProfileSamples({ creator }: { creator: Creator }) {
  return (
    <section className="cc-section cc-section--compact">
      <div className="cc-shell">
        <div className="cc-section-head">
          <Reveal>
            <Eyebrow>Sample content</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", letterSpacing: "-0.02em" }}>
              A slice of the archive.
            </h2>
          </Reveal>
        </div>
        <Reveal delay={1}>
          <div className="cc-sample-grid">
            {creator.samples.map((src, i) => (
              <div key={i} className="cc-sample-tile">
                <img src={src} alt={`Sample ${i + 1}`} loading="lazy" />
                {i % 2 === 0 ? (
                  <span className="cc-sample-tile__play" aria-hidden>
                    <IconPlay size={10} />
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ProfileCollaborations({ creator }: { creator: Creator }) {
  return (
    <section className="cc-section cc-section--compact">
      <div className="cc-shell">
        <div className="cc-section-head">
          <Reveal>
            <Eyebrow>Past collaborations</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h2 style={{ fontSize: "clamp(24px, 3vw, 36px)", letterSpacing: "-0.02em" }}>
              Brands {creator.name.split(" ")[0]} has worked with.
            </h2>
          </Reveal>
        </div>
        <Reveal delay={1}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {creator.collaborations.map((c) => (
              <div
                key={c.brand}
                style={{
                  padding: "22px 24px",
                  borderRadius: "var(--cc-radius)",
                  background: "var(--cc-surface)",
                  border: "1px solid var(--cc-line)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--cc-font-display)",
                    fontSize: 20,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {c.brand}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--cc-muted)",
                  }}
                >
                  {c.campaign}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ProfileAudience({ creator }: { creator: Creator }) {
  return (
    <section className="cc-section cc-section--compact">
      <div className="cc-shell">
        <Reveal>
          <div
            style={{
              padding: 32,
              borderRadius: "var(--cc-radius-lg)",
              background: "var(--cc-surface)",
              border: "1px solid var(--cc-line)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 24,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: "var(--cc-muted)",
                }}
              >
                Audience markets
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {creator.audienceMarket.map((m) => (
                  <span key={m} className="cc-chip cc-chip--sky">
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: "var(--cc-muted)",
                }}
              >
                Languages
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {creator.languages.map((l) => (
                  <span key={l} className="cc-chip">
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  color: "var(--cc-muted)",
                }}
              >
                Primary platform
              </span>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--cc-font-display)",
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                }}
              >
                {platformIcon(creator.primaryPlatform, 18)}
                {creator.primaryPlatform}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ProfileInquiry({ creator }: { creator: Creator }) {
  return (
    <section className="cc-section cc-section--compact">
      <div className="cc-shell">
        <Reveal>
          <div
            className="cc-final-cta"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 32,
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
              <span
                className="cc-chip"
                style={{
                  background: "rgba(250, 250, 248, 0.12)",
                  color: "var(--cc-canvas)",
                  borderColor: "transparent",
                  alignSelf: "flex-start",
                }}
              >
                Response in under 48 hours
              </span>
              <h2
                style={{
                  fontFamily: "var(--cc-font-display)",
                  fontSize: "clamp(28px, 4vw, 44px)",
                  fontWeight: 600,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.05,
                  color: "var(--cc-canvas)",
                }}
              >
                Ready to work with {creator.name.split(" ")[0]}?
              </h2>
              <p style={{ color: "rgba(250, 250, 248, 0.78)", fontSize: 15 }}>
                Share your brief. We&apos;ll confirm availability, deliverables, and rates
                within two business days.
              </p>
            </div>
            <Link
              href={`${CTA_PRIMARY.href}?creator=${creator.slug}`}
              className="cc-btn cc-btn--light cc-btn--lg"
            >
              Start a Campaign
              <IconArrowRight className="cc-btn__arrow" size={16} />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ProfileRelated({ related }: { related: Creator[] }) {
  return (
    <section className="cc-section">
      <div className="cc-shell">
        <div className="cc-section-head">
          <Reveal>
            <Eyebrow>Related creators</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="cc-section-title" style={{ fontSize: "clamp(28px, 3.5vw, 44px)" }}>
              Similar fit across the roster.
            </h2>
          </Reveal>
        </div>
        <div className="cc-grid-creators">
          {related.map((c, i) => (
            <Reveal key={c.slug} delay={(i % 4) as 0 | 1 | 2 | 3}>
              <CreatorCard creator={c} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
