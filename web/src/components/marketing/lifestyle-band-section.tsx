import { ArrowLeft, ArrowRight } from "lucide-react";
import { getAppUrl } from "@/lib/auth-flow";
import { getRequestLocale } from "@/i18n/request-locale";
import { withLocaleHref } from "@/i18n/pathnames";
import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";
import { OpenTalentModalButton } from "./open-talent-modal-button";

/**
 * Homepage workspace band — separates the agency/workspace pitch from the
 * talent-focused hero so the first viewport stays clean and directional.
 */
const SLIDES = [
  {
    id: "services",
    tab: "Sell your services",
    eyebrow: "For talent, creators, service pros",
    title: "Sell what you do from one beautiful page.",
    body:
      "Package cleaning, food, beauty, music, fitness, creative work, or any service into a page clients can trust and request.",
    photo: MARKETING_PHOTOS.servicePros,
    primary: {
      label: "Sell your services",
      // P2: `/talent/register` still works (permanent 308 into here) but a live
      // CTA should not pay for the extra hop.
      href: `${getAppUrl()}/register?as=talent&next=/talent/profile/fields`,
      intent: "sell-services",
    },
    secondary: {
      label: "Browse agencies & hubs",
      href: "/discover-agencies",
      intent: "discover-agencies",
    },
    signals: ["Free page", "Real requests", "Upgrade anytime"],
  },
  {
    id: "workspace",
    tab: "Start your business",
    eyebrow: "For agencies, studios, clinics, teams",
    title: "Build the workspace around your people.",
    body:
      "Launch a premium website, collect inquiries, manage requests, and run a real service business from one Tulala workspace.",
    photo: MARKETING_PHOTOS.agencyBuilder,
    primary: {
      label: "Start your business",
      href: "/get-started?audience=agency",
      intent: "build-workspace",
    },
    secondary: {
      label: "See agency tools",
      href: "/agencies",
      intent: "agencies",
    },
    signals: ["Premium site", "Inquiry flow", "Team workspace"],
  },
] as const;

