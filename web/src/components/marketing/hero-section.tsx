import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MarketingContainer, MarketingEyebrow } from "./container";
import { MarketingCta } from "./cta-link";
import { TalentModalTrigger } from "./talent-register-modal";
import {
  HomepageClaimCard,
  type HomepageClaimSignedIn,
} from "./homepage-claim-card";

export function HeroSection({
  signedIn,
}: {
  signedIn?: HomepageClaimSignedIn | null;
}) {
  return (
    <section className="relative overflow-hidden pt-10 sm:pt-16 md:pt-20">
      <HeroBackdrop />
      <MarketingContainer size="wide" className="relative">
        <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-14 lg:gap-20">
          <div className="relative">
            <MarketingEyebrow className="mkt-rise">
              The talent business platform
            </MarketingEyebrow>

            <h1
              className="plt-display mkt-rise mkt-rise-delay-1 mt-5 text-[2.75rem] sm:text-[3.5rem] lg:text-[4.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              <span className="block">Run your talent business</span>
              <span className="block" style={{ color: "var(--plt-forest)" }}>
                like one.
              </span>
            </h1>

            <p
              className="mkt-rise mkt-rise-delay-2 mt-6 max-w-[36rem] text-[1.0625rem] leading-[1.6] sm:text-[1.125rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              {PLATFORM_BRAND.name} is a branded storefront, a structured booking
              pipeline, and a shared discovery network — built for agencies, coordinators,
              and independents whose business is the people they represent. One place
              your roster lives, your inquiries land, and your bookings close.
            </p>

            <div className="mkt-rise mkt-rise-delay-3 mt-8 flex flex-wrap items-center gap-3">
              <MarketingCta
                href="/get-started"
                variant="primary"
                size="lg"
                eventSource="home-hero"
                eventIntent="get-started"
              >
                Start free
              </MarketingCta>
              <MarketingCta
                href="/how-it-works"
                variant="secondary"
                size="lg"
                eventSource="home-hero"
                eventIntent="learn"
              >
                See how it works
              </MarketingCta>
            </div>

            <p
              className="mkt-rise mkt-rise-delay-4 mt-5 text-[0.8125rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              Are you talent?{" "}
              <TalentModalTrigger
                className="font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
                style={{ color: "var(--plt-ink-soft)" }}
              >
                Join the platform here
              </TalentModalTrigger>
            </p>

            <ul
              className="mkt-rise mkt-rise-delay-4 mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              <li className="inline-flex items-center gap-2">
                <TrustTick /> Free plan · your own subdomain
              </li>
              <li className="inline-flex items-center gap-2">
                <TrustTick /> No credit card
              </li>
              <li className="inline-flex items-center gap-2">
                <TrustTick /> Bring your own domain any time
              </li>
            </ul>
          </div>

          <div id="claim-workspace" className="relative mkt-rise mkt-rise-delay-3">
            <HomepageClaimCard signedIn={signedIn} />
          </div>
        </div>
      </MarketingContainer>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Deep forest wash from top-left — anchors the brand accent. */}
        <div
          className="absolute -left-32 top-[-12%] h-[44rem] w-[44rem] rounded-full opacity-[0.55] blur-[130px]"
          style={{
            background:
              "radial-gradient(closest-side, rgba(30,58,45,0.22), rgba(244,239,230,0))",
          }}
        />
        {/* Clay warmth at mid-right — editorial, not brand. Softens the composition. */}
        <div
          className="absolute right-[-14%] top-[22%] h-[34rem] w-[34rem] rounded-full opacity-[0.35] blur-[150px]"
          style={{
            background:
              "radial-gradient(closest-side, rgba(179,136,107,0.18), rgba(244,239,230,0))",
          }}
        />
        {/* Sage wash low-left — keeps the bottom of the hero from feeling empty. */}
        <div
          className="absolute -left-20 bottom-[-40%] h-[30rem] w-[30rem] rounded-full opacity-[0.3] blur-[140px]"
          style={{
            background:
              "radial-gradient(closest-side, rgba(138,144,123,0.22), rgba(244,239,230,0))",
          }}
        />
      </div>
      <div aria-hidden className="plt-grain absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px"
        style={{ background: "var(--plt-hairline)" }}
      />
    </>
  );
}

function TrustTick() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="6.25" stroke="var(--plt-forest)" strokeWidth="1.2" />
      <path
        d="M4.5 7.25L6.2 9L9.5 5.5"
        stroke="var(--plt-forest)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
