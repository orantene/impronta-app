import { BRAND_LOGOS, TESTIMONIALS } from "../_data/campaigns";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

export function SectionTestimonials() {
  return (
    <section className="cc-section">
      <div className="cc-shell">
        <div className="cc-section-head">
          <Reveal>
            <Eyebrow>Social proof</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="cc-section-title">
              Teams who run <em>real campaigns</em> here.
            </h2>
          </Reveal>
        </div>

        <div className="cc-grid-testimonials">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={(i % 3) as 0 | 1 | 2}>
              <figure className="cc-testimonial">
                <blockquote className="cc-testimonial__quote">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="cc-testimonial__meta">
                  <img
                    src={t.avatar}
                    alt={t.name}
                    className="cc-testimonial__avatar"
                    loading="lazy"
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--cc-ink)" }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--cc-muted)" }}>
                      {t.role} · {t.company}
                    </div>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>

        <Reveal delay={3}>
          <div
            style={{
              marginTop: 56,
              padding: "32px 24px",
              borderRadius: "var(--cc-radius-lg)",
              background: "var(--cc-surface)",
              border: "1px solid var(--cc-line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 20,
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "var(--cc-muted)",
              }}
            >
              Trusted by
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "clamp(20px, 3vw, 40px)",
                alignItems: "center",
              }}
            >
              {BRAND_LOGOS.map((b) => (
                <span
                  key={b}
                  style={{
                    fontFamily: "var(--cc-font-display)",
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    color: "var(--cc-ink-soft)",
                    opacity: 0.65,
                  }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