export async function LifestyleBandSection() {
  const locale = await getRequestLocale();
  return (
    <MarketingSection spacing="tight" className="relative overflow-hidden">
      <div
        className="relative min-h-[32rem] w-full overflow-hidden py-14 sm:py-16 lg:min-h-[36rem] lg:py-20"
        style={{ background: "var(--plt-bg-deep)" }}
      >
          <input
            id="pathway-services"
            name="pathway-slider"
            type="radio"
            className="peer/services sr-only"
            defaultChecked
          />
          <input
            id="pathway-workspace"
            name="pathway-slider"
            type="radio"
            className="peer/workspace sr-only"
          />
          <style>{`
            #pathway-services:checked ~ .pathway-photo-services,
            #pathway-workspace:checked ~ .pathway-photo-workspace,
            #pathway-services:checked ~ .pathway-slide-services,
            #pathway-workspace:checked ~ .pathway-slide-workspace {
              opacity: 1;
              pointer-events: auto;
            }
            #pathway-services:checked ~ .pathway-photo-workspace,
            #pathway-workspace:checked ~ .pathway-photo-services,
            #pathway-services:checked ~ .pathway-slide-workspace,
            #pathway-workspace:checked ~ .pathway-slide-services {
              opacity: 0;
              pointer-events: none;
            }
            #pathway-services:checked ~ .pathway-controls label[for="pathway-services"],
            #pathway-workspace:checked ~ .pathway-controls label[for="pathway-workspace"] {
              background: var(--plt-on-inverse);
              color: var(--plt-forest);
              box-shadow: 0 12px 30px -20px rgba(15,23,20,0.65);
            }
            #pathway-services:checked ~ .pathway-arrows .pathway-arrow-when-services,
            #pathway-workspace:checked ~ .pathway-arrows .pathway-arrow-when-workspace {
              opacity: 1;
              pointer-events: auto;
            }
          `}</style>

          {SLIDES.map((slide) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={slide.id}
              src={slide.photo.url()}
              alt={slide.photo.alt}
              className={
                slide.id === "services"
                  ? "pathway-photo-services absolute inset-0 h-full w-full object-cover opacity-100 transition-opacity duration-700 ease-out"
                  : "pathway-photo-workspace absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 ease-out"
              }
            />
          ))}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(12,25,20,0.78) 0%, rgba(12,25,20,0.46) 45%, rgba(12,25,20,0.08) 100%)",
            }}
          />
          <div aria-hidden className="plt-grain pointer-events-none absolute inset-0 opacity-[0.18]" />

          <div className="pathway-controls absolute left-1/2 top-5 z-10 flex -translate-x-1/2 rounded-full border border-[rgba(241,237,227,0.24)] bg-[rgba(15,23,20,0.28)] p-1 shadow-[0_18px_45px_-28px_rgba(15,23,20,0.5)] backdrop-blur-md sm:top-7">
            <label
              htmlFor="pathway-services"
              className="inline-flex min-h-10 cursor-pointer items-center rounded-full px-4 text-[0.8125rem] font-medium leading-none text-[rgba(241,237,227,0.78)] transition-[background,color,box-shadow] duration-300 sm:px-5 sm:text-[0.875rem]"
            >
              {SLIDES[0].tab}
            </label>
            <label
              htmlFor="pathway-workspace"
              className="inline-flex min-h-10 cursor-pointer items-center rounded-full px-4 text-[0.8125rem] font-medium leading-none text-[rgba(241,237,227,0.78)] transition-[background,color,box-shadow] duration-300 sm:px-5 sm:text-[0.875rem]"
            >
              {SLIDES[1].tab}
            </label>
          </div>

          <div className="pathway-arrows pointer-events-none absolute inset-y-0 z-10 hidden w-full items-center justify-between px-4 sm:flex lg:px-7">
            <label
              htmlFor="pathway-workspace"
              aria-label="Previous slide"
              className="pathway-arrow-when-services pointer-events-none inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[rgba(241,237,227,0.32)] bg-[rgba(15,23,20,0.36)] text-[var(--plt-on-inverse)] opacity-0 shadow-[0_18px_40px_-26px_rgba(0,0,0,0.75)] backdrop-blur-md transition-[opacity,background,transform] duration-300 hover:-translate-x-0.5 hover:bg-[rgba(241,237,227,0.16)]"
            >
              <ArrowLeft aria-hidden size={20} strokeWidth={1.8} />
            </label>
            <label
              htmlFor="pathway-services"
              aria-label="Previous slide"
              className="pathway-arrow-when-workspace pointer-events-none absolute left-4 inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[rgba(241,237,227,0.32)] bg-[rgba(15,23,20,0.36)] text-[var(--plt-on-inverse)] opacity-0 shadow-[0_18px_40px_-26px_rgba(0,0,0,0.75)] backdrop-blur-md transition-[opacity,background,transform] duration-300 hover:-translate-x-0.5 hover:bg-[rgba(241,237,227,0.16)] lg:left-7"
            >
              <ArrowLeft aria-hidden size={20} strokeWidth={1.8} />
            </label>
            <label
              htmlFor="pathway-workspace"
              aria-label="Next slide"
              className="pathway-arrow-when-services pointer-events-none inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[rgba(241,237,227,0.32)] bg-[rgba(15,23,20,0.36)] text-[var(--plt-on-inverse)] opacity-0 shadow-[0_18px_40px_-26px_rgba(0,0,0,0.75)] backdrop-blur-md transition-[opacity,background,transform] duration-300 hover:translate-x-0.5 hover:bg-[rgba(241,237,227,0.16)]"
            >
              <ArrowRight aria-hidden size={20} strokeWidth={1.8} />
            </label>
            <label
              htmlFor="pathway-services"
              aria-label="Next slide"
              className="pathway-arrow-when-workspace pointer-events-none absolute right-4 inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[rgba(241,237,227,0.32)] bg-[rgba(15,23,20,0.36)] text-[var(--plt-on-inverse)] opacity-0 shadow-[0_18px_40px_-26px_rgba(0,0,0,0.75)] backdrop-blur-md transition-[opacity,background,transform] duration-300 hover:translate-x-0.5 hover:bg-[rgba(241,237,227,0.16)] lg:right-7"
            >
              <ArrowRight aria-hidden size={20} strokeWidth={1.8} />
            </label>
          </div>

          <SlideContent slide={SLIDES[0]} mode="services" locale={locale} />
          <SlideContent slide={SLIDES[1]} mode="workspace" locale={locale} />
      </div>
    </MarketingSection>
  );
}

