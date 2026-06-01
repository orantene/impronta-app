"use client";

import { useEffect, useState } from "react";
import { MARKETING_PHOTOS, type MarketingPhoto } from "@/lib/marketing/photography";
import { MarketingContainer, MarketingEyebrow } from "./container";
import { MarketingCta } from "./cta-link";
import { OpenTalentModalButton } from "./open-talent-modal-button";

/** Full-bleed hero slider — rotates through the breadth of talent the platform serves. */
const SLIDES: MarketingPhoto[] = [
  MARKETING_PHOTOS.heroServices,
  MARKETING_PHOTOS.heroPerform,
  MARKETING_PHOTOS.heroBusiness,
  MARKETING_PHOTOS.heroService,
];

const TRUST = ["Free forever", "No code", "Bookings & payments built in"];

export function HeroSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive((p) => (p + 1) % SLIDES.length), 5500);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative w-full overflow-hidden" style={{ background: "#0a1d16" }}>
      {/* Full-bleed background slider */}
      <div aria-hidden className="absolute inset-0">
        {SLIDES.map((photo, idx) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={photo.key}
            src={photo.url()}
            alt=""
            loading={idx === 0 ? "eager" : "lazy"}
            fetchPriority={idx === 0 ? "high" : "auto"}
            className="absolute inset-0 h-full w-full object-cover transition-opacity ease-out"
            style={{ opacity: idx === active ? 1 : 0, transitionDuration: "1200ms" }}
          />
        ))}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(100deg, rgba(8,18,14,0.96) 0%, rgba(8,18,14,0.9) 32%, rgba(8,18,14,0.66) 52%, rgba(8,18,14,0.34) 74%, rgba(8,18,14,0.5) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,18,14,0.35) 0%, transparent 24%, transparent 70%, rgba(8,18,14,0.4) 100%)",
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-44"
          style={{ background: "linear-gradient(180deg, transparent, rgba(8,18,14,0.55))" }}
        />
        <div className="plt-grain absolute inset-0 opacity-[0.15]" />
      </div>

      {/* Content */}
      <MarketingContainer size="wide" className="relative">
        <div className="max-w-[40rem] py-24 sm:py-32 lg:py-44">
          <MarketingEyebrow tone="inverse" className="mkt-rise">
            The talent business platform
          </MarketingEyebrow>

          <h1
            className="plt-display mkt-rise mkt-rise-delay-1 mt-5 text-[3rem] font-semibold leading-[0.95] tracking-[-0.03em] sm:text-[4.25rem] lg:text-[5.25rem]"
            style={{ color: "var(--plt-on-inverse)" }}
          >
            <span className="block">Your talent is</span>
            <span
              className="block"
              style={{
                background: "linear-gradient(110deg, #e8f1ea 0%, #bcdcc9 45%, #6fa489 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              worth money.
            </span>
          </h1>

          <p
            className="mkt-rise mkt-rise-delay-2 mt-6 max-w-[33rem] text-[1.0625rem] leading-[1.6] sm:text-[1.1875rem]"
            style={{ color: "rgba(241,237,227,0.82)" }}
          >
            Open a free page and start taking requests in minutes. When you&rsquo;re
            ready, build your own site and business workspace in one click &mdash; and
            take bookings and payments right inside the chat.
          </p>

          <div className="mkt-rise mkt-rise-delay-3 mt-8 flex flex-wrap items-center gap-3">
            <OpenTalentModalButton
              eventSource="home-hero"
              className="inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium leading-none transition-transform duration-200 hover:-translate-y-[1px]"
              style={{ background: "var(--plt-on-inverse)", color: "var(--plt-forest)" }}
            >
              Sell your work — free
            </OpenTalentModalButton>
            <MarketingCta
              href="/get-started"
              variant="secondary"
              size="lg"
              eventSource="home-hero"
              eventIntent="start-business"
              className="!border-[rgba(241,237,227,0.34)] !bg-transparent !text-[var(--plt-on-inverse)] hover:!border-[var(--plt-on-inverse)] hover:!bg-[rgba(241,237,227,0.08)]"
            >
              Start a business
            </MarketingCta>
          </div>

          <ul className="mkt-rise mkt-rise-delay-4 mt-7 flex flex-wrap items-center gap-x-5 gap-y-2">
            {TRUST.map((t) => (
              <li
                key={t}
                className="inline-flex items-center gap-1.5 text-[0.8125rem]"
                style={{ color: "rgba(241,237,227,0.72)" }}
              >
                <TrustTick />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </MarketingContainer>

      {/* Floating outcome card — the headline, made literal */}
      <BookingAccent />

      {/* Slide indicators */}
      <div className="absolute inset-x-0 bottom-6 z-10 flex items-center justify-center gap-2">
        {SLIDES.map((photo, idx) => (
          <button
            key={photo.key}
            type="button"
            onClick={() => setActive(idx)}
            aria-label={`Show slide ${idx + 1}`}
            aria-current={idx === active}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: idx === active ? "24px" : "7px",
              background: idx === active ? "var(--plt-on-inverse)" : "rgba(241,237,227,0.42)",
            }}
          />
        ))}
      </div>
    </section>
  );
}

function BookingAccent() {
  return (
    <div
      className="pointer-events-none absolute right-[5%] top-1/2 z-10 hidden w-[216px] -translate-y-1/2 rotate-[3deg] rounded-2xl p-4 lg:block"
      style={{
        background: "var(--plt-bg-raised)",
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow: "0 34px 64px -24px rgba(0,0,0,0.6)",
      }}
      aria-hidden
    >
      <div className="flex items-center justify-between">
        <span
          className="plt-mono text-[0.625rem] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--plt-forest)" }}
        >
          New booking
        </span>
        <span
          className="plt-mono inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.12em]"
          style={{ background: "rgba(52,193,110,0.16)", color: "#1F7B3E" }}
        >
          <span className="inline-block h-1 w-1 rounded-full" style={{ background: "#1F7B3E" }} />
          Paid
        </span>
      </div>
      <div
        className="plt-display mt-2.5 text-[1.5rem] font-semibold leading-none tracking-[-0.02em]"
        style={{ color: "var(--plt-ink)" }}
      >
        $1,200
      </div>
      <div className="mt-1 text-[0.75rem]" style={{ color: "var(--plt-muted)" }}>
        Wedding set · Saturday
      </div>
    </div>
  );
}

function TrustTick() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="6.25" stroke="rgba(241,237,227,0.6)" strokeWidth="1.2" />
      <path
        d="M4.5 7.25L6.2 9L9.5 5.5"
        stroke="rgba(241,237,227,0.9)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
