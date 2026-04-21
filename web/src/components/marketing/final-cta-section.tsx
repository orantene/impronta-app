import { MarketingContainer, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";

export function FinalCtaSection() {
  return (
    <MarketingSection
      className="relative overflow-hidden"
      style={{ background: "var(--plt-bg)" }}
    >
      <MarketingContainer size="wide" className="relative">
        <div
          className="relative overflow-hidden rounded-[32px] px-6 py-14 text-center sm:rounded-[36px] sm:px-16 sm:py-20 md:py-24"
          style={{
            background:
              "radial-gradient(120% 120% at 50% 0%, #1f4a3a 0%, #143226 55%, #0a1d16 100%)",
            color: "var(--plt-on-inverse)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -left-24 top-[-20%] h-[32rem] w-[32rem] rounded-full opacity-55 blur-[120px]"
            style={{
              background:
                "radial-gradient(closest-side, rgba(94,161,129,0.35), rgba(20,50,38,0))",
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-24 bottom-[-30%] h-[30rem] w-[30rem] rounded-full opacity-40 blur-[140px]"
            style={{
              background:
                "radial-gradient(closest-side, rgba(46,107,82,0.4), rgba(20,50,38,0))",
            }}
          />

          <div className="relative mx-auto max-w-3xl">
            <span
              className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.24em]"
              style={{ color: "rgba(241,237,227,0.6)" }}
            >
              Start where you are. Grow as you go.
            </span>
            <h2
              className="plt-display mt-6 text-[2.25rem] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-[3.25rem] md:text-[3.75rem]"
            >
              Send one link.
              <br />
              <span
                style={{
                  background:
                    "linear-gradient(110deg, #e4f0e7 0%, #b9d9c7 45%, #5c8b76 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Run a real business.
              </span>
            </h2>
            <p
              className="mx-auto mt-6 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
              style={{ color: "rgba(241,237,227,0.76)" }}
            >
              Your roster deserves more than a chat thread. Claim your link in under ten
              minutes — no credit card, no friction, no lock-in.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <MarketingCta
                href="/get-started"
                variant="inverse"
                size="lg"
                eventSource="home-final-cta"
                eventIntent="get-started"
              >
                Start free
              </MarketingCta>
              <MarketingCta
                href="/how-it-works"
                variant="secondary"
                size="lg"
                eventSource="home-final-cta"
                eventIntent="learn"
                className="!border-[rgba(241,237,227,0.3)] !bg-transparent !text-[var(--plt-on-inverse)] hover:!bg-[rgba(241,237,227,0.08)] hover:!border-[var(--plt-on-inverse)]"
              >
                See how it works
              </MarketingCta>
            </div>

            <ul
              className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[0.8125rem]"
              style={{ color: "rgba(241,237,227,0.62)" }}
            >
              <li>Free subdomain</li>
              <li aria-hidden>·</li>
              <li>No credit card</li>
              <li aria-hidden>·</li>
              <li>Full export any time</li>
              <li aria-hidden>·</li>
              <li>Upgrade to your own domain</li>
            </ul>
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}