function SlideContent({
  slide,
  mode,
  locale,
}: {
  slide: (typeof SLIDES)[number];
  mode: "services" | "workspace";
  locale: string;
}) {
  return (
    <div
      className={
        mode === "services"
          ? "pathway-slide-services absolute inset-x-5 bottom-14 max-w-[36rem] opacity-100 transition-opacity duration-700 ease-out sm:inset-x-8 sm:bottom-16 lg:inset-x-16 lg:bottom-20"
          : "pathway-slide-workspace pointer-events-none absolute inset-x-5 bottom-14 max-w-[36rem] opacity-0 transition-opacity duration-700 ease-out sm:inset-x-8 sm:bottom-16 lg:inset-x-16 lg:bottom-20"
      }
    >
      <div
        className="rounded-[28px] border p-5 shadow-[0_30px_80px_-54px_rgba(0,0,0,0.85)] backdrop-blur-md sm:p-7"
        style={{
          background: "linear-gradient(135deg, rgba(15,23,20,0.62), rgba(15,23,20,0.32))",
          borderColor: "rgba(241,237,227,0.18)",
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <p
            className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.24em]"
            style={{ color: "rgba(241,237,227,0.68)" }}
          >
            {slide.eyebrow}
          </p>
          <span
            className="plt-mono shrink-0 rounded-full border px-3 py-1 text-[0.6875rem]"
            style={{
              borderColor: "rgba(241,237,227,0.2)",
              color: "rgba(241,237,227,0.72)",
            }}
          >
            {mode === "services" ? "01 / 02" : "02 / 02"}
          </span>
        </div>
        <h2
          className="plt-display mt-4 text-[2.25rem] font-semibold leading-[1.02] sm:text-[3.25rem]"
          style={{ color: "var(--plt-on-inverse)" }}
        >
          {slide.title}
        </h2>
        <p
          className="mt-5 max-w-[31rem] text-[1rem] leading-[1.65] sm:text-[1.0625rem]"
          style={{ color: "rgba(241,237,227,0.78)" }}
        >
          {slide.body}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {slide.signals.map((signal) => (
            <span
              key={signal}
              className="rounded-full px-3 py-1 text-[0.75rem] font-medium"
              style={{
                background: "rgba(241,237,227,0.12)",
                color: "rgba(241,237,227,0.82)",
                border: "1px solid rgba(241,237,227,0.14)",
              }}
            >
              {signal}
            </span>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {slide.id === "services" ? (
            <OpenTalentModalButton
              eventSource="home-pathway-slider"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-full px-7 text-[0.9375rem] font-medium leading-none tracking-[-0.005em] transition-[background,transform] duration-200 hover:-translate-y-[1px] hover:!bg-[#f8f4ea]"
              style={{
                background: "var(--plt-on-inverse)",
                color: "var(--plt-forest)",
              }}
            >
              {slide.primary.label}
            </OpenTalentModalButton>
          ) : (
            <MarketingCta
              href={withLocaleHref(slide.primary.href, locale)}
              variant="primary"
              size="lg"
              eventSource="home-pathway-slider"
              eventIntent={slide.primary.intent}
              className="!bg-[var(--plt-on-inverse)] !text-[var(--plt-forest)] hover:!bg-[#f8f4ea]"
            >
              {slide.primary.label}
            </MarketingCta>
          )}
          <MarketingCta
            href={withLocaleHref(slide.secondary.href, locale)}
            variant="secondary"
            size="lg"
            eventSource="home-pathway-slider"
            eventIntent={slide.secondary.intent}
            className="!border-[rgba(241,237,227,0.36)] !bg-transparent !text-[var(--plt-on-inverse)] hover:!border-[var(--plt-on-inverse)] hover:!bg-[rgba(241,237,227,0.08)]"
          >
            {slide.secondary.label}
          </MarketingCta>
        </div>
      </div>
    </div>
  );
}
