"use client";

import { useState } from "react";
import { getMarketingCopy } from "@/lib/marketing/copy";
import { withLocaleHref } from "@/i18n/pathnames";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { MarketingCta } from "./cta-link";
import { trackProductEvent } from "@/lib/analytics/track-client";

type QA = { id: string; q: string; a: string };

export function FaqSection({ locale = "en" }: { locale?: string }) {
  const copy = getMarketingCopy(locale).faq;
  const faqs: QA[] = copy.items.map((it, i) => ({ id: String(i), q: it.q, a: it.a }));

  return (
    <MarketingSection id="faq" style={{ background: "var(--mkt-surface)" }}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--mkt-hairline)" }}
      />
      <MarketingContainer size="default">
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

        <div
          className="mx-auto mt-14 max-w-3xl overflow-hidden rounded-[24px] border"
          style={{
            borderColor: "var(--mkt-hairline-strong)",
            background: "var(--mkt-surface-raised)",
          }}
        >
          {faqs.map((f, i) => (
            <FaqItem key={f.id} item={f} isLast={i === faqs.length - 1} />
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <p className="text-[0.9375rem]" style={{ color: "var(--mkt-muted)" }}>
            {copy.stillQuestions}
          </p>
          <MarketingCta
            href={withLocaleHref("/faq", locale)}
            variant="inline"
            size="md"
            eventSource="home-faq"
            eventIntent="faq-deep"
          >
            {copy.seeAll}
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
        >
          {item.q}
        </span>
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
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
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
