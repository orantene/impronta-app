import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";

type Step = {
  index: string;
  title: string;
  body: string;
  highlight: string;
};

const STEPS: Step[] = [
  {
    index: "01",
    title: "Claim your roster site.",
    body:
      "Sign up, add the people you represent — one, ten, or forty — and upload their work. Get a branded roster site on our domain, or bring your own when you upgrade.",
    highlight: `${PLATFORM_BRAND.domain}/your-roster`,
  },
  {
    index: "02",
    title: "Share it everywhere.",
    body:
      "Paste it into DMs, email signatures, bios, and proposals. Clients see a real directory, not three attached photos.",
    highlight: "One link. Everywhere.",
  },
  {
    index: "03",
    title: "Inquiries come to you.",
    body:
      "Structured inquiries land in your inbox — not another chat thread. Review, respond, and turn them into real bookings.",
    highlight: "Inquiry → Offer → Booking",
  },
];

export function HowItWorksSection() {
  return (
    <MarketingSection
      id="how-it-works"
      className="relative"
      style={{ background: "var(--mkt-surface)" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--mkt-hairline)" }}
      />
      <MarketingContainer size="wide">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <MarketingEyebrow>How it works</MarketingEyebrow>
            <h2
              className="mkt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
              style={{ color: "var(--mkt-ink)" }}
            >
              Three steps from WhatsApp
              <br />
              to a real business.
            </h2>
          </div>
          <p
            className="max-w-sm text-[1rem] leading-[1.6]"
            style={{ color: "var(--mkt-muted)" }}
          >
            Most coordinators are running a business with tools built for personal chat.
            {` ${PLATFORM_BRAND.name} gives you the structure without the overhead.`}
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3 md:gap-6 lg:gap-8">
          {STEPS.map((step, i) => (
            <StepCard key={step.index} step={step} isLast={i === STEPS.length - 1} />
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3">
          <MarketingCta
            href="/how-it-works"
            variant="secondary"
            size="md"
            eventSource="home-how-it-works"
            eventIntent="learn"
          >
            The full walkthrough
          </MarketingCta>
          <MarketingCta
            href="/get-started"
            variant="inline"
            size="md"
            eventSource="home-how-it-works"
            eventIntent="get-started"
          >
            Or skip ahead — start free
          </MarketingCta>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function StepCard({ step, isLast }: { step: Step; isLast: boolean }) {
  return (
    <div className="relative">
      <div
        className="relative h-full overflow-hidden rounded-[24px] p-7 sm:p-8"
        style={{
          background: "var(--mkt-cream)",
          border: "1px solid var(--mkt-hairline)",
        }}
      >
        <div className="flex items-start justify-between">
          <span
            className="mkt-numeral text-[3.25rem] leading-none"
            style={{
              background:
                "linear-gradient(160deg, var(--plt-forest) 0%, rgba(15,23,20,0.55) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {step.index}
          </span>
          {!isLast ? (
            <svg
              aria-hidden
              width="20"
              height="12"
              viewBox="0 0 20 12"
              fill="none"
              className="mt-6"
            >
              <path
                d="M1 6H18M18 6L13 1M18 6L13 11"
                stroke="var(--mkt-muted-soft)"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </div>

        <h3
          className="mkt-display mt-8 text-[1.625rem] font-medium leading-[1.1] tracking-[-0.02em]"
          style={{ color: "var(--mkt-ink)" }}
        >
          {step.title}
        </h3>
        <p
          className="mt-4 text-[0.9375rem] leading-[1.6]"
          style={{ color: "var(--mkt-muted)" }}
        >
          {step.body}
        </p>

        <div
          className="mt-8 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[0.75rem] font-medium"
          style={{
            borderColor: "var(--mkt-hairline-strong)",
            background: "var(--mkt-surface-raised)",
            color: "var(--mkt-ink-soft)",
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--plt-forest)" }}
            aria-hidden
          />
          {step.highlight}
        </div>
      </div>
    </div>
  );
}
