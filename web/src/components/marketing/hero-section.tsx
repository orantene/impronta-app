import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MARKETING_PHOTOS, type MarketingPhoto } from "@/lib/marketing/photography";
import { MarketingContainer, MarketingEyebrow } from "./container";
import { MarketingCta } from "./cta-link";
import {
  HomepageClaimCard,
  type HomepageClaimSignedIn,
} from "./homepage-claim-card";

const TALENT_REGISTER_HREF = "/talent/register?next=/talent/profile/fields";

export function HeroSection({
  signedIn,
}: {
  signedIn?: HomepageClaimSignedIn | null;
}) {
  return (
    <section className="relative overflow-hidden pb-12 pt-10 sm:pb-16 sm:pt-16 md:pt-20">
      <HeroBackdrop />
      <MarketingContainer size="wide" className="relative">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14 xl:gap-16">
          <div className="relative">
            <MarketingEyebrow className="mkt-rise">
              Talent, services, bookings, money
            </MarketingEyebrow>

            <h1
              className="plt-display mkt-rise mkt-rise-delay-1 mt-5 max-w-[42rem] text-[2.7rem] font-semibold leading-[0.98] sm:text-[3.65rem] lg:text-[4.6rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              <span className="block">Your talent is</span>
              <span className="block" style={{ color: "var(--plt-forest)" }}>
                worth money.
              </span>
            </h1>

            <p
              className="mkt-rise mkt-rise-delay-2 mt-6 max-w-[37rem] text-[1.0625rem] leading-[1.6] sm:text-[1.125rem]"
              style={{ color: "var(--plt-muted)" }}
            >
              {PLATFORM_BRAND.name} helps singers, cleaners, chefs, beauty pros,
              creators, models, and specialist teams turn real work into a page,
              a booking flow, and a business clients can trust.
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
                href="/get-started?audience=agency"
                variant="secondary"
                size="lg"
                eventSource="home-hero"
                eventIntent="build-workspace"
              >
                Build workspace
              </MarketingCta>
              <MarketingCta
                href="/discover-agencies"
                variant="inline"
                size="lg"
                eventSource="home-hero"
                eventIntent="discover-agencies"
              >
                Browse agencies & hubs
              </MarketingCta>
            </div>

            <ul
              className="mkt-rise mkt-rise-delay-4 mt-8 grid max-w-[34rem] gap-2 text-[0.875rem] sm:grid-cols-2"
              style={{ color: "var(--plt-muted)" }}
            >
              <li className="inline-flex items-center gap-2">
                <TrustTick /> Free talent page
              </li>
              <li className="inline-flex items-center gap-2">
                <TrustTick /> Pro + Max personal sites
              </li>
              <li className="inline-flex items-center gap-2">
                <TrustTick /> Reservations and inquiries
              </li>
              <li className="inline-flex items-center gap-2">
                <TrustTick /> Agency and hub discovery
              </li>
            </ul>

            <div className="mkt-rise mkt-rise-delay-4 mt-8 max-w-[30rem]">
              <HomepageClaimCard signedIn={signedIn} />
            </div>
          </div>

          <HeroVisual />
        </div>
      </MarketingContainer>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="relative mkt-rise mkt-rise-delay-3">
      <figure
        className="relative min-h-[24rem] overflow-hidden rounded-[28px] sm:min-h-[31rem]"
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
              "linear-gradient(90deg, rgba(15,23,20,0.5) 0%, rgba(15,23,20,0.08) 44%, rgba(15,23,20,0.32) 100%)",
          }}
        />
        <div aria-hidden className="plt-grain pointer-events-none absolute inset-0 opacity-[0.16]" />
        <figcaption className="absolute inset-x-5 bottom-5 max-w-[27rem] sm:inset-x-7 sm:bottom-7">
          <span
            className="plt-mono text-[0.6875rem] font-medium uppercase"
            style={{ color: "rgba(241,237,227,0.72)" }}
          >
            From skill to booking
          </span>
          <p
            className="plt-display mt-2 text-[1.6rem] font-semibold leading-[1.08] sm:text-[2rem]"
            style={{ color: "var(--plt-on-inverse)" }}
          >
            Sell the service. Manage the request. Grow from one link.
          </p>
        </figcaption>
      </figure>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <HeroRouteCard
          photo={MARKETING_PHOTOS.talentBooking}
          label="For talent"
          title="Open your free page"
          body="Start visible, take requests, upgrade when you want your own premium site."
          mode="talent"
        />
        <HeroRouteCard
          photo={MARKETING_PHOTOS.agencyBuilder}
          label="For agencies"
          title="Build your workspace"
          body="Launch a site, capture inquiries, manage clients, and run the business inside Tulala."
          mode="workspace"
        />
      </div>
    </div>
  );
}

function HeroRouteCard({
  photo,
  label,
  title,
  body,
  mode,
}: {
  photo: MarketingPhoto;
  label: string;
  title: string;
  body: string;
  mode: "talent" | "workspace";
}) {
  return (
    <article
      className="group grid min-h-[13rem] overflow-hidden rounded-[24px] sm:grid-cols-[0.82fr_1fr]"
      style={{
        background: "var(--plt-bg-elevated)",
        border: "1px solid var(--plt-hairline)",
        boxShadow: "0 18px 44px -34px rgba(15,23,20,0.28)",
      }}
    >
      <div className="relative min-h-[10rem] overflow-hidden sm:min-h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url()}
          alt={photo.alt}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(180deg, transparent 20%, rgba(15,23,20,0.24) 100%)" }}
        />
      </div>
      <div className="flex min-w-0 flex-col p-5">
        <span
          className="plt-mono text-[0.625rem] font-medium uppercase"
          style={{ color: "var(--plt-forest)" }}
        >
          {label}
        </span>
        <h2
          className="plt-display mt-2 text-[1.25rem] font-semibold leading-[1.12]"
          style={{ color: "var(--plt-ink)" }}
        >
          {title}
        </h2>
        <p
          className="mt-2 text-[0.875rem] leading-[1.45]"
          style={{ color: "var(--plt-muted)" }}
        >
          {body}
        </p>
        <div className="mt-auto pt-4">
          {mode === "talent" ? (
            <a
              href={TALENT_REGISTER_HREF}
              className="text-[0.875rem] font-medium underline underline-offset-4 transition-colors hover:text-[var(--plt-forest)]"
              style={{ color: "var(--plt-ink)" }}
            >
              Join talent free
            </a>
          ) : (
            <MarketingCta
              href="/get-started?audience=agency"
              variant="inline"
              size="md"
              eventSource="home-hero-card"
              eventIntent="workspace"
            >
              Start workspace
            </MarketingCta>
          )}
        </div>
      </div>
    </article>
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
