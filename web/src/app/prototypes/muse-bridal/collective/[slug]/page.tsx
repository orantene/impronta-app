import Link from "next/link";
import { notFound } from "next/navigation";

import { Eyebrow } from "../../_components/Eyebrow";
import { ProfessionalCard } from "../../_components/ProfessionalCard";
import { Reveal } from "../../_components/Reveal";
import { SectionFinalCTA } from "../../_components/SectionFinalCTA";
import {
  IconArrowRight,
  IconCalendar,
  IconPin,
  IconPlane,
  IconQuote,
  IconSparkle,
} from "../../_components/icons";
import { IMAGERY } from "../../_data/imagery";
import {
  PROFESSIONALS,
  getProfessional,
  relatedProfessionals,
} from "../../_data/professionals";
import { SERVICE_BY_SLUG } from "../../_data/services";
import { StickyInquiryBar } from "./StickyInquiryBar";

/**
 * Profile page.
 *
 * Template → Profile Layout Variants:
 *   - `editorial-long` (this one): hero portrait + long editorial sections.
 *   - `split-gallery`: portrait left / gallery right.
 *   - `magazine-feature`: full-bleed portrait hero + ribbon stats.
 *
 * Block composition reads like a page builder — each section is a
 * candidate for a "profile block". The sticky bar is a template-level toggle.
 */

