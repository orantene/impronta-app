import { Eyebrow } from "../_components/Eyebrow";
import { Reveal } from "../_components/Reveal";
import { InquiryForm } from "./InquiryForm";

export const metadata = {
  title: "Start a Campaign",
  description:
    "Send Creator Circuit your brief — or apply to join the roster. 48-hour shortlist turnaround for brands; invite-first curation for creators.",
};

const RESPONSE_PROMISES = [
  {
    title: "48-hour brand turnaround.",
    copy: "Send a brief — get back a curated shortlist with rates, deliverables, and availability. No intro calls required.",
  },
  {
    title: "Personally reviewed.",
    copy: "Every brief and every creator application is read by our team — not a bot, not a junior. Expect thoughtful replies.",
  },
  {
    title: "No commitment, no retainer.",
    copy: "You pay when you book. First brief is always free, shortlist included. Decide from there.",
  },
];

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section
        style={{
          paddingTop: 140,
          paddingBottom: "clamp(48px, 6vw, 88px)",
          background:
            "radial-gradient(70% 50% at 15% 0%, rgba(124, 58, 237, 0.08), transparent), radial-gradient(70% 50% at 85% 0%, rgba(251, 113, 133, 0.07), transparent)",
        }}
      >
        <div className="cc-shell">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
              maxWidth: 820,
            }}
          >
            <Reveal>
              <Eyebrow tone="accent">Start a campaign</Eyebrow>
            </Reveal>
            <Reveal delay={1}>
              <h1
                className="cc-section-title"
                style={{ fontSize: "clamp(44px, 6vw, 88px)" }}
              >
                Tell us what you&apos;re <em>building</em>.
              </h1>
            </Reveal>
            <Reveal delay={2}>
              <p
                style={{
                  fontSize: 19,
                  lineHeight: 1.55,
                  color: "var(--cc-muted)",
                  maxWidth: 620,
                }}
              >
                Brands send briefs. Creators send applications. Both get a real human reply
                — fast, specific, and worth your time.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Form + sidebar */}
      <section style={{ paddingBottom: "clamp(72px, 9vw, 128px)" }}>
        <div className="cc-shell">
          <div className="cc-contact-grid">
            <Reveal>
              <InquiryForm />
            </Reveal>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 20,
                position: "sticky",
                top: 120,
              }}
            >
              <Reveal delay={1}>
                <div
                  style={{
                    background: "var(--cc-surface-warm)",
                    borderRadius: "var(--cc-radius-lg)",
                    padding: "28px 26px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.18em",
                      fontWeight: 600,
                      color: "var(--cc-violet-deep)",
                      textTransform: "uppercase",
                    }}
                  >
                    What to expect
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {RESPONSE_PROMISES.map((r) => (
                      <div
                        key={r.title}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--cc-font-display)",
                            fontSize: 16,
                            fontWeight: 600,
                            letterSpacing: "-0.016em",
                          }}
                        >
                          {r.title}
                        </span>
                        <p
                          style={{
                            fontSize: 13.5,
                            color: "var(--cc-muted)",
                            lineHeight: 1.55,
                          }}
                        >
                          {r.copy}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>

              <Reveal delay={2}>
                <div
                  style={{
                    background: "var(--cc-ink)",
                    color: "var(--cc-canvas)",
                    borderRadius: "var(--cc-radius-lg)",
                    padding: "28px 26px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.18em",
                      fontWeight: 600,
                      color: "var(--cc-lime)",
                      textTransform: "uppercase",
                    }}
                  >
                    Rather email?
                  </span>
                  <p
                    style={{
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: "rgba(250, 250, 248, 0.78)",
                    }}
                  >
                    Reach us directly at{" "}
                    <a
                      href="mailto:hello@creatorcircuit.com"
                      style={{
                        color: "var(--cc-canvas)",
                        borderBottom: "1px solid rgba(250, 250, 248, 0.4)",
                      }}
                    >
                      hello@creatorcircuit.com
                    </a>
                    . Press inquiries go to{" "}
                    <a
                      href="mailto:press@creatorcircuit.com"
                      style={{
                        color: "var(--cc-canvas)",
                        borderBottom: "1px solid rgba(250, 250, 248, 0.4)",
                      }}
                    >
                      press@creatorcircuit.com
                    </a>
                    .
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
