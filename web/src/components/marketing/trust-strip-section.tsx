import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MarketingContainer, MarketingSection } from "./container";

type Principle = {
  title: string;
  detail: string;
};

const PRINCIPLES: Principle[] = [
  {
    title: "Built alongside real operators",
    detail:
      "Every feature starts as a coordination problem we watched happen in a WhatsApp thread, a missed booking, or a screenshot that got lost.",
  },
  {
    title: "Your roster, your data",
    detail:
      "Portable, exportable, never locked in. Custom domain on paid plans. No growth-hack dark patterns.",
  },
  {
    title: "Honest about the stage",
    detail:
      "Private beta. Small group. We onboard signups by hand so each roster gets set up properly — not a fake launch metric in sight.",
  },
];

export function TrustStripSection() {
  return (
    <MarketingSection
      spacing="tight"
      className="relative"
      style={{
        background: "var(--plt-bg-inverse)",
        color: "var(--plt-on-inverse)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 20%, rgba(94,161,129,0.22), transparent 45%), radial-gradient(circle at 85% 80%, rgba(46,107,82,0.2), transparent 50%)",
        }}
      />
      <MarketingContainer size="wide" className="relative">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-16">
          <div>
            <span
              className="plt-mono inline-flex items-center gap-2 text-[0.6875rem] font-medium uppercase tracking-[0.22em]"
              style={{ color: "rgba(241,237,227,0.6)" }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "#5EA181" }}
                aria-hidden
              />
              {PLATFORM_BRAND.stage} · founder-led
            </span>
            <h2
              className="plt-display mt-5 text-[1.875rem] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[2.25rem]"
              style={{ color: "var(--plt-on-inverse)" }}
            >
              No fake logos.
              <br />
              No inflated metrics.
            </h2>
            <p
              className="mt-5 max-w-md text-[0.9375rem] leading-[1.6]"
              style={{ color: "rgba(241,237,227,0.76)" }}
            >
              {PLATFORM_BRAND.name} is in early access with a small group of representation
              agencies, independent operators, and staffing teams. Each signup is onboarded by
              a human so the roster is properly set up before the link is shared.
            </p>
            <p
              className="mt-5 max-w-md text-[0.8125rem] leading-[1.5]"
              style={{ color: "rgba(241,237,227,0.55)" }}
            >
              — Oran, founder · {PLATFORM_BRAND.name}
            </p>
          </div>

          <div
            className="grid gap-px overflow-hidden rounded-[24px] sm:grid-cols-1"
            style={{
              background: "rgba(241,237,227,0.08)",
              border: "1px solid rgba(241,237,227,0.08)",
            }}
          >
            {PRINCIPLES.map((p) => (
              <div
                key={p.title}
                className="flex flex-col gap-3 p-7 sm:p-8"
                style={{ background: "var(--plt-bg-inverse)" }}
              >
                <span
                  className="plt-display text-[1rem] font-semibold tracking-[-0.01em]"
                  style={{ color: "#9ec9b2" }}
                >
                  {p.title}
                </span>
                <span
                  className="text-[0.9375rem] leading-[1.55]"
                  style={{ color: "rgba(241,237,227,0.76)" }}
                >
                  {p.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}
