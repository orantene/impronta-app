import Link from "next/link";

import type { Professional } from "../_data/professionals";
import { Eyebrow } from "./Eyebrow";
import { ProfessionalCard } from "./ProfessionalCard";
import { Reveal } from "./Reveal";

/**
 * Featured professionals block.
 *
 * CMS → Featured Talent Section:
 *   - source_mode: `manual_pick` | `auto_by_service` | `auto_by_destination`
 *   - columns: 3 | 4
 *   - show_footer_cta: bool
 *   - card_variant: ProfessionalCard variant
 */

export function SectionFeatured({
  items,
  eyebrow,
  title,
  copy,
}: {
  items: Professional[];
  eyebrow: string;
  title: React.ReactNode;
  copy: React.ReactNode;
}) {
  return (
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
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "end",
            gap: 32,
            marginBottom: 56,
          }}
        >
          <div style={{ maxWidth: 640 }}>
            <Reveal>
              <Eyebrow>{eyebrow}</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h2 style={{ fontSize: "clamp(36px, 5vw, 58px)", marginTop: 18 }}>
                {title}
              </h2>
            </Reveal>
          </div>
          <Reveal delay={2} style={{ maxWidth: 380 }}>
            <p style={{ marginBottom: 20 }}>{copy}</p>
            <Link
              href="/prototypes/muse-bridal/collective"
              className="muse-btn muse-btn--outline"
            >
              Explore the Collective
            </Link>
          </Reveal>
        </div>

        <div
          style={{
            display: "grid",
            gap: 26,
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {items.map((pro, i) => (
            <Reveal key={pro.slug} delay={(i % 4) as 0 | 1 | 2 | 3}>
              <ProfessionalCard pro={pro} variant="featured" />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
