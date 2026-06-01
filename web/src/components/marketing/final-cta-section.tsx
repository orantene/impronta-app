import { getRequestLocale } from "@/i18n/request-locale";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { MarketingContainer, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";
import { OpenTalentModalButton } from "./open-talent-modal-button";

export async function FinalCtaSection() {
  const copy = getMarketingCopy(await getRequestLocale()).finalCta;

  return (
    <MarketingSection className="relative overflow-hidden" style={{ background: "var(--plt-bg)" }}>
      <MarketingContainer size="wide" className="relative">
        <div
          className="relative overflow-hidden rounded-[32px] px-6 py-16 text-center sm:rounded-[36px] sm:px-16 sm:py-24 md:py-28"
          style={{ background: "#0a1d16", color: "var(--plt-on-inverse)" }}
        >
          {/* The signature image — every kind of talent, one platform */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={MARKETING_PHOTOS.heroServices.url()}
            alt={MARKETING_PHOTOS.heroServices.alt}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "50% 42%" }}
          />
          {/* Forest wash — keeps the image alive but the text readable */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(10,29,22,0.82) 0%, rgba(10,29,22,0.64) 52%, rgba(10,29,22,0.72) 100%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(100% 75% at 50% 46%, rgba(10,29,22,0.5) 0%, rgba(10,29,22,0) 72%)",
            }}
          />
          <div
            aria-hidden
            className="plt-grain pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-overlay"
          />

          <div className="relative mx-auto max-w-3xl">
            <span
              className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.24em]"
              style={{ color: "rgba(241,237,227,0.66)" }}
            >
              {copy.eyebrow}
            </span>
            <h2 className="plt-display mt-6 text-[2.25rem] font-semibold leading-[1.02] tracking-[-0.03em] sm:text-[3.25rem] md:text-[3.75rem]">
              {copy.titleLine1}
              <br />
              <span
                style={{
                  background: "linear-gradient(110deg, #e4f0e7 0%, #b9d9c7 45%, #6fa489 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {copy.titleLine2}
              </span>
            </h2>
            <p
              className="mx-auto mt-6 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
              style={{ color: "rgba(241,237,227,0.84)" }}
            >
              {copy.subhead}
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <OpenTalentModalButton
                eventSource="home-final-cta"
                className="inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium leading-none transition-[background,transform] duration-200 hover:-translate-y-[1px]"
                style={{ background: "var(--plt-on-inverse)", color: "var(--plt-forest)" }}
              >
                {copy.ctaTalent}
              </OpenTalentModalButton>
              <MarketingCta
                href="/get-started"
                variant="secondary"
                size="lg"
                eventSource="home-final-cta"
                eventIntent="get-started"
                className="!border-[rgba(241,237,227,0.32)] !bg-transparent !text-[var(--plt-on-inverse)] hover:!border-[var(--plt-on-inverse)] hover:!bg-[rgba(241,237,227,0.08)]"
              >
                {copy.ctaBusiness}
              </MarketingCta>
            </div>

            <ul
              className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[0.8125rem]"
              style={{ color: "rgba(241,237,227,0.66)" }}
            >
              {copy.trust.map((t, i) => (
                <li key={t} className="inline-flex items-center gap-x-3">
                  {i > 0 ? (
                    <span aria-hidden style={{ opacity: 0.5 }}>
                      ·
                    </span>
                  ) : null}
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}
