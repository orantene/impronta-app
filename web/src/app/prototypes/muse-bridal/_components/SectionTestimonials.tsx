import type { Testimonial } from "../_data/testimonials";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";
import { IconQuote } from "./icons";

/**
 * Editorial testimonials.
 *
 * CMS → Testimonials Section:
 *   - layout_variant: `trio-card` (this one) | `carousel` | `single-hero`
 *   - items[]: Testimonial rows (FK → testimonial_items)
 *   - show_accent: bool (uses `accent` field from each row)
 *
 * Accent tints come from the `accent` field on each testimonial — maps to
 * a palette pairing so bridal/floral/culinary brands can theme these
 * differently without forking the component.
 */

const ACCENTS: Record<
  Testimonial["accent"],
  { bg: string; border: string; quoteColor: string }
> = {
  blush: {
    bg: "linear-gradient(180deg, #f2e0dc 0%, #f8ece6 100%)",
    border: "#e5cec6",
    quoteColor: "#d8b7b0",
  },
  sage: {
    bg: "linear-gradient(180deg, #e1e5da 0%, #eff1e9 100%)",
    border: "#c7cdc0",
    quoteColor: "#a8b1a0",
  },
  champagne: {
    bg: "linear-gradient(180deg, #efe0c6 0%, #faf1df 100%)",
    border: "#ddcbae",
    quoteColor: "#c5a470",
  },
};

export function SectionTestimonials({ items }: { items: Testimonial[] }) {
  return (
    <section className="muse-section">
      <div className="muse-shell">
        <Reveal style={{ textAlign: "center", marginBottom: 56, maxWidth: 720, marginInline: "auto" }}>
          <Eyebrow>Couples &amp; Planners</Eyebrow>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 58px)", marginTop: 18 }}>
            Words from the people we work for.
          </h2>
        </Reveal>

        <div
          style={{
            display: "grid",
            gap: 22,
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}
        >
          {items.map((t, i) => {
            const tone = ACCENTS[t.accent];
            return (
              <Reveal
                key={t.author}
                delay={(i % 4) as 0 | 1 | 2 | 3}
                style={{
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                  borderRadius: "var(--muse-radius-lg)",
                  padding: "38px 32px 32px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 22,
                  position: "relative",
                  minHeight: 300,
                }}
              >
                <span style={{ color: tone.quoteColor }}>
                  <IconQuote size={36} stroke={1} />
                </span>
                <p
                  style={{
                    fontFamily: "var(--muse-font-display)",
                    fontSize: "clamp(20px, 2vw, 24px)",
                    lineHeight: 1.35,
                    color: "var(--muse-espresso-deep)",
                    fontWeight: 400,
                  }}
                >
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div
                  style={{
                    marginTop: "auto",
                    borderTop: `1px solid ${tone.border}`,
                    paddingTop: 18,
                    fontSize: 13,
                    color: "var(--muse-espresso)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <strong style={{ fontWeight: 500 }}>{t.author}</strong>
                  <span style={{ color: "var(--muse-muted)" }}>
                    {t.context} · {t.location}
                  </span>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
