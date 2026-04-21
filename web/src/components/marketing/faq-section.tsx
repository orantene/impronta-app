"use client";

import { useState } from "react";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";
import { trackProductEvent } from "@/lib/analytics/track-client";

type QA = {
  id: string;
  q: string;
  a: string;
};

const FAQS: QA[] = [
  {
    id: "what-is-rostra",
    q: `Who is ${PLATFORM_BRAND.name} for?`,
    a: `Anyone whose business is built on representing people — independent coordinators, talent and model agencies, casting operations, staffing firms, speaker bureaus, and any roster-based business where the product is the people you represent. If you've ever sent profiles on WhatsApp, ${PLATFORM_BRAND.name} is for you.`,
  },
  {
    id: "free-plan",
    q: "Is there really a free plan?",
    a: "Yes — a genuinely useful free plan, not a trial in disguise. You get a free subdomain, up to 10 people profiles, a structured inquiry inbox, and optional exposure on the shared discovery hub. No credit card required.",
  },
  {
    id: "custom-domain",
    q: "Can I use my own domain?",
    a: "Yes, on the Agency plan and above. Bring your own domain, get full CMS control over navigation, design, and pages. Your site looks like a serious editorial business — because it is one.",
  },
  {
    id: "vs-website-builder",
    q: "How is this different from Squarespace or Notion?",
    a: `Those are presentation tools — you'd still manage your roster in a spreadsheet, your inquiries in WhatsApp, and your bookings in your head. ${PLATFORM_BRAND.name} is the operating layer: a branded site, structured people profiles, a real inquiry pipeline, and a shared discovery network — all designed around how representation businesses actually work.`,
  },
  {
    id: "network-opt-in",
    q: "Am I forced to be on the &ldquo;shared network&rdquo;?",
    a: `No. The hub is opt-in per organization and per profile. You can run ${PLATFORM_BRAND.name} as a pure branded site, appear in the network, or both. You control what&rsquo;s discoverable.`,
  },
  {
    id: "data-ownership",
    q: "What happens to my data if I leave?",
    a: "It stays yours. Full export of your roster, profiles, media, and inquiry history is available on every paid plan. No lock-in, no hostage data.",
  },
  {
    id: "team",
    q: "Can my team collaborate on it?",
    a: "Yes — Agency plan and above support multiple users with role-based permissions: owners, admins, coordinators, assistants. Everyone works in the same roster with the right level of access.",
  },
  {
    id: "localization",
    q: "Does it work outside the US?",
    a: "Yes. Multi-locale support, multi-currency pricing, and design tokens that translate cleanly across markets. Built to work across LATAM, North America, and Europe out of the box.",
  },
];

export function FaqSection() {
  return (
    <MarketingSection
      id="faq"
      style={{ background: "var(--mkt-surface)" }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--mkt-hairline)" }}
      />
      <MarketingContainer size="default">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>Frequently asked</MarketingEyebrow>
          <h2
            className="mkt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
            style={{ color: "var(--mkt-ink)" }}
          >
            The short version.
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
            style={{ color: "var(--mkt-muted)" }}
          >
            What people ask before signing up. Straight answers — no fluff.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-3xl overflow-hidden rounded-[24px] border"
          style={{
            borderColor: "var(--mkt-hairline-strong)",
            background: "var(--mkt-surface-raised)",
          }}
        >
          {FAQS.map((f, i) => (
            <FaqItem key={f.id} item={f} isLast={i === FAQS.length - 1} />
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <p
            className="text-[0.9375rem]"
            style={{ color: "var(--mkt-muted)" }}
          >
            Still have questions?
          </p>
          <MarketingCta
            href="/faq"
            variant="inline"
            size="md"
            eventSource="home-faq"
            eventIntent="faq-deep"
          >
            See all FAQs
          </MarketingCta>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}

function FaqItem({ item, isLast }: { item: QA; isLast: boolean }) {
  const [open, setOpen] = useState(false);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      trackProductEvent("marketing_faq_opened", {
        source_page: "home-faq",
        question_id: item.id,
      });
    }
  };

  return (
    <div
      className="border-b last:border-b-0"
      style={{ borderColor: isLast ? "transparent" : "var(--mkt-hairline)" }}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-6 px-6 py-5 text-left transition-colors hover:bg-[var(--mkt-cream-deep)] sm:px-8 sm:py-6"
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls={`faq-${item.id}`}
      >
        <span
          className="mkt-display text-[1.0625rem] font-medium leading-[1.35] tracking-[-0.01em] sm:text-[1.125rem]"
          style={{ color: "var(--mkt-ink)" }}
          dangerouslySetInnerHTML={{ __html: item.q }}
        />
        <span
          className={`mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-transform duration-200 ${
            open ? "rotate-45" : ""
          }`}
          style={{
            borderColor: "var(--mkt-hairline-strong)",
            color: "var(--mkt-ink)",
            background: open ? "var(--mkt-cream-deep)" : "transparent",
          }}
          aria-hidden
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M5.5 1V10M1 5.5H10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>
      <div
        id={`faq-${item.id}`}
        className="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
        }}
      >
        <div className="min-h-0">
          <p
            className="px-6 pb-6 text-[0.9375rem] leading-[1.65] sm:px-8 sm:pb-7"
            style={{ color: "var(--mkt-ink-soft)" }}
          >
            {item.a}
          </p>
        </div>
      </div>
    </div>
  );
}
