import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { MarketingContainer, MarketingEyebrow } from "./container";
import { MarketingCta } from "./cta-link";

const TALENT_REGISTER_HREF = "/talent/register?next=/talent/profile/fields";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pb-16 pt-12 sm:pb-20 sm:pt-16 md:pt-20">
      <HeroBackdrop />
      <MarketingContainer size="wide" className="relative">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:gap-16">
          <div className="relative">
            <MarketingEyebrow className="mkt-rise">
              Talent businesses start here
            </MarketingEyebrow>

            <h1
              className="plt-display mkt-rise mkt-rise-delay-1 mt-5 max-w-[40rem] text-[2.9rem] font-semibold leading-[0.98] sm:text-[4rem] lg:text-[4.75rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              <span className="block">Your talent is</span>
              <span className="block" style={{ color: "var(--plt-forest)" }}>
                worth money.
              </span>
            </h1>

            <p
              className="mkt-rise mkt-rise-delay-2 mt-6 max-w-[34rem] text-[1.0625rem] leading-[1.6] sm:text-[1.125rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              Open a free Tulala page, show what you do, and start taking
              requests. Upgrade when you want a personal site, reservations, or
              a full workspace for your agency.
            </p>

            <div className="mkt-rise mkt-rise-delay-3 mt-8 flex flex-wrap items-center gap-3">
              <a
                href={TALENT_REGISTER_HREF}
                className="inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium leading-none transition-[background,transform,box-shadow] duration-200 hover:-translate-y-[1px]"
                style={{
                  background: "var(--plt-forest)",
                  color: "var(--plt-forest-on)",
                  boxShadow: "var(--plt-shadow-forest)",
                }}
              >
                Join as talent free
              </a>
              <MarketingCta
                href="/discover-agencies"
                variant="secondary"
                size="lg"
                eventSource="home-hero"
                eventIntent="discover-agencies"
              >
                Browse agencies & hubs
              </MarketingCta>
            </div>

            <p
              className="mkt-rise mkt-rise-delay-4 mt-5 max-w-[30rem] text-[0.875rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              Free page first. Paid tools when you are ready.
            </p>
          </div>

          <HeroVisual />
        </div>
      </MarketingContainer>
    </section>
  );
}

function HeroVisual() {
  return (
    <figure
      className="relative min-h-[24rem] overflow-hidden rounded-[30px] mkt-rise mkt-rise-delay-3 sm:min-h-[33rem]"
      style={{
        background: "var(--plt-bg-deep)",
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow: "0 48px 96px -52px rgba(15,23,20,0.42)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={MARKETING_PHOTOS.heroServices.url()}
        alt={MARKETING_PHOTOS.heroServices.alt}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(15,23,20,0.46) 0%, rgba(15,23,20,0.08) 46%, rgba(15,23,20,0.22) 100%)",
        }}
      />
      <div aria-hidden className="plt-grain pointer-events-none absolute inset-0 opacity-[0.14]" />
      <figcaption className="absolute inset-x-5 bottom-5 max-w-[29rem] sm:inset-x-8 sm:bottom-8">
        <span
          className="plt-mono text-[0.6875rem] font-medium uppercase"
          style={{ color: "rgba(241,237,227,0.72)" }}
        >
          Real services, real requests
        </span>
        <p
          className="plt-display mt-2 text-[1.7rem] font-semibold leading-[1.08] sm:text-[2.25rem]"
          style={{ color: "var(--plt-on-inverse)" }}
        >
          Cleaner, chef, beauty pro, performer. One place to start selling.
        </p>
      </figcaption>
    </figure>
  );
}

function HeroBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(180deg, rgba(244,239,230,0.94) 0%, rgba(244,239,230,0.72) 54%, rgba(255,253,248,0.96) 100%)",
        }}
      />
      <div aria-hidden className="plt-grain absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px"
        style={{ background: "var(--plt-hairline)" }}
      />
    </>
  );
}
