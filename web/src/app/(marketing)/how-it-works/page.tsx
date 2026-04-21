import type { Metadata } from "next";
import { ContrastSection } from "@/components/marketing/contrast-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { NetworkSection } from "@/components/marketing/network-section";
import { ProductTourSection } from "@/components/marketing/product-tour-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";

export const metadata: Metadata = {
  title: "How it works",
  description: `Three surfaces, one platform: a branded roster site, structured people profiles, and a real inquiry \u2192 offer \u2192 booking pipeline. Here\u2019s the full walkthrough.`,
};

type Surface = {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  body: string;
  highlights: string[];
  art: "site" | "profile" | "pipeline";
};

const SURFACES: Surface[] = [
  {
    id: "site",
    index: "01",
    eyebrow: "Surface 01",
    title: "The branded roster site.",
    body: "A modern editorial website \u2014 nav, pages, posts, design system \u2014 that renders your roster front-and-centre. On your domain, with your identity, managed in a modern CMS. No template feel.",
    highlights: [
      "Your domain, your identity, your tokens",
      "Editorial layouts \u2014 not drag-and-drop kitsch",
      "CMS for pages, posts, and navigation",
    ],
    art: "site",
  },
  {
    id: "profiles",
    index: "02",
    eyebrow: "Surface 02",
    title: "People profiles, done right.",
    body: "Each person has a structured profile: portfolio, specs, availability, rates, location, and an inquiry button. Share the whole roster as one link, or a single profile as its own.",
    highlights: [
      "Structured specs, availability, rate card",
      "One URL per person, renders everywhere",
      "Portfolio pipeline that handles real image weight",
    ],
    art: "profile",
  },
  {
    id: "pipeline",
    index: "03",
    eyebrow: "Surface 03",
    title: "The inquiry engine.",
    body: "Inquiries arrive structured \u2014 not buried in a chat thread. You respond with a versioned offer, get multi-party sign-off, and watch it convert into a tracked booking with calendar-ready data.",
    highlights: [
      "Structured intake with brief, dates, budget",
      "Versioned offers \u2014 nothing lost to memory",
      "Bookings export to calendar + invoicing",
    ],
    art: "pipeline",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <SimplePageHero
        eyebrow="The full walkthrough"
        title={
          <>
            Three surfaces,
            <br />
            <span style={{ color: "var(--plt-forest)" }}>one platform.</span>
          </>
        }
        subtitle="Most of what holds representation businesses back isn&rsquo;t effort &mdash; it&rsquo;s tooling. Here&rsquo;s what changes when your site, your profiles, and your inquiry flow actually talk to each other."
        primary={{ label: "Start free", href: "/get-started", intent: "get-started" }}
        secondary={{ label: "See pricing", href: "/pricing", intent: "pricing" }}
        sourcePage="how-it-works-hero"
      />

      <HowItWorksSection />

      {SURFACES.map((s, i) => (
        <MarketingSection
          key={s.id}
          id={s.id}
          className="relative"
          style={{
            background: i % 2 === 0 ? "var(--plt-bg-raised)" : "var(--plt-bg)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: "var(--plt-hairline)" }}
          />
          <MarketingContainer size="wide">
            <div className="grid items-center gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-16">
              <div>
                <div className="flex items-baseline gap-4">
                  <span
                    aria-hidden
                    className="plt-mono text-[0.75rem] tracking-[0.28em]"
                    style={{ color: "var(--plt-forest)" }}
                  >
                    {s.index}
                  </span>
                  <MarketingEyebrow>{s.eyebrow}</MarketingEyebrow>
                </div>
                <h2
                  className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.5rem]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {s.title}
                </h2>
                <p
                  className="mt-5 max-w-lg text-[1.0625rem] leading-[1.6]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {s.body}
                </p>
                <ul className="mt-7 space-y-3">
                  {s.highlights.map((h) => (
                    <li
                      key={h}
                      className="flex items-start gap-3 text-[0.9375rem] leading-[1.5]"
                      style={{ color: "var(--plt-ink-soft)" }}
                    >
                      <CheckTick />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <SurfaceArt variant={s.art} />
              </div>
            </div>
          </MarketingContainer>
        </MarketingSection>
      ))}

      <ProductTourSection />
      <ContrastSection />
      <NetworkSection />
      <FinalCtaSection />
    </>
  );
}

function CheckTick() {
  return (
    <span
      aria-hidden
      className="mt-[2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{
        background: "rgba(46,107,82,0.14)",
        color: "var(--plt-forest)",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path
          d="M2 5.8l2.4 2.4L9 3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function SurfaceArt({ variant }: { variant: "site" | "profile" | "pipeline" }) {
  return (
    <div
      className="relative aspect-[5/4] overflow-hidden rounded-[28px]"
      style={{
        background:
          variant === "site"
            ? "linear-gradient(140deg, #0f1714 0%, #1f4a3a 45%, #2e6b52 100%)"
            : variant === "profile"
            ? "linear-gradient(160deg, #143226 0%, #1f4a3a 55%, #6f8f80 100%)"
            : "linear-gradient(180deg, #0a1411 0%, #1f4a3a 50%, #2e6b52 100%)",
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
            "radial-gradient(circle at 26% 24%, rgba(255,253,248,0.22), transparent 55%), radial-gradient(circle at 80% 76%, rgba(46,107,82,0.35), transparent 50%)",
        }}
      />
      <div className="relative h-full w-full p-6 sm:p-7">
        {variant === "site" ? <SiteMock /> : variant === "profile" ? <ProfileMock /> : <PipelineMock />}
      </div>
    </div>
  );
}

function SiteMock() {
  return (
    <div
      className="h-full w-full overflow-hidden rounded-[14px]"
      style={{
        background: "rgba(241,237,227,0.96)",
        boxShadow:
          "0 30px 60px -30px rgba(15,23,20,0.5), 0 1px 0 rgba(255,255,255,0.4) inset",
      }}
    >
      <div
        className="flex items-center justify-between border-b px-5 py-3"
        style={{ borderColor: "var(--plt-hairline)" }}
      >
        <span
          className="plt-display text-[0.9375rem] font-medium tracking-[-0.02em]"
          style={{ color: "var(--plt-ink)" }}
        >
          NOVA
        </span>
        <div className="flex gap-4">
          {["Roster", "Work", "Contact"].map((n) => (
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
      <div className="px-5 pt-5">
        <span
          className="plt-mono text-[0.5625rem] tracking-[0.22em]"
          style={{ color: "var(--plt-forest)" }}
        >
          ROSTER &middot; SS26
        </span>
        <div
          className="plt-display mt-2 text-[1.125rem] font-medium leading-[1.1] tracking-[-0.02em]"
          style={{ color: "var(--plt-ink)" }}
        >
          A represented identity,
          <br />
          rendered editorially.
        </div>
        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-[3/4] rounded-sm"
              style={{
                background:
                  i === 0
                    ? "linear-gradient(170deg, #1f4a3a, #2e6b52)"
                    : i === 1
                    ? "linear-gradient(170deg, #2c332f, #5c6561)"
                    : i === 2
                    ? "linear-gradient(170deg, #143226, #1f4a3a)"
                    : "linear-gradient(170deg, #1a2e26, #3a5b4e)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileMock() {
  return (
    <div
      className="h-full w-full overflow-hidden rounded-[14px]"
      style={{
        background: "rgba(241,237,227,0.96)",
        boxShadow:
          "0 30px 60px -30px rgba(15,23,20,0.5), 0 1px 0 rgba(255,255,255,0.4) inset",
      }}
    >
      <div className="grid h-full grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
        <div
          style={{
            background:
              "linear-gradient(165deg, #0f1714 0%, #1f4a3a 65%, #2e6b52 100%)",
          }}
        />
        <div className="flex flex-col justify-center px-4 py-3">
          <span
            className="plt-mono text-[0.5625rem] tracking-[0.22em]"
            style={{ color: "var(--plt-forest)" }}
          >
            SOFIA M. &middot; MX
          </span>
          <div
            className="plt-display mt-1 text-[1rem] font-medium leading-[1.15] tracking-[-0.02em]"
            style={{ color: "var(--plt-ink)" }}
          >
            Editorial, runway,
            <br />
            commercial.
          </div>
          <dl className="mt-3 space-y-1.5 text-[0.625rem]">
            {[
              ["Height", "178 cm"],
              ["Range", "Editorial"],
              ["Based", "CDMX \u00b7 MX"],
              ["Available", "From 2026-05-02"],
            ].map(([label, val]) => (
              <div key={label as string} className="flex justify-between">
                <dt
                  className="plt-mono tracking-[0.1em]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {(label as string).toUpperCase()}
                </dt>
                <dd
                  className="font-medium"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {val}
                </dd>
              </div>
            ))}
          </dl>
          <div
            className="mt-3 inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[0.5625rem] font-medium"
            style={{
              background: "var(--plt-forest)",
              color: "var(--plt-forest-on)",
            }}
          >
            Inquire
          </div>
        </div>
      </div>
    </div>
  );
}

function PipelineMock() {
  const STAGES = [
    { label: "INQUIRY", count: 12, width: 100 },
    { label: "OFFER", count: 5, width: 78 },
    { label: "APPROVED", count: 3, width: 56 },
    { label: "BOOKED", count: 2, width: 34 },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {STAGES.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3">
          <span
            className="plt-mono w-[68px] shrink-0 text-[0.625rem] tracking-[0.14em]"
            style={{ color: "rgba(241,237,227,0.7)" }}
          >
            {s.label}
          </span>
          <div
            className="relative h-[22px] flex-1 overflow-hidden rounded-full"
            style={{ background: "rgba(241,237,227,0.08)" }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${s.width}%`,
                background:
                  i === STAGES.length - 1
                    ? "linear-gradient(90deg, rgba(46,107,82,0.9), rgba(241,237,227,0.95))"
                    : "linear-gradient(90deg, rgba(46,107,82,0.4), rgba(46,107,82,0.75))",
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
  );
}
