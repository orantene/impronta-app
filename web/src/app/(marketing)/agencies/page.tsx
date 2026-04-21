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
  if (variant === "site") return <SiteArt />;
  if (variant === "roster") return <RosterArt />;
  return <PipelineArt />;
}

function ArtFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative aspect-[5/4] overflow-hidden rounded-[28px]"
      style={{
        background:
          "linear-gradient(145deg, #0f1714 0%, #1f4a3a 45%, #2e6b52 100%)",
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow:
          "0 40px 80px -40px rgba(15,23,20,0.5), 0 14px 32px -18px rgba(31,74,58,0.35)",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle at 28% 22%, rgba(255,253,248,0.22), transparent 55%), radial-gradient(circle at 82% 78%, rgba(46,107,82,0.35), transparent 50%)",
        }}
      />
      <div className="relative h-full w-full p-6 sm:p-7">{children}</div>
    </div>
  );
}

function SiteArt() {
  return (
    <ArtFrame>
      <div
        className="h-full w-full overflow-hidden rounded-[16px]"
        style={{
          background: "rgba(241,237,227,0.96)",
          boxShadow:
            "0 30px 60px -30px rgba(15,23,20,0.5), 0 1px 0 rgba(255,255,255,0.4) inset",
        }}
      >
        <div
          className="flex items-center gap-2 border-b px-3 py-2.5"
          style={{ borderColor: "var(--plt-hairline)" }}
        >
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#e0dcd0" }} />
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#e0dcd0" }} />
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#e0dcd0" }} />
          <span
            className="ml-2 truncate plt-mono text-[0.625rem] tracking-[0.08em]"
            style={{ color: "var(--plt-muted)" }}
          >
            your-agency.com
          </span>
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <span
            className="plt-display text-[0.9375rem] font-medium tracking-[-0.02em]"
            style={{ color: "var(--plt-ink)" }}
          >
            NOVA
          </span>
          <div className="flex gap-4">
            {["Roster", "Work", "Journal", "Contact"].map((n) => (
              <span
                key={n}
                className="text-[0.625rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
        <div className="px-5">
          <div
            className="h-[6px] w-20 rounded-full"
            style={{ background: "var(--plt-forest)" }}
          />
          <div
            className="mt-3 h-[14px] w-3/4 rounded-full"
            style={{ background: "rgba(15,23,20,0.14)" }}
          />
          <div
            className="mt-2 h-[14px] w-5/6 rounded-full"
            style={{ background: "rgba(15,23,20,0.1)" }}
          />
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="aspect-[3/4] rounded-md"
                style={{
                  background:
                    i === 0
                      ? "linear-gradient(170deg, #1f4a3a, #2e6b52)"
                      : i === 1
                      ? "linear-gradient(170deg, #2c332f, #5c6561)"
                      : "linear-gradient(170deg, #143226, #1f4a3a)",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </ArtFrame>
  );
}

function RosterArt() {
  return (
    <ArtFrame>
      <div className="grid h-full grid-cols-2 gap-3">
        {[
          { name: "Sofia M.", label: "Editorial \u00b7 MX" },
          { name: "Kai T.", label: "Runway \u00b7 JP" },
          { name: "Mara L.", label: "Commercial \u00b7 ES" },
          { name: "Oren V.", label: "Fitness \u00b7 DE" },
        ].map((p, i) => (
          <div
            key={p.name}
            className="relative overflow-hidden rounded-[14px]"
            style={{
              background:
                i === 0
                  ? "linear-gradient(165deg, #0f1714 0%, #1f4a3a 65%, #2e6b52 100%)"
                  : i === 1
                  ? "linear-gradient(165deg, #18211d 0%, #2c332f 55%, #5c6561 100%)"
                  : i === 2
                  ? "linear-gradient(165deg, #1a2e26 0%, #3a5b4e 55%, #6f8f80 100%)"
                  : "linear-gradient(165deg, #0a1411 0%, #143226 55%, #1f4a3a 100%)",
              border: "1px solid rgba(241,237,227,0.08)",
            }}
          >
            <div
              aria-hidden
              className="absolute inset-x-3 top-3 h-[3px] rounded-full"
              style={{ background: "rgba(241,237,227,0.25)" }}
            />
            <div className="absolute inset-x-3 bottom-3">
              <div
                className="plt-mono text-[0.5625rem] tracking-[0.18em]"
                style={{ color: "rgba(241,237,227,0.6)" }}
              >
                {p.label}
              </div>
              <div
                className="plt-display mt-0.5 text-[0.8125rem] font-medium tracking-[-0.01em]"
                style={{ color: "rgba(241,237,227,0.96)" }}
              >
                {p.name}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ArtFrame>
  );
}

function PipelineArt() {
  const STAGES = [
    { label: "Inquiry", count: 12, tone: "rgba(241,237,227,0.16)" },
    { label: "Offer", count: 5, tone: "rgba(46,107,82,0.5)" },
    { label: "Approved", count: 3, tone: "rgba(46,107,82,0.75)" },
    { label: "Booked", count: 2, tone: "rgba(241,237,227,0.92)" },
  ];
  return (
    <ArtFrame>
      <div className="flex h-full flex-col justify-center gap-3">
        {STAGES.map((s, i) => (
          <div key={s.label} className="flex items-center gap-3">
            <span
              className="plt-mono w-16 shrink-0 text-[0.625rem] tracking-[0.14em]"
              style={{ color: "rgba(241,237,227,0.7)" }}
            >
              {s.label.toUpperCase()}
            </span>
            <div
              className="relative h-[22px] flex-1 overflow-hidden rounded-full"
              style={{ background: "rgba(241,237,227,0.08)" }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${100 - i * 18}%`,
                  background:
                    i === STAGES.length - 1
                      ? "linear-gradient(90deg, rgba(46,107,82,0.9), rgba(241,237,227,0.95))"
                      : `linear-gradient(90deg, ${s.tone}, rgba(46,107,82,0.55))`,
                  boxShadow: "0 0 0 1px rgba(241,237,227,0.06) inset",
                }}
              />
            </div>
            <span
              className="plt-mono w-7 text-right text-[0.75rem] font-medium"
              style={{ color: "rgba(241,237,227,0.9)" }}
            >
              {s.count}
            </span>
          </div>
        ))}
      </div>
    </ArtFrame>
  );
}
