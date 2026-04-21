import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";

export type LegalSection = {
  heading: string;
  body: React.ReactNode;
};

type Props = {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  intro: React.ReactNode;
  sections: LegalSection[];
};

export function LegalPage({ eyebrow, title, lastUpdated, intro, sections }: Props) {
  return (
    <MarketingSection spacing="tight" className="pt-12 sm:pt-16">
      <MarketingContainer size="default">
        <div className="max-w-2xl">
          <MarketingEyebrow>{eyebrow}</MarketingEyebrow>
          <h1
            className="plt-display mt-5 text-[2.25rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.75rem]"
            style={{ color: "var(--plt-ink)" }}
          >
            {title}
          </h1>
          <p
            className="mt-4 plt-mono text-[0.75rem] uppercase tracking-[0.22em]"
            style={{ color: "var(--plt-muted)" }}
          >
            Last updated · {lastUpdated}
          </p>
          <div
            className="mt-6 text-[1rem] leading-[1.65]"
            style={{ color: "var(--plt-ink-soft)" }}
          >
            {intro}
          </div>
        </div>

        <div
          className="relative mt-12 overflow-hidden rounded-[28px] border p-8 sm:p-10"
          style={{
            background: "var(--plt-bg-elevated)",
            borderColor: "var(--plt-hairline)",
            boxShadow: "0 28px 64px -40px rgba(15,23,20,0.18)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, var(--plt-forest) 50%, transparent 100%)",
              opacity: 0.35,
            }}
          />
          <div className="prose-platform">
            {sections.map((s, i) => (
              <section
                key={s.heading}
                className={i > 0 ? "mt-10 border-t pt-10" : ""}
                style={i > 0 ? { borderColor: "var(--plt-hairline)" } : undefined}
              >
                <div className="flex items-baseline gap-4">
                  <span
                    aria-hidden
                    className="plt-mono text-[0.6875rem] tracking-[0.24em]"
                    style={{ color: "var(--plt-forest)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2
                    className="plt-display text-[1.375rem] font-medium leading-[1.2] tracking-[-0.02em]"
                    style={{ color: "var(--plt-ink)" }}
                  >
                    {s.heading}
                  </h2>
                </div>
                <div
                  className="mt-3 space-y-3 pl-[34px] text-[0.9375rem] leading-[1.7]"
                  style={{ color: "var(--plt-ink-soft)" }}
                >
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}
