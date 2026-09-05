"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MARKETING_PHOTOS, type MarketingPhoto } from "@/lib/marketing/photography";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { MarketingContainer } from "./container";
import { MarketingCta } from "./cta-link";
import { OpenTalentModalButton } from "./open-talent-modal-button";

/** Full-bleed hero slider: rotates through the breadth of talent the platform serves. */
const SLIDES: MarketingPhoto[] = [
  MARKETING_PHOTOS.heroServices,
  MARKETING_PHOTOS.modelsRunway,
  MARKETING_PHOTOS.heroPerform,
  MARKETING_PHOTOS.modelsParty,
  MARKETING_PHOTOS.heroBusiness,
  MARKETING_PHOTOS.hostsRestaurant,
  MARKETING_PHOTOS.heroService,
];

export function HeroSection({ locale }: { locale: string }) {
  const copy = getMarketingCopy(locale).hero;
  const [active, setActive] = useState(0);
  // Slides 2..7 are full-bleed and absolutely positioned, so `loading="lazy"`
  // does NOT defer them: they are inside the viewport and download immediately,
  // starving the LCP image (measured 14.6s mobile LCP, 44% of it load delay).
  // Ship only the first slide in the initial HTML and mount the rest after
  // hydration; the carousel does not advance for 5.5s, so nothing is lost.
  const [carouselReady, setCarouselReady] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setCarouselReady(true);
    const t = setInterval(() => setActive((p) => (p + 1) % SLIDES.length), 5500);
    return () => clearInterval(t);
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Horizontal swipe only; don't hijack vertical page scroll.
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      setActive((p) =>
        dx < 0 ? (p + 1) % SLIDES.length : (p - 1 + SLIDES.length) % SLIDES.length,
      );
    }
    touchStart.current = null;
  };

  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ background: "#0a1d16" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Full-bleed background slider */}
      <div aria-hidden className="absolute inset-0">
        {SLIDES.map((photo, idx) =>
          idx > 0 && !carouselReady ? null : (
            // next/image, not a raw <img>: these are full-bleed local JPEGs
            // (the LCP one is 303 KB at source). Through the optimizer the same
            // frame is ~22 KB of AVIF at mobile width, which is the difference
            // between a fast hero and a 12s LCP. Quality is left at the default
            // 75, the only value `images.qualities` allows.
            <Image
              key={photo.key}
              src={photo.url()}
              alt=""
              fill
              sizes="100vw"
              priority={idx === 0}
              className="object-cover transition-opacity ease-out"
              style={{
                opacity: idx === active ? 1 : 0,
                transitionDuration: "1200ms",
                objectPosition: "50% 36%",
              }}
            />
          ),
        )}
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
          <span
            className="plt-eyebrow mkt-rise"
            style={{ color: "var(--plt-accent)" }}
          >
            {copy.eyebrow}
          </span>

          <h1
            className="plt-display mkt-rise mkt-rise-delay-1 mt-5 text-[3rem] font-semibold leading-[0.95] tracking-[-0.03em] sm:text-[4.25rem] lg:text-[5.25rem]"
            style={{ color: "var(--plt-on-inverse)" }}
          >
            <span className="block">{copy.titleLine1}</span>
            <span
              className="block"
              style={{
                background: "linear-gradient(110deg, #e8f1ea 0%, #bcdcc9 45%, #6fa489 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {copy.titleLine2}
            </span>
          </h1>

          <p
            className="mkt-rise mkt-rise-delay-2 mt-6 max-w-[33rem] text-[1.0625rem] leading-[1.6] sm:text-[1.1875rem]"
            style={{ color: "rgba(241,237,227,0.82)" }}
          >
            {copy.subhead}
          </p>

          <div className="mkt-rise mkt-rise-delay-3 mt-8 flex flex-wrap items-center gap-3">
            <OpenTalentModalButton
              eventSource="home-hero"
              className="inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium leading-none transition-transform duration-200 hover:-translate-y-[1px]"
              style={{ background: "var(--plt-on-inverse)", color: "var(--plt-forest)" }}
            >
              {copy.ctaTalent}
            </OpenTalentModalButton>
            <MarketingCta
              href={withLocaleHref("/get-started", locale)}
              variant="secondary"
              size="lg"
              eventSource="home-hero"
              eventIntent="start-business"
              className="!border-[rgba(241,237,227,0.34)] !bg-transparent !text-[var(--plt-on-inverse)] hover:!border-[var(--plt-on-inverse)] hover:!bg-[rgba(241,237,227,0.08)]"
            >
              {copy.ctaBusiness}
            </MarketingCta>
          </div>

          <ul className="mkt-rise mkt-rise-delay-4 mt-7 flex flex-wrap items-center gap-x-5 gap-y-2">
            {copy.trust.map((t) => (
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

      {/* Floating booking card, synced to the active slide */}
      <BookingAccent index={active} locale={locale} />

      {/* Slide indicators */}
      <div className="absolute inset-x-0 bottom-4 z-10 flex items-center justify-center gap-0.5">
        {SLIDES.map((photo, idx) => (
          <button
            key={photo.key}
            type="button"
            onClick={() => setActive(idx)}
            aria-label={`Show slide ${idx + 1}`}
            aria-current={idx === active}
            className="flex items-center justify-center px-1.5 py-3"
          >
            <span
              className="block h-1.5 rounded-full transition-all duration-300"
              style={{
                width: idx === active ? "24px" : "7px",
                background: idx === active ? "var(--plt-on-inverse)" : "rgba(241,237,227,0.42)",
              }}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

type BookingTone = "paid" | "new" | "sent";
type BookingCard = {
  label: string;
  status: string;
  tone: BookingTone;
  amount: string;
  who: string;
  when: string;
};

/** One booking per slide: the card mirrors the talent on screen (same order as SLIDES). */
function getBookingCards(locale: string): BookingCard[] {
  return pickLocale(locale, {
    en: [
      { label: "Booking paid", status: "Paid", tone: "paid", amount: "$1,400", who: "Mateo · Private chef", when: "Saturday · 8 guests" },
      { label: "Booking paid", status: "Paid", tone: "paid", amount: "$2,500", who: "Léa & Marco · Runway", when: "Fashion week · Sat" },
      { label: "New booking", status: "New", tone: "new", amount: "$900", who: "Daniela · DJ set", when: "Friday · 9pm–1am" },
      { label: "New booking", status: "New", tone: "new", amount: "$1,800", who: "Brand launch · 3 models", when: "Friday night" },
      { label: "Offer sent", status: "Sent", tone: "sent", amount: "$1,600", who: "Casa Rizo · Event bar", when: "Awaiting reply" },
      { label: "Booking paid", status: "Paid", tone: "paid", amount: "$640", who: "Tomás · Event host", when: "Dinner · 6 hrs" },
      { label: "Booking paid", status: "Paid", tone: "paid", amount: "$140", who: "Renata · Massage", when: "Today · 4pm" },
    ],
    es: [
      { label: "Reserva pagada", status: "Pagado", tone: "paid", amount: "$1,400", who: "Mateo · Chef privado", when: "Sábado · 8 invitados" },
      { label: "Reserva pagada", status: "Pagado", tone: "paid", amount: "$2,500", who: "Léa y Marco · Pasarela", when: "Fashion week · Sáb" },
      { label: "Nueva reserva", status: "Nueva", tone: "new", amount: "$900", who: "Daniela · Set de DJ", when: "Viernes · 9pm–1am" },
      { label: "Nueva reserva", status: "Nueva", tone: "new", amount: "$1,800", who: "Lanzamiento de marca · 3 modelos", when: "Viernes en la noche" },
      { label: "Oferta enviada", status: "Enviada", tone: "sent", amount: "$1,600", who: "Casa Rizo · Bar de evento", when: "Esperando respuesta" },
      { label: "Reserva pagada", status: "Pagado", tone: "paid", amount: "$640", who: "Tomás · Anfitrión", when: "Cena · 6 h" },
      { label: "Reserva pagada", status: "Pagado", tone: "paid", amount: "$140", who: "Renata · Masaje", when: "Hoy · 4pm" },
    ],
  });
}

const STATUS_TONES: Record<BookingTone, { bg: string; fg: string }> = {
  paid: { bg: "var(--tl-positive-bg)", fg: "var(--tl-positive)" },
  new: { bg: "rgba(46,107,82,0.16)", fg: "var(--plt-forest)" },
  sent: { bg: "rgba(15,23,20,0.07)", fg: "var(--plt-ink-soft)" },
};

function BookingAccent({ index, locale }: { index: number; locale: string }) {
  const cards = getBookingCards(locale);
  const card = cards[index % cards.length];
  const tone = STATUS_TONES[card.tone];
  return (
    <div
      className="pointer-events-none absolute right-[5%] top-1/2 z-10 hidden w-[234px] -translate-y-1/2 rotate-[3deg] rounded-2xl p-4 lg:block"
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
          {card.label}
        </span>
        <span
          className="plt-mono inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-[0.12em]"
          style={{ background: tone.bg, color: tone.fg }}
        >
          <span className="inline-block h-1 w-1 rounded-full" style={{ background: tone.fg }} />
          {card.status}
        </span>
      </div>
      <div
        className="plt-display mt-2.5 text-[1.625rem] font-semibold leading-none tracking-[-0.02em]"
        style={{ color: "var(--plt-ink)" }}
      >
        {card.amount}
      </div>
      <div className="mt-2 text-[0.8125rem] font-medium" style={{ color: "var(--plt-ink-soft)" }}>
        {card.who}
      </div>
      <div className="mt-0.5 text-[0.75rem]" style={{ color: "var(--plt-muted)" }}>
        {card.when}
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
