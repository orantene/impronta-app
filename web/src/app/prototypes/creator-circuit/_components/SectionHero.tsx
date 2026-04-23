import Link from "next/link";

import { CREATORS, formatFollowers } from "../_data/creators";
import { CTA_PRIMARY, CTA_SECONDARY } from "../_data/nav";
import { IconArrowRight, IconPlay, IconTrendingUp, IconUsers } from "./icons";
import { Reveal } from "./Reveal";

export function SectionHero() {
  const maya = CREATORS.find((c) => c.slug === "maya-oduya")!;
  const lila = CREATORS.find((c) => c.slug === "lila-reyes")!;
  const noa = CREATORS.find((c) => c.slug === "noa-harel")!;

  return (
    <section className="cc-hero">
      <div className="cc-hero__orb cc-hero__orb--violet" aria-hidden />
      <div className="cc-hero__orb cc-hero__orb--coral" aria-hidden />

      <div className="cc-shell">
        <div className="cc-hero__grid">
          <div className="cc-hero__copy">
            <Reveal>
              <span className="cc-chip cc-chip--violet">
                <span
                  className="cc-stat__dot"
                  style={{ background: "#7c3aed", boxShadow: "0 0 0 3px #ede9fe" }}
                />
                Now curating for Q3 campaigns
              </span>
            </Reveal>
            <Reveal delay={1}>
              <h1 className="cc-hero__title">
                Premium creators for <em>modern brands</em>.
              </h1>
            </Reveal>
            <Reveal delay={2}>
              <p className="cc-hero__sub">
                Discover influencer and UGC talent who actually fit the brief — curated,
                campaign-ready, and booked through a workflow your growth team will
                actually use.
              </p>
            </Reveal>
            <Reveal delay={3}>
              <div className="cc-hero__ctas">
                <Link href={CTA_PRIMARY.href} className="cc-btn cc-btn--violet cc-btn--lg">
                  {CTA_PRIMARY.label}
                  <IconArrowRight className="cc-btn__arrow" size={16} />
                </Link>
                <Link
                  href="/prototypes/creator-circuit/creators"
                  className="cc-btn cc-btn--outline cc-btn--lg"
                >
                  Explore Creators
                </Link>
              </div>
            </Reveal>
            <Reveal delay={4}>
              <div className="cc-hero__chips" aria-label="Platform highlights">
                <span className="cc-chip cc-chip--coral">
                  <IconUsers size={13} /> 1,200+ creators
                </span>
                <span className="cc-chip cc-chip--lime">
                  <IconTrendingUp size={13} /> 4.2x avg CTR lift
                </span>
                <span className="cc-chip cc-chip--sky">48hr shortlists</span>
                <span className="cc-chip">UGC · Influencer · Hybrid</span>
              </div>
            </Reveal>
          </div>

          <Reveal className="cc-hero__stage-wrap">
            <div className="cc-hero__stage" aria-hidden>
              <div className="cc-hero__card cc-hero__card--main">
                <img src={maya.portrait} alt="" />
              </div>
              <div className="cc-hero__card cc-hero__card--secondary">
                <img src={lila.portrait} alt="" />
              </div>
              <div className="cc-hero__card cc-hero__card--tertiary">
                <img src={noa.reelCover} alt="" />
              </div>

              <span
                className="cc-hero__floating-chip cc-hero__floating-chip--top cc-stat"
                style={{ background: "#fff" }}
              >
                <span className="cc-stat__dot" />
                <span>
                  <span className="cc-stat__label">TikTok</span>{" "}
                  <strong>{formatFollowers(612000)}</strong>
                </span>
              </span>
              <span className="cc-hero__floating-chip cc-hero__floating-chip--mid cc-stat cc-chip--dark">
                <span style={{ color: "#a3e635" }}>●</span>
                <span>
                  <strong>9.2%</strong>{" "}
                  <span style={{ color: "#a3e635", fontSize: 10, letterSpacing: "0.14em" }}>
                    ENGAGEMENT
                  </span>
                </span>
              </span>
              <span
                className="cc-hero__floating-chip cc-hero__floating-chip--bottom cc-stat"
                style={{ background: "#7c3aed", color: "#fff" }}
              >
                <IconPlay size={10} /> Reel · 1.4M views
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
