import type { Metadata } from "next";
import { ContrastSection } from "@/components/marketing/contrast-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import {
  MarketingContainer,
  MarketingEyebrow,
  MarketingSection,
} from "@/components/marketing/container";
import { MarketingCta } from "@/components/marketing/cta-link";
import { NetworkSection } from "@/components/marketing/network-section";
import { SimplePageHero } from "@/components/marketing/simple-page-hero";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const metadata: Metadata = {
  title: "For independent operators",
  description: `You ARE the business. ${PLATFORM_BRAND.name} gives independent coordinators and operators the structure of a real agency — without the overhead of building one.`,
};

type PainPoint = {
  id: string;
  number: string;
  title: string;
  body: string;
};

const PAIN_POINTS: PainPoint[] = [
  {
    id: "bottleneck",
    number: "01",
    title: "You ARE the business.",
    body: "Every inquiry, every booking, every response — it\u2019s all you. The phone doesn\u2019t stop, and there\u2019s no coordinator to delegate to.",
  },
  {
    id: "tools",
    number: "02",
    title: "Your tools don\u2019t match your work.",
    body: "WhatsApp, a Notes app, maybe a spreadsheet. You\u2019re running a business with tools built for personal chat.",
  },
  {
    id: "optics",
    number: "03",
    title: "You look smaller than you are.",
    body: "Clients judge based on what they see. A screenshot pile doesn\u2019t convey the quality of the work, or the quality of you.",
  },
];

type Shift = {
  before: string;
  after: string;
};

const SHIFTS: Shift[] = [
  {
    before: "Roster lives in your camera roll.",
    after: "Roster lives on your domain, rendering like an agency.",
  },
  {
    before: "Inquiries buried in WhatsApp.",
    after: "Inquiries land structured — brief, dates, budget.",
  },
  {
    before: "Rates quoted from memory.",
    after: "Offers version-tracked, approved in-product.",
  },
  {
    before: "Screenshots as your portfolio.",
    after: "Editorial profiles with one share link.",
  },
  {
    before: "Calendar inside your head.",
    after: "Availability queryable, bookings exportable.",
  },
  {
    before: "No way to scale past you.",
    after: "Role-scoped access when you\u2019re ready to delegate.",
  },
];

export default function OperatorsPage() {
  return (
    <>
      <SimplePageHero
        eyebrow="For independent operators"
        title={
          <>
            You&rsquo;re already running
            <br />
            <span style={{ color: "var(--plt-forest)" }}>a real business.</span>
          </>
        }
        subtitle={`${PLATFORM_BRAND.name} is the talent business platform for coordinators, freelance scouts, managers, and one-person agencies. Get a polished storefront, a structured inquiry inbox, and exposure on a shared discovery network \u2014 free to start.`}
        primary={{ label: "Start free", href: "/get-started?audience=operator", intent: "get-started" }}
        secondary={{ label: "See how it works", href: "/how-it-works", intent: "learn" }}
        sourcePage="operators-hero"
      />

      <MarketingSection spacing="tight">
        <MarketingContainer size="wide">
          <div className="mx-auto max-w-2xl text-center">
            <MarketingEyebrow>The one-person bottleneck</MarketingEyebrow>
            <h2
              className="plt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.5rem]"
              style={{ color: "var(--plt-ink)" }}
            >
              You&rsquo;re doing agency work.
              <br className="hidden sm:block" />{" "}
              <span style={{ color: "var(--plt-muted)" }}>With personal tools.</span>
            </h2>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3 md:gap-6">
            {PAIN_POINTS.map((p) => (
              <article
                key={p.id}
                className="group relative overflow-hidden rounded-[28px] p-7 transition-all duration-300 hover:-translate-y-0.5 sm:p-8"
                style={{
                  background: "var(--plt-bg-elevated)",
                  border: "1px solid var(--plt-hairline)",
                  boxShadow: "0 1px 2px rgba(15,23,20,0.04)",
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
                  style={{
                    background:
                      "linear-gradient(90deg, var(--plt-forest) 0%, var(--plt-forest-bright) 100%)",
                  }}
                />
                <span
                  className="plt-mono text-[0.6875rem] tracking-[0.24em]"
                  style={{ color: "var(--plt-forest)" }}
                >
                  {p.number}
                </span>
                <h3
                  className="plt-display mt-3 text-[1.25rem] font-medium leading-[1.2] tracking-[-0.02em]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  {p.title}
                </h3>
                <p
                  className="mt-4 text-[0.9375rem] leading-[1.6]"
                  style={{ color: "var(--plt-muted)" }}
                >
                  {p.body}
                </p>
              </article>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      <MarketingSection
        className="relative"
        style={{
          background:
            "linear-gradient(180deg, var(--plt-bg-raised) 0%, var(--plt-bg) 100%)",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: "var(--plt-hairline)" }}
        />
        <MarketingContainer size="wide">
          <div className="grid gap-12 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] md:gap-16">
            <div>
              <MarketingEyebrow>Today &rarr; with {PLATFORM_BRAND.name}</MarketingEyebrow>
              <h2
                className="plt-display mt-5 text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[2.5rem]"
                style={{ color: "var(--plt-ink)" }}
              >
                Six shifts that make you
                <br />
                <span style={{ color: "var(--plt-forest)" }}>look like a real agency.</span>
              </h2>
              <p
                className="mt-5 max-w-md text-[1rem] leading-[1.6]"
                style={{ color: "var(--plt-muted)" }}
              >
                None of this replaces what you do. It replaces the improvised tooling that
                makes the work feel smaller than it is.
              </p>
              <div className="mt-8">
                <MarketingCta
                  href="/get-started?audience=operator"
                  variant="primary"
                  size="md"
                  eventSource="operators-shifts"
                  eventIntent="get-started"
                >
                  Start free
                </MarketingCta>
              </div>
            </div>
            <ul className="space-y-3">
              {SHIFTS.map((s, i) => (
                <li
                  key={i}
                  className="grid gap-3 rounded-2xl p-4 sm:grid-cols-2 sm:p-5"
                  style={{
                    background: "var(--plt-bg-elevated)",
                    border: "1px solid var(--plt-hairline)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <BeforeMark />
                    <span
                      className="text-[0.9375rem] leading-[1.45] line-through"
                      style={{ color: "var(--plt-muted)" }}
                    >
                      {s.before}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <AfterMark />
                    <span
                      className="text-[0.9375rem] font-medium leading-[1.45]"
                      style={{ color: "var(--plt-ink)" }}
                    >
                      {s.after}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </MarketingContainer>
      </MarketingSection>

      <ContrastSection />
      <HowItWorksSection />
      <NetworkSection />
      <FinalCtaSection />
    </>
  );
}

function BeforeMark() {
  return (
    <span
      aria-hidden
      className="mt-[2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{
        background: "var(--plt-hairline)",
        color: "var(--plt-muted)",
      }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M2 2l6 6M8 2l-6 6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function AfterMark() {
  return (
    <span
      aria-hidden
      className="mt-[2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{
        background: "rgba(46,107,82,0.14)",
        color: "var(--plt-forest)",
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 11 11"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
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
