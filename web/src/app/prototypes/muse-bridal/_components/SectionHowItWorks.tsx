import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

/**
 * 4-step process block.
 *
 * CMS → Process Section:
 *   - layout_variant: `numbered-column` (this one) | `horizontal-timeline` |
 *     `alternating-image`
 *   - items[]: { number, label, detail, icon_key? }
 *   - number_style: `serif-italic` | `sans-large` | `roman`
 */

type Step = { label: string; detail: string };

export function SectionHowItWorks({
  steps,
  eyebrow,
  title,
}: {
  steps: Step[];
  eyebrow: string;
  title: React.ReactNode;
}) {
  return (
    <section
      className="muse-section"
      style={{ background: "var(--muse-champagne-soft)" }}
    >
      <div className="muse-shell">
        <Reveal style={{ textAlign: "center", marginBottom: 64 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2
            style={{
              fontSize: "clamp(36px, 5vw, 60px)",
              marginTop: 18,
              maxWidth: 720,
              marginInline: "auto",
            }}
          >
            {title}
          </h2>
        </Reveal>

        <div
          style={{
            display: "grid",
            gap: 28,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {steps.map((s, i) => (
            <Reveal
              key={s.label}
              delay={(i % 4) as 0 | 1 | 2 | 3}
              style={{
                padding: "32px 28px 36px",
                background: "var(--muse-ivory)",
                borderRadius: "var(--muse-radius)",
                border: "1px solid var(--muse-line-soft)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                position: "relative",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--muse-font-display)",
                  fontStyle: "italic",
                  fontWeight: 300,
                  fontSize: 42,
                  color: "var(--muse-blush)",
                  lineHeight: 1,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div
                aria-hidden
                style={{
                  width: 32,
                  height: 1,
                  background: "var(--muse-espresso)",
                  opacity: 0.25,
                }}
              />
              <h3
                style={{
                  fontSize: 22,
                  fontFamily: "var(--muse-font-display)",
                  color: "var(--muse-espresso-deep)",
                }}
              >
                {s.label}
              </h3>
              <p style={{ fontSize: 14.5 }}>{s.detail}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