export function generateStaticParams() {
  return PROFESSIONALS.map((p) => ({ slug: p.slug }));
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pro = getProfessional(slug);
  if (!pro) return notFound();
  const service = SERVICE_BY_SLUG[pro.serviceSlug];
  const related = relatedProfessionals(pro, 3);

  return (
    <>
      {/* ── Profile hero ──────────────────────────────────────────── */}
      <section
        style={{
          paddingTop: 150,
          paddingBottom: 80,
          background:
            "linear-gradient(180deg, var(--muse-ivory-warm) 0%, var(--muse-ivory) 100%)",
        }}
      >
        <div className="muse-shell">
          <Link
            href="/prototypes/muse-bridal/collective"
            className="muse-btn muse-btn--ghost"
            style={{ marginBottom: 32 }}
          >
            ← Back to the collective
          </Link>
          <div
            style={{
              display: "grid",
              gap: 48,
              gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)",
              alignItems: "center",
            }}
          >
            <Reveal
              style={{
                position: "relative",
                borderRadius: "var(--muse-radius-lg)",
                overflow: "hidden",
                aspectRatio: "4 / 5",
                background: "var(--muse-champagne-soft)",
              }}
            >
              <img
                src={pro.portrait}
                alt={pro.name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
              {pro.travelsGlobally ? (
                <span
                  style={{
                    position: "absolute",
                    top: 22,
                    left: 22,
                    background: "rgba(246,241,234,0.92)",
                    padding: "9px 16px",
                    borderRadius: "var(--muse-radius-pill)",
                    fontSize: 10,
                    letterSpacing: "0.24em",
                    textTransform: "uppercase",
                    color: "var(--muse-espresso)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  Destination-ready
                </span>
              ) : null}
            </Reveal>
            <Reveal delay={1} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <Eyebrow>{service?.label ?? pro.role}</Eyebrow>
              <h1
                style={{
                  fontSize: "clamp(44px, 5.6vw, 76px)",
                  lineHeight: 1.02,
                  color: "var(--muse-espresso-deep)",
                }}
              >
                {pro.name}
              </h1>
              <p
                style={{
                  fontFamily: "var(--muse-font-display)",
                  fontStyle: "italic",
                  fontWeight: 300,
                  fontSize: 22,
                  color: "var(--muse-espresso)",
                  lineHeight: 1.45,
                }}
              >
                {pro.intro}
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 24,
                  color: "var(--muse-muted)",
                  fontSize: 14,
                }}
              >
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <IconPin size={18} />
                  {pro.baseLocation}
                </span>
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <IconCalendar size={18} />
                  Lead time {pro.leadTime}
                </span>
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <IconSparkle size={18} />
                  {pro.startingFrom}
                </span>
              </div>

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
                <Link
                  href={`/prototypes/muse-bridal/contact?pro=${encodeURIComponent(pro.name)}`}
                  className="muse-btn muse-btn--primary"
                >
                  Inquire about {pro.name.split(" ")[0]}
                </Link>
                <Link
                  href="/prototypes/muse-bridal/contact?intent=team"
                  className="muse-btn muse-btn--outline"
                >
                  Build a Custom Team
                </Link>
              </div>

              {pro.social.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    gap: 18,
                    marginTop: 4,
                    paddingTop: 20,
                    borderTop: "1px solid var(--muse-line-soft)",
                    fontSize: 12,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--muse-muted)",
                  }}
                >
                  <span>Find</span>
                  {pro.social.map((s) => (
                    <Link
                      key={s.label}
                      href={s.href}
                      style={{ color: "var(--muse-espresso)" }}
                    >
                      {s.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Stats ribbon ─────────────────────────────────────────── */}
      <section
        style={{
          padding: "40px 0",
          background: "var(--muse-espresso-deep)",
          color: "var(--muse-ivory)",
        }}
      >
        <div className="muse-shell">
          <div
            style={{
              display: "grid",
              gap: 28,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <Stat label="Team" value={pro.teamSize} />
            <Stat label="Languages" value={pro.languages.join(" · ")} />
            <Stat label="Travel" value={pro.travelsGlobally ? "Worldwide" : "Regional"} />
            <Stat label="Starting from" value={pro.startingFrom} />
          </div>
        </div>
      </section>

      {/* ── About ────────────────────────────────────────────────── */}
      <section className="muse-section">
        <div className="muse-shell--narrow">
          <div
            style={{
              display: "grid",
              gap: 56,
              gridTemplateColumns: "minmax(0, 200px) minmax(0, 1fr)",
              alignItems: "start",
            }}
          >
            <Reveal>
              <Eyebrow>About</Eyebrow>
            </Reveal>
            <Reveal
              delay={1}
              style={{ display: "flex", flexDirection: "column", gap: 20 }}
            >
              {pro.about.map((p, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: i === 0 ? 22 : 17,
                    lineHeight: 1.55,
                    color: i === 0 ? "var(--muse-espresso-deep)" : "var(--muse-espresso)",
                    fontFamily: i === 0 ? "var(--muse-font-display)" : "var(--muse-font-body)",
                    fontWeight: i === 0 ? 400 : 400,
                  }}
                >
                  {p}
                </p>
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Specialties & Event styles ──────────────────────────── */}
      <section
        className="muse-section--compact"
        style={{
          background: "var(--muse-champagne-soft)",
          padding: "80px 0",
        }}
      >
        <div className="muse-shell">
          <div
            style={{
              display: "grid",
              gap: 48,
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              alignItems: "start",
            }}
          >
            <Reveal>
              <Eyebrow>Specialties</Eyebrow>
              <h3
                style={{
                  marginTop: 18,
                  fontSize: 32,
                  maxWidth: 420,
                  marginBottom: 24,
                }}
              >
                Where {pro.name.split(" ")[0]} shines.
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {pro.specialties.map((s) => (
                  <span key={s} className="muse-chip muse-chip--outline">
                    {s}
                  </span>
                ))}
              </div>
            </Reveal>
            <Reveal delay={1}>
              <Eyebrow>Event styles</Eyebrow>
              <h3
                style={{
                  marginTop: 18,
                  fontSize: 32,
                  maxWidth: 420,
                  marginBottom: 24,
                }}
              >
                Best-suited moments.
              </h3>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {pro.eventStyles.map((s) => (
                  <li
                    key={s}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      fontSize: 16,
                      color: "var(--muse-espresso-deep)",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 28,
                        height: 1,
                        background: "var(--muse-blush)",
                      }}
                    />
                    {s}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Portfolio mosaic ────────────────────────────────────── */}
      <section className="muse-section">
        <div className="muse-shell">
          <div
            style={{
              display: "flex",
              alignItems: "end",
              justifyContent: "space-between",
              marginBottom: 40,
              flexWrap: "wrap",
              gap: 20,
            }}
          >
            <div>
              <Eyebrow>Portfolio</Eyebrow>
              <h2 style={{ fontSize: "clamp(32px, 4.5vw, 52px)", marginTop: 16 }}>
                Recent work.
              </h2>
            </div>
            <Link
              href={`/prototypes/muse-bridal/contact?pro=${encodeURIComponent(pro.name)}`}
              className="muse-btn muse-btn--outline muse-btn--sm"
            >
              Request full portfolio
            </Link>
          </div>
          <div
            style={{
              display: "grid",
              gap: 18,
              gridTemplateColumns: "repeat(12, 1fr)",
            }}
          >
            {pro.portfolio.map((src, i) => {
              const mosaic = [
                { col: "span 8", aspect: "5 / 3" },
                { col: "span 4", aspect: "3 / 4" },
                { col: "span 4", aspect: "3 / 4" },
                { col: "span 8", aspect: "5 / 3" },
              ];
              const pos = mosaic[i % mosaic.length];
              return (
                <Reveal
                  key={src + i}
                  delay={(i % 4) as 0 | 1 | 2 | 3}
                  style={{
                    gridColumn: pos.col,
                    aspectRatio: pos.aspect,
                    overflow: "hidden",
                    borderRadius: "var(--muse-radius-sm)",
                    background: "var(--muse-champagne-soft)",
                  }}
                >
                  <img
                    src={src}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Travel + Packages ───────────────────────────────────── */}
      <section
        className="muse-section"
        style={{ background: "var(--muse-ivory-warm)" }}
      >
        <div className="muse-shell">
          <div
            style={{
              display: "grid",
              gap: 36,
              gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
              alignItems: "stretch",
            }}
          >
            <Reveal
              className="muse-surface-raised"
              style={{ padding: "40px 36px", display: "flex", flexDirection: "column", gap: 22 }}
            >
              <Eyebrow>Travel</Eyebrow>
              <h3 style={{ fontSize: 30 }}>Where {pro.name.split(" ")[0]} works.</h3>
              <p style={{ color: "var(--muse-espresso)" }}>
                Based in {pro.baseLocation}. Regularly commissioned across the
                destinations below — international travel priced per enquiry.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {pro.destinations.map((d) => (
                  <span key={d} className="muse-chip muse-chip--soft">
                    <IconPin size={12} />
                    {d}
                  </span>
                ))}
              </div>
              <div
                style={{
                  marginTop: "auto",
                  paddingTop: 18,
                  borderTop: "1px solid var(--muse-line-soft)",
                  color: "var(--muse-muted)",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <IconPlane size={18} />
                {pro.travelsGlobally ? "Travels globally" : "Primarily regional"}
              </div>
            </Reveal>

            <Reveal
              delay={1}
              className="muse-surface-raised"
              style={{
                padding: "40px 36px",
                background:
                  "linear-gradient(180deg, var(--muse-espresso-deep) 0%, var(--muse-espresso) 100%)",
                color: "var(--muse-ivory)",
                border: 0,
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              <Eyebrow tone="light">Starting point</Eyebrow>
              <h3 style={{ color: "var(--muse-ivory)", fontSize: 40 }}>
                {pro.startingFrom}
              </h3>
              <p style={{ color: "rgba(246,241,234,0.78)", fontSize: 15 }}>
                {pro.bookingNote}
              </p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "8px 0 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  fontSize: 14,
                  color: "rgba(246,241,234,0.88)",
                }}
              >
                <li>• Trial / discovery call included</li>
                <li>• Concierge coordinates every other vendor</li>
                <li>• Transparent travel quote before booking</li>
              </ul>
              <Link
                href={`/prototypes/muse-bridal/contact?pro=${encodeURIComponent(pro.name)}`}
                className="muse-btn muse-btn--light"
                style={{ marginTop: 8 }}
              >
                Request a quote
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────── */}
      {pro.testimonials.length > 0 ? (
        <section className="muse-section">
          <div className="muse-shell--narrow">
            <Eyebrow>In their words</Eyebrow>
            <div
              style={{
                marginTop: 28,
                display: "grid",
                gap: 26,
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              }}
            >
              {pro.testimonials.map((t, i) => (
                <Reveal
                  key={t.author}
                  delay={(i % 3) as 0 | 1 | 2}
                  className="muse-surface-raised"
                  style={{ padding: "36px 32px", display: "flex", flexDirection: "column", gap: 18 }}
                >
                  <span style={{ color: "var(--muse-blush)" }}>
                    <IconQuote size={32} />
                  </span>
                  <p
                    style={{
                      fontFamily: "var(--muse-font-display)",
                      fontSize: 22,
                      lineHeight: 1.4,
                      color: "var(--muse-espresso-deep)",
                    }}
                  >
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: 16,
                      borderTop: "1px solid var(--muse-line-soft)",
                      fontSize: 13,
                      color: "var(--muse-muted)",
                    }}
                  >
                    <strong style={{ color: "var(--muse-espresso)" }}>{t.author}</strong>
                    <br />
                    {t.context}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Related professionals ───────────────────────────────── */}
      {related.length > 0 ? (
        <section
          className="muse-section"
          style={{
            background:
              "linear-gradient(180deg, var(--muse-ivory) 0%, var(--muse-ivory-warm) 100%)",
          }}
        >
          <div className="muse-shell">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "end",
                marginBottom: 36,
                gap: 20,
                flexWrap: "wrap",
              }}
            >
              <div>
                <Eyebrow>Cross-book</Eyebrow>
                <h2 style={{ fontSize: "clamp(32px, 4.5vw, 48px)", marginTop: 16, maxWidth: 520 }}>
                  Pair {pro.name.split(" ")[0]} with the rest of the team.
                </h2>
              </div>
              <Link
                href="/prototypes/muse-bridal/collective"
                className="muse-btn muse-btn--ghost"
              >
                Browse the full collective
                <IconArrowRight size={14} />
              </Link>
            </div>
            <div
              style={{
                display: "grid",
                gap: 22,
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              }}
            >
              {related.map((p) => (
                <ProfessionalCard key={p.slug} pro={p} variant="directory" />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Final CTA ───────────────────────────────────────────── */}
      <SectionFinalCTA
        eyebrow="Inquire directly"
        title={
          <>
            Book {pro.name.split(" ")[0]} for your{" "}
            <em
              style={{
                fontFamily: "var(--muse-font-display)",
                fontStyle: "italic",
                fontWeight: 300,
                color: "var(--muse-blush)",
              }}
            >
              celebration.
            </em>
          </>
        }
        copy={`${pro.name.split(" ")[0]} responds to all inquiries within two working days. Share your date and destination and we'll return availability, quote, and a curated supporting team.`}
        primary={{
          label: "Start Your Inquiry",
          href: `/prototypes/muse-bridal/contact?pro=${encodeURIComponent(pro.name)}`,
        }}
        secondary={{ label: "Build a Custom Team", href: "/prototypes/muse-bridal/contact?intent=team" }}
        image={IMAGERY.heroContact}
        reassurance="No call centres. One concierge, one reply."
      />

      <StickyInquiryBar
        name={pro.name}
        role={service?.label ?? pro.role}
        startingFrom={pro.startingFrom}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: "rgba(246,241,234,0.58)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--muse-font-display)",
          fontSize: 22,
          color: "var(--muse-ivory)",
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
    </div>
  );
}
