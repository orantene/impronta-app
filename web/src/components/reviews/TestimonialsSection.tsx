/**
 * Presentational INVITED-TESTIMONIALS block for PUBLIC talent pages.
 *
 * WALLED OFF from verified booking reviews. This block renders quotes that
 * agency staff attested or imported (public.tenant_testimonials). It is
 * deliberately, visibly distinct from the star-average reviews block:
 *
 *   - Its own "Invited testimonials" heading + provenance caption.
 *   - A per-card "Shared by the agency · not a verified booking review" label.
 *   - NO aggregate stars. NO average. The optional per-card rating is
 *     DISPLAY-ONLY and is NEVER blended into the talent's star average or any
 *     STANDING signal.
 *
 * Server component — no interactivity. Self-contained inline styles driven by a
 * small "dark"/"light" theme token set so it drops in under either branding,
 * immediately after <TalentReviewsSection />.
 *
 * Returns null when there are no testimonials.
 *
 * NOT under components/admin/shell, so inline styles are fine here.
 */

import type { Testimonial } from "@/lib/reviews/review-types";

type Theme = "dark" | "light";

type ThemeTokens = {
  heading: string;
  body: string;
  muted: string;
  star: string;
  starEmpty: string;
  divider: string;
  cardBg: string;
  cardBorder: string;
};

const THEMES: Record<Theme, ThemeTokens> = {
  dark: {
    heading: "var(--impronta-foreground, #f5f1e6)",
    body: "var(--impronta-muted, #c9c2b4)",
    muted: "var(--impronta-gold-dim, #8a7a3f)",
    star: "var(--impronta-gold, #c9a227)",
    starEmpty: "rgba(201,162,39,0.22)",
    divider: "var(--impronta-gold-border, rgba(201,162,39,0.18))",
    cardBg: "rgba(255,255,255,0.03)",
    cardBorder: "var(--impronta-gold-border, rgba(201,162,39,0.18))",
  },
  light: {
    heading: "#0B0B0D",
    body: "rgba(11,11,13,0.66)",
    muted: "rgba(11,11,13,0.5)",
    star: "#C99A2E",
    starEmpty: "rgba(11,11,13,0.16)",
    divider: "rgba(24,24,27,0.08)",
    cardBg: "rgba(11,11,13,0.02)",
    cardBorder: "rgba(24,24,27,0.08)",
  },
};

function Stars({
  rating,
  size,
  tokens,
}: {
  rating: number;
  size: number;
  tokens: ThemeTokens;
}) {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span
      aria-label={`${rating} out of 5 stars, shared testimonial`}
      style={{ display: "inline-flex", gap: 1, lineHeight: 1, fontSize: size }}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          aria-hidden
          style={{ color: i <= rounded ? tokens.star : tokens.starEmpty }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function attribution(t: Testimonial): string | null {
  const name = t.authorName?.trim();
  const role = t.authorRole?.trim();
  if (name && role) return `${name} · ${role}`;
  return name || role || null;
}

export function TestimonialsSection({
  testimonials = [],
  theme = "dark",
  heading = "Invited testimonials",
}: {
  testimonials?: Testimonial[];
  theme?: Theme;
  heading?: string;
}) {
  const list = (testimonials ?? []).filter((t) => t.body?.trim());
  if (list.length === 0) return null;
  const tokens = THEMES[theme];

  return (
    <section
      data-profile-section="testimonials"
      aria-label="Invited testimonials"
      style={{ display: "block", width: "100%" }}
    >
      {/* Section label — deliberately distinct from the Reviews heading. */}
      <div
        style={{
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: tokens.star,
        }}
      >
        {heading}
      </div>

      {/* Provenance caption — makes the wall explicit. NOT verified reviews. */}
      <p
        data-testimonials-caption
        style={{
          margin: "10px 0 0",
          fontSize: 11.5,
          letterSpacing: "0.02em",
          color: tokens.muted,
        }}
      >
        Shared by the agency · not verified booking reviews
      </p>

      {/* Testimonial cards — quote style, no aggregate. */}
      <ul
        style={{
          listStyle: "none",
          margin: "18px 0 0",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {list.map((t) => {
          const who = attribution(t);
          return (
            <li
              key={t.id}
              style={{
                padding: "16px 18px",
                borderRadius: 12,
                background: tokens.cardBg,
                border: `1px solid ${tokens.cardBorder}`,
              }}
            >
              <blockquote
                style={{
                  margin: 0,
                  fontSize: 14.5,
                  lineHeight: 1.65,
                  color: tokens.body,
                  whiteSpace: "pre-wrap",
                }}
              >
                {t.body.trim()}
              </blockquote>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                  marginTop: 12,
                }}
              >
                {who ? (
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: tokens.heading,
                    }}
                  >
                    {who}
                  </span>
                ) : null}
                {/* Per-card, display-only rating — ONLY when present. Never
                    an aggregate, never folded into the star average. */}
                {typeof t.rating === "number" ? (
                  <Stars rating={t.rating} size={13} tokens={tokens} />
                ) : null}
              </div>

              {/* Per-card wall label. */}
              <p
                data-testimonial-caption
                style={{
                  margin: "8px 0 0",
                  fontSize: 11,
                  letterSpacing: "0.02em",
                  color: tokens.muted,
                }}
              >
                Shared by the agency · not a verified booking review
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
