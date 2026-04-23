import Link from "next/link";

import { CREATORS } from "../_data/creators";
import { BASE } from "../_data/nav";
import { CreatorCard } from "./CreatorCard";
import { Eyebrow } from "./Eyebrow";
import { IconArrowRight } from "./icons";
import { Reveal } from "./Reveal";

export function SectionFeaturedCreators() {
  const featured = CREATORS.filter((c) => c.featured).slice(0, 4);
  return (
    <section className="cc-section">
      <div className="cc-shell">
        <div
          className="cc-section-head"
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 620 }}>
            <Reveal>
              <Eyebrow>Featured Creators</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h2 className="cc-section-title">
                Members worth <em>building a campaign around</em>.
              </h2>
            </Reveal>
            <Reveal delay={2}>
              <p className="cc-section-sub">
                A handful of creators we actively recommend — each vetted for
                engagement quality, niche fit, and campaign turnaround.
              </p>
            </Reveal>
          </div>
          <Reveal delay={2}>
            <Link href={`${BASE}/creators`} className="cc-btn cc-btn--ghost cc-btn--sm">
              View all creators <IconArrowRight className="cc-btn__arrow" size={14} />
            </Link>
          </Reveal>
        </div>

        <div className="cc-grid-creators">
          {featured.map((c, i) => (
            <Reveal key={c.slug} delay={(i % 4) as 0 | 1 | 2 | 3}>
              <CreatorCard creator={c} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
