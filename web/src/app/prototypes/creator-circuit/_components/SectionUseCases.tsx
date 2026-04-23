import { USE_CASES } from "../_data/campaigns";
import { Eyebrow } from "./Eyebrow";
import { useCaseIcon } from "./icons";
import { Reveal } from "./Reveal";

const TINT_MAP: Record<string, string> = {
  violet: "cc-chip--violet",
  coral: "cc-chip--coral",
  lime: "cc-chip--lime",
  sky: "cc-chip--sky",
  default: "",
};

export function SectionUseCases() {
  return (
    <section className="cc-section">
      <div className="cc-shell">
        <div className="cc-section-head">
          <Reveal>
            <Eyebrow tone="accent">What we&apos;re used for</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h2 className="cc-section-title">
              One roster — <em>every kind of campaign</em>.
            </h2>
          </Reveal>
          <Reveal delay={2}>
            <p className="cc-section-sub">
              From UGC ad libraries to hotel takeovers, the same curated roster
              powers radically different campaign shapes.
            </p>
          </Reveal>
        </div>

        <div className="cc-grid-use-cases">
          {USE_CASES.map((uc, i) => (
            <Reveal key={uc.key} delay={(i % 3) as 0 | 1 | 2}>
              <article className="cc-use-case">
                <div
                  className="cc-use-case__icon"
                  style={{
                    background:
                      uc.tint === "violet"
                        ? "var(--cc-violet-soft)"
                        : uc.tint === "coral"
                          ? "var(--cc-coral-soft)"
                          : uc.tint === "lime"
                            ? "var(--cc-lime-soft)"
                            : uc.tint === "sky"
                              ? "var(--cc-sky-soft)"
                              : "var(--cc-surface-warm)",
                    color:
                      uc.tint === "violet"
                        ? "var(--cc-violet-deep)"
                        : uc.tint === "coral"
                          ? "#881337"
                          : uc.tint === "lime"
                            ? "#365314"
                            : uc.tint === "sky"
                              ? "#075985"
                              : "var(--cc-ink)",
                  }}
                >
                  {useCaseIcon(uc.iconKey, 22)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <h3 style={{ fontSize: 20, letterSpacing: "-0.02em" }}>{uc.title}</h3>
                  <p style={{ fontSize: 14, color: "var(--cc-muted)", lineHeight: 1.5 }}>
                    {uc.copy}
                  </p>
                </div>
                <span
                  className={`cc-chip cc-chip--micro ${TINT_MAP[uc.tint] ?? ""}`}
                  style={{ alignSelf: "flex-start" }}
                >
                  Use case
                </span>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
