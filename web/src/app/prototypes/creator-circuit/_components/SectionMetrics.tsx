import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

const METRICS = [
  {
    value: "1,200+",
    label: "Vetted creators",
    caption: "Across 10 verticals, 32 markets, 14 languages.",
    variant: "default" as const,
  },
  {
    value: "48hr",
    label: "Shortlist turnaround",
    caption: "From brief to curated creator match — every time.",
    variant: "violet" as const,
  },
  {
    value: "4.2x",
    label: "Avg CTR lift",
    caption: "Versus baseline paid creative across Meta and TikTok.",
    variant: "default" as const,
  },
  {
    value: "94%",
    label: "Repeat book rate",
    caption: "Brands returning within 90 days for a second campaign.",
    variant: "default" as const,
  },
];

const DELIVERABLES = [
  "UGC videos",
  "Short-form edits",
  "Product photos",
  "Story sets",
  "Whitelisting-ready content",
  "Paid ad creative",
  "Long-form YouTube",
  "Campaign bundles",
  "Pinterest pins",
  "Dedicated reviews",
];

export function SectionMetrics() {
  return (
    <section className="cc-section cc-section--dark">
      <div className="cc-shell">
        <div className="cc-section-head">
          <Reveal>
            <Eyebrow tone="light">By the numbers</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="cc-section-title">
              Data-aware discovery, <em>commercially credible outcomes</em>.
            </h2>
          </Reveal>
        </div>

        <div className="cc-grid-metrics">
          {METRICS.map((m, i) => (
            <Reveal key={m.label} delay={(i % 4) as 0 | 1 | 2 | 3}>
              <div
                className={`cc-metric-tile${m.variant === "violet" ? " cc-metric-tile--violet" : ""}`}
                style={
                  m.variant === "default"
                    ? { background: "rgba(250, 250, 248, 0.04)", borderColor: "rgba(250, 250, 248, 0.1)" }
                    : undefined
                }
              >
                <div
                  className="cc-metric-tile__value"
                  style={m.variant === "default" ? { color: "var(--cc-canvas)" } : undefined}
                >
                  {m.value}
                </div>
                <div
                  className="cc-metric-tile__label"
                  style={m.variant === "default" ? { color: "rgba(250, 250, 248, 0.56)" } : undefined}
                >
                  {m.label}
                </div>
                <p
                  className="cc-metric-tile__caption"
                  style={m.variant === "default" ? { color: "rgba(250, 250, 248, 0.72)" } : undefined}
                >
                  {m.caption}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={2}>
          <div style={{ marginTop: 48 }}>
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "rgba(250, 250, 248, 0.56)",
                marginBottom: 16,
              }}
            >
              Deliverable library
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {DELIVERABLES.map((d) => (
                <span
                  key={d}
                  className="cc-chip"
                  style={{
                    background: "transparent",
                    borderColor: "rgba(250, 250, 248, 0.2)",
                    color: "var(--cc-canvas)",
                  }}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
