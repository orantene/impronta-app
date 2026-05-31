import type { Metadata } from "next";
import { FeatureGridSection } from "@/components/marketing/feature-grid-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { ProductTourSection } from "@/components/marketing/product-tour-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MARKETING_PHOTOS, type MarketingPhoto } from "@/lib/marketing/photography";

export const metadata: Metadata = {
  title: "For agencies & representation",
  description:
    "Run a branded roster site on your own domain, manage people in a modern CMS, and convert inquiries through a real pipeline — not a spreadsheet.",
};

type Pillar = {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  art: "site" | "roster" | "pipeline";
};

const PILLARS: Pillar[] = [
  {
    id: "site",
    index: "01",
    eyebrow: "Branded site",
    title: "Your identity, yours \u2014 not a template\u2019s.",
    body: "A real editorial website on your own domain, managed in a modern CMS. Navigation, pages, posts, design tokens \u2014 you own the whole surface.",
    bullets: [
      "Custom domain, SSL, DNS handled",
      "CMS-driven pages, posts, navigation",
      "Design system with typography + token presets",
      "Multi-locale (en / es, more on request)",
    ],
    art: "site",
  },
  {
    id: "roster",
    index: "02",
    eyebrow: "People profiles",
    title: "The profile your roster deserves.",
    body: "Structured taxonomy, media pipeline, specs, availability, and portfolio \u2014 presented editorially. One URL per person, rendering everywhere.",
    bullets: [
      "Rich people profiles with locale support",
      "Editorial portfolio rendering (no builder vibes)",
      "Availability + rates + specs in structured fields",
      "Share each profile as its own link",
    ],
    art: "roster",
  },
  {
    id: "pipeline",
    index: "03",
    eyebrow: "Inquiry pipeline",
    title: "From inquiry to booking, not another thread.",
    body: "Structured intake, versioned offers, multi-party approvals, bookings that become real calendar events. Every step traceable.",
    bullets: [
      "Structured inquiry inbox (not chat)",
      "Versioned offers with approval flow",
      "Multi-party sign-off \u2014 client, talent, ops",
      "Bookings \u2192 calendar \u2192 invoicing-ready data",
    ],
    art: "pipeline",
  },
];

export default function AgenciesPage() {
  return (
    <>
      <SimplePageHero
        eyebrow="For agencies & representation"
        title={
          <>
            Your agency,
            <br />
            <span style={{ color: "var(--plt-forest)" }}>rebuilt for 2026.</span>
          </>
        }
        subtitle={`Representation businesses run on people, not software \u2014 until the software gets in the way. ${PLATFORM_BRAND.name} is the operating system: a branded site, structured profiles, a real inquiry pipeline, and permissions to scale past a single phone.`}
        primary={{ label: "Start 14-day trial", href: "/get-started?tier=agency", intent: "trial" }}
        secondary={{ label: "See pricing", href: "/pricing", intent: "pricing" }}
        sourcePage="agencies-hero"
      />

      {PILLARS.map((pillar, i) => (
        <MarketingSection
          key={pillar.id}
          id={pillar.id}
          className="relative"
          style={{
            background:
              i % 2 === 0 ? "var(--plt-bg)" : "var(--plt-bg-raised)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: "var(--plt-hairline)" }}
          />
          <MarketingContainer size="wide">
            <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
              <div className={i % 2 === 0 ? "order-1" : "md:order-2"}>
                <div className="flex items-baseline gap-4">
                  <span
                    aria-hidden
                    className="plt-mono text-[0.75rem] tracking-[0.28em]"
                    style={{ color: "var(--plt-forest)" }}
                  >
                    {pillar.index}
                  </span>
                  <MarketingEyebrow>{pillar.eyebrow}</MarketingEyebrow>
                </div>
                <h2
                  className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.5rem]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {pillar.title}
                </h2>
                <p
                  className="mt-5 max-w-lg text-[1.0625rem] leading-[1.6]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {pillar.body}
                </p>
                <ul className="mt-8 space-y-3">
                  {pillar.bullets.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-3 text-[0.9375rem] leading-[1.55]"
                      style={{ color: "var(--plt-ink-soft)" }}
                    >
                      <span
                        className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--plt-forest)" }}
                        aria-hidden
                      />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={i % 2 === 0 ? "order-2" : "md:order-1"}>
                <PillarArt variant={pillar.art} />
              </div>
            </div>
          </MarketingContainer>
        </MarketingSection>
      ))}

      <FeatureGridSection />
      <ProductTourSection />
      <FinalCtaSection />
    </>
  );
}

function PillarArt({ variant }: { variant: "site" | "roster" | "pipeline" }) {
  if (variant === "site") {
    return (
      <PhotoPillarArt
        photo={MARKETING_PHOTOS.agencyBuilder}
        eyebrow="Workspace live"
        title="Website, inquiries, roster."
        statA={{ label: "Domain", value: "Custom" }}
        statB={{ label: "Setup", value: "Fast" }}
      />
    );
  }
  if (variant === "roster") {
    return (
      <PhotoPillarArt
        photo={MARKETING_PHOTOS.heroServices}
        eyebrow="People as product"
        title="Profiles clients want to click."
        statA={{ label: "Profiles", value: "Rich" }}
        statB={{ label: "Media", value: "Premium" }}
      />
    );
  }
  return (
    <PhotoPillarArt
      photo={MARKETING_PHOTOS.hubDiscovery}
      eyebrow="Pipeline"
      title="Every request gets a home."
      statA={{ label: "Inbox", value: "Structured" }}
      statB={{ label: "Source", value: "Tracked" }}
    />
  );
}

function PhotoPillarArt({
  photo,
  eyebrow,
  title,
  statA,
  statB,
}: {
  photo: MarketingPhoto;
  eyebrow: string;
  title: string;
  statA: { label: string; value: string };
  statB: { label: string; value: string };
}) {
  return (
    <figure
      className="relative min-h-[24rem] overflow-hidden rounded-[28px]"
      style={{
        background: "var(--plt-bg-deep)",
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow:
          "0 40px 80px -42px rgba(15,23,20,0.45), 0 14px 32px -24px rgba(31,74,58,0.3)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url()}
        alt={photo.alt}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(15,23,20,0.04) 10%, rgba(15,23,20,0.58) 100%)" }}
      />
      <figcaption className="absolute inset-x-5 bottom-5 sm:inset-x-6 sm:bottom-6">
        <span
          className="plt-mono text-[0.6875rem] font-medium uppercase"
          style={{ color: "rgba(241,237,227,0.72)" }}
        >
          {eyebrow}
        </span>
        <h3
          className="plt-display mt-2 max-w-[24rem] text-[1.85rem] font-semibold leading-[1.06]"
          style={{ color: "var(--plt-on-inverse)" }}
        >
          {title}
        </h3>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          {[statA, statB].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[16px] px-4 py-3 backdrop-blur-md"
              style={{
                background: "rgba(241,237,227,0.12)",
                border: "1px solid rgba(241,237,227,0.16)",
                color: "var(--plt-on-inverse)",
              }}
            >
              <dt className="plt-mono text-[0.625rem] uppercase" style={{ color: "rgba(241,237,227,0.62)" }}>
                {stat.label}
              </dt>
              <dd className="mt-1 text-[0.9375rem] font-semibold">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}
