import Link from "next/link";

import { CTA_PRIMARY, CTA_SECONDARY } from "../_data/nav";
import { IconArrowRight } from "./icons";
import { Reveal } from "./Reveal";

export function SectionFinalCTA() {
  return (
    <section className="cc-section">
      <div className="cc-shell">
        <Reveal>
          <div className="cc-final-cta">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 20,
                alignItems: "flex-start",
                maxWidth: 720,
              }}
            >
              <span
                className="cc-chip"
                style={{
                  background: "rgba(250, 250, 248, 0.1)",
                  color: "var(--cc-canvas)",
                  borderColor: "transparent",
                }}
              >
                Built for campaigns that need more than random outreach
              </span>
              <h2
                style={{
                  fontFamily: "var(--cc-font-display)",
                  fontSize: "clamp(36px, 5vw, 64px)",
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.02,
                  color: "var(--cc-canvas)",
                }}
              >
                Your next launch is one <em
                  style={{
                    fontStyle: "normal",
                    background:
                      "linear-gradient(135deg, #a3e635 0%, #38bdf8 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  curated roster
                </em>{" "}
                away.
              </h2>
              <p
                style={{
                  fontSize: 17,
                  lineHeight: 1.55,
                  color: "rgba(250, 250, 248, 0.78)",
                  maxWidth: 540,
                }}
              >
                Share your campaign brief. We return a shortlist of the right creators in 48
                hours — with rates, deliverables, and availability already surfaced.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                <Link href={CTA_PRIMARY.href} className="cc-btn cc-btn--light cc-btn--lg">
                  {CTA_PRIMARY.label}
                  <IconArrowRight className="cc-btn__arrow" size={16} />
                </Link>
                <Link
                  href={CTA_SECONDARY.href}
                  className="cc-btn cc-btn--lg"
                  style={{
                    background: "transparent",
                    color: "var(--cc-canvas)",
                    borderColor: "rgba(250, 250, 248, 0.28)",
                    border: "1px solid rgba(250, 250, 248, 0.28)",
                  }}
                >
                  {CTA_SECONDARY.label}
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
