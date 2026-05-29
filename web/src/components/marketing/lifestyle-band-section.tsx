import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { MarketingContainer, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";

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
      href: "/talent/register?next=/talent/profile/fields",
      intent: "sell-services",
    },
    secondary: {
      label: "Browse agencies & hubs",
      href: "/discover-agencies",
      intent: "discover-agencies",
    },
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
  },
] as const;

export function LifestyleBandSection() {
  return (
    <MarketingSection spacing="tight" className="relative overflow-hidden">
      <MarketingContainer size="wide">
        <div
          className="relative min-h-[30rem] overflow-hidden rounded-[32px] px-6 py-12 sm:px-10 sm:py-16 lg:min-h-[34rem] lg:px-14 lg:py-20"
          style={{
            background: "var(--plt-bg-deep)",
            border: "1px solid var(--plt-hairline-strong)",
            boxShadow: "0 42px 90px -54px rgba(15,23,20,0.42)",
          }}
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

          <SlideContent slide={SLIDES[0]} mode="services" />
          <SlideContent slide={SLIDES[1]} mode="workspace" />
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function SlideContent({
  slide,
  mode,
}: {
  slide: (typeof SLIDES)[number];
  mode: "services" | "workspace";
}) {
  return (
    <div
      className={
        mode === "services"
          ? "pathway-slide-services relative flex min-h-[22rem] max-w-[34rem] flex-col justify-end opacity-100 transition-opacity duration-700 ease-out sm:min-h-[24rem]"
          : "pathway-slide-workspace pointer-events-none absolute inset-x-6 bottom-12 max-w-[34rem] opacity-0 transition-opacity duration-700 ease-out sm:inset-x-10 sm:bottom-16 lg:inset-x-14 lg:bottom-20"
      }
    >
      <p
        className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.24em]"
        style={{ color: "rgba(241,237,227,0.68)" }}
      >
        {slide.eyebrow}
      </p>
      <h2
        className="plt-display mt-4 text-[2.25rem] font-semibold leading-[1.02] sm:text-[3.2rem]"
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

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <MarketingCta
          href={slide.primary.href}
          variant="primary"
          size="lg"
          eventSource="home-pathway-slider"
          eventIntent={slide.primary.intent}
          className="!bg-[var(--plt-on-inverse)] !text-[var(--plt-forest)] hover:!bg-[#f8f4ea]"
        >
          {slide.primary.label}
        </MarketingCta>
        <MarketingCta
          href={slide.secondary.href}
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
  );
}
