import Link from "next/link";

import { NICHES } from "../_data/niches";
import { BASE } from "../_data/nav";
import { nicheIcon } from "./icons";
import { Reveal } from "./Reveal";
import { Eyebrow } from "./Eyebrow";

/**
 * Niche / category grid. Each tile deep-links into the directory pre-filtered.
 */
export function SectionNiches() {
  return (
    <section className="cc-section">
      <div className="cc-shell">
        <div className="cc-section-head">
          <Reveal>
            <Eyebrow tone="accent">Categories</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="cc-section-title">
              Creators across <em>every vertical</em>.
            </h2>
          </Reveal>
          <Reveal delay={2}>
            <p className="cc-section-sub">
              Every category is represented by creators who share the same curation
              standard — tight niche match, campaign-ready profiles, proof of lift.
            </p>
          </Reveal>
        </div>

        <div className="cc-grid-niches">
          {NICHES.map((niche, i) => (
            <Reveal key={niche.slug} delay={(i % 4) as 0 | 1 | 2 | 3}>
              <Link
                href={`${BASE}/creators?niche=${niche.slug}`}
                className={`cc-niche-tile${niche.tint !== "default" ? ` cc-niche-tile--${niche.tint}` : ""}`}
              >
                <span className="cc-niche-tile__icon">{nicheIcon(niche.iconKey, 24)}</span>
                <div>
                  <div className="cc-niche-tile__name">{niche.name}</div>
                  <div className="cc-niche-tile__count">{niche.count} creators</div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
