import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { MarketingContainer, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";

/**
 * Homepage workspace band — separates the agency/workspace pitch from the
 * talent-focused hero so the first viewport stays clean and directional.
 */
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={MARKETING_PHOTOS.agencyBuilder.url()}
            alt={MARKETING_PHOTOS.agencyBuilder.alt}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(12,25,20,0.78) 0%, rgba(12,25,20,0.46) 45%, rgba(12,25,20,0.08) 100%)",
            }}
          />
          <div aria-hidden className="plt-grain pointer-events-none absolute inset-0 opacity-[0.18]" />

          <div className="relative flex min-h-[22rem] max-w-[34rem] flex-col justify-end sm:min-h-[24rem]">
            <p
              className="plt-mono text-[0.6875rem] font-medium uppercase tracking-[0.24em]"
              style={{ color: "rgba(241,237,227,0.68)" }}
            >
              For agencies, studios, clinics, teams
            </p>
            <h2
              className="plt-display mt-4 text-[2.25rem] font-semibold leading-[1.02] sm:text-[3.2rem]"
              style={{ color: "var(--plt-on-inverse)" }}
            >
              Build the workspace around your people.
            </h2>
            <p
              className="mt-5 max-w-[31rem] text-[1rem] leading-[1.65] sm:text-[1.0625rem]"
              style={{ color: "rgba(241,237,227,0.78)" }}
            >
              Launch a premium website, collect inquiries, manage requests, and
              run a real service business from one Tulala workspace.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <MarketingCta
                href="/get-started?audience=agency"
                variant="primary"
                size="lg"
                eventSource="home-workspace-band"
                eventIntent="build-workspace"
                className="!bg-[var(--plt-on-inverse)] !text-[var(--plt-forest)] hover:!bg-[#f8f4ea]"
              >
                Build workspace
              </MarketingCta>
              <MarketingCta
                href="/agencies"
                variant="secondary"
                size="lg"
                eventSource="home-workspace-band"
                eventIntent="agencies"
                className="!border-[rgba(241,237,227,0.36)] !bg-transparent !text-[var(--plt-on-inverse)] hover:!border-[var(--plt-on-inverse)] hover:!bg-[rgba(241,237,227,0.08)]"
              >
                See agency tools
              </MarketingCta>
            </div>
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}
