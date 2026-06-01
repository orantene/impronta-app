import { getRequestLocale } from "@/i18n/request-locale";
import { getMarketingCopy, type MarketingCopy } from "@/lib/marketing/copy";
import { MARKETING_PHOTOS, type MarketingPhoto } from "@/lib/marketing/photography";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";
import { EditorialFrame } from "./editorial-image";

type AudienceConfig = {
  key: "talent" | "business" | "hub";
  href: string;
  intent: string;
  accent: string;
  photo: MarketingPhoto;
};

/** Code-side config — copy (labels/points) comes from the copy module per locale. */
const AUDIENCE_CONFIG: AudienceConfig[] = [
  {
    key: "talent",
    href: "/operators",
    intent: "talent",
    accent: "var(--plt-forest)",
    photo: MARKETING_PHOTOS.audienceTalent,
  },
  {
    key: "business",
    href: "/agencies",
    intent: "business",
    accent: "var(--plt-ink)",
    photo: MARKETING_PHOTOS.audienceBusiness,
  },
  {
    key: "hub",
    href: "/organizations",
    intent: "hub",
    accent: "var(--tl-sage, #8a907b)",
    photo: MARKETING_PHOTOS.audienceHub,
  },
];

type AudienceCopy = MarketingCopy["audience"]["talent"];

export async function AudienceSplitSection() {
  const copy = getMarketingCopy(await getRequestLocale()).audience;

  return (
    <MarketingSection id="audiences">
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>{copy.eyebrow}</MarketingEyebrow>
          <h2
            className="mkt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
            style={{ color: "var(--mkt-ink)" }}
          >
            {copy.title}
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
            style={{ color: "var(--mkt-muted)" }}
          >
            {copy.subtitle}
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3 md:gap-6">
          {AUDIENCE_CONFIG.map((config) => (
            <AudienceCard key={config.key} config={config} copy={copy[config.key]} />
          ))}
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function AudienceCard({ config, copy }: { config: AudienceConfig; copy: AudienceCopy }) {
  return (
    <article
      className="group flex h-full flex-col overflow-hidden rounded-[20px] transition-transform duration-300 hover:-translate-y-1"
      style={{
        background: "var(--plt-bg-elevated)",
        border: "1px solid var(--plt-hairline)",
        boxShadow: "0 24px 56px -32px rgba(15,23,20,0.2)",
      }}
    >
      <EditorialFrame
        bare
        photo={config.photo}
        aspect="landscape"
        tone="cream"
        className="w-full"
      />

      <div className="flex flex-1 flex-col p-6">
        <span
          className="plt-mono inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.18em]"
          style={{ color: config.accent }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: config.accent }}
            aria-hidden
          />
          {copy.eyebrow}
        </span>

        <h3
          className="plt-display mt-3 text-[1.5rem] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[1.625rem]"
          style={{ color: "var(--plt-ink)" }}
        >
          {copy.title}
        </h3>

        <p className="mt-2.5 text-[0.9375rem] leading-[1.55]" style={{ color: "var(--plt-muted)" }}>
          {copy.subtitle}
        </p>

        <ul className="mt-5 space-y-2.5">
          {copy.points.map((p) => (
            <li
              key={p}
              className="flex items-start gap-2.5 text-[0.875rem] leading-[1.5]"
              style={{ color: "var(--plt-ink-soft)" }}
            >
              <span
                className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full"
                style={{ background: config.accent }}
                aria-hidden
              />
              {p}
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-6">
          <MarketingCta
            href={config.href}
            variant="inline"
            size="md"
            eventSource="home-audience-split"
            eventIntent={config.intent}
          >
            {copy.cta}
          </MarketingCta>
        </div>
      </div>
    </article>
  );
}
