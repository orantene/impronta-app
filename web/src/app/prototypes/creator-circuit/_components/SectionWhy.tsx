import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

const BENEFITS = [
  {
    num: "01",
    title: "Curated, not open-platform.",
    copy: "Every creator is vetted for engagement authenticity, niche fit, and campaign reliability. No inflated followings, no ghosted deliverables.",
  },
  {
    num: "02",
    title: "Discovery that actually filters.",
    copy: "Filter by niche, platform, audience size, language, region, deliverable type, and creator archetype — not just hashtag search.",
  },
  {
    num: "03",
    title: "Campaign-ready media kits.",
    copy: "Every profile shows platform-level metrics, audience breakdowns, deliverables, and rate guidance — the full brief your team needs.",
  },
  {
    num: "04",
    title: "Inquiry to booking in one flow.",
    copy: "Brief once, shortlist returned in 48 hours, book directly through the platform. Zero DM pitch fatigue.",
  },
  {
    num: "05",
    title: "Performance transparency.",
    copy: "Post-campaign reporting as standard — reach, engagement, CTR, and where possible, attributed conversions.",
  },
  {
    num: "06",
    title: "A creator network you trust.",
    copy: "Creators want to be here. That means faster responses, better craft, and follow-through on the campaigns you actually book.",
  },
];

export function SectionWhy() {
  return (
    <section className="cc-section">
      <div className="cc-shell">
        <div className="cc-section-head">
          <Reveal>
            <Eyebrow>Why brands use Creator Circuit</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="cc-section-title">
              Campaign-ready creator discovery — <em>without the chaos</em>.
            </h2>
          </Reveal>
        </div>

        <div className="cc-grid-benefits">
          {BENEFITS.map((b, i) => (
            <Reveal key={b.num} delay={(i % 4) as 0 | 1 | 2 | 3}>
              <article className="cc-benefit">
                <span className="cc-benefit__num">{b.num}</span>
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
  );
}
