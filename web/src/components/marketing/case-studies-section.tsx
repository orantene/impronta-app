"use client";

/**
 * Stories — the platform's social-proof surface. A filterable grid of example
 * businesses (talent / business / hub / hybrid). Clicking a card opens a wide
 * two-column modal: a large lifestyle image on the left, the full story on the
 * right, and an example "live page" link at the bottom.
 *
 * Self-contained: the grid + modal state live here (a client island inside the
 * server-rendered homepage). The modal portals to `document.body` and re-scopes
 * `data-platform-surface="marketing"` so the `--plt-*` tokens resolve outside
 * the layout subtree — same mechanics as the talent register modal. Story
 * content lives in `./case-studies-data`.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { CASE_STUDY_PHOTOS, type MarketingPhoto } from "@/lib/marketing/photography";
import { trackProductEvent } from "@/lib/analytics/track-client";
import {
  CASE_STUDIES,
  FILTERS,
  type CaseStudy,
  type Motion,
} from "./case-studies-data";
import { MarketingContainer, MarketingEyebrow, MarketingSection } from "./container";
import { EditorialFrame } from "./editorial-image";

export function CaseStudiesSection() {
  const [filter, setFilter] = useState<Motion | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const visible = filter ? CASE_STUDIES.filter((c) => c.motion === filter) : CASE_STUDIES;
  const active = openKey ? CASE_STUDIES.find((c) => c.key === openKey) ?? null : null;

  const open = (study: CaseStudy) => {
    setOpenKey(study.key);
    trackProductEvent("marketing_cta_clicked", {
      source_page: "home-stories",
      intent: "case-study-open",
      href: study.key,
    });
  };

  return (
    <MarketingSection id="stories" style={{ background: "var(--mkt-surface)" }}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--mkt-hairline)" }}
      />
      <MarketingContainer size="wide">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingEyebrow>Stories</MarketingEyebrow>
          <h2
            className="mkt-display mt-5 text-[2rem] font-medium tracking-[-0.02em] sm:text-[2.75rem] md:text-[3rem]"
            style={{ color: "var(--mkt-ink)" }}
          >
            One platform. Every kind of
            <br className="hidden sm:block" /> talent business.
          </h2>
          <p
            className="mx-auto mt-5 max-w-xl text-[1rem] leading-[1.6] sm:text-[1.0625rem]"
            style={{ color: "var(--mkt-muted)" }}
          >
            From a solo singer to a city-wide services hub — see how people use Tulala to sell
            their work, run their business, or both. Tap any story to read it.
          </p>
        </div>

        {/* Filter chips */}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-2">
          {FILTERS.map((f) => {
            const isActive = filter === f.value;
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => setFilter(f.value)}
                className="rounded-full px-4 py-2 text-[0.8125rem] font-medium leading-none transition-colors"
                style={{
                  background: isActive ? "var(--plt-forest)" : "var(--plt-bg-elevated)",
                  color: isActive ? "var(--plt-forest-on)" : "var(--plt-ink-soft)",
                  border: `1px solid ${isActive ? "var(--plt-forest)" : "var(--plt-hairline-strong)"}`,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Card grid */}
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {visible.map((study) => (
            <CaseStudyCard key={study.key} study={study} onOpen={() => open(study)} />
          ))}
        </div>

        <p
          className="mx-auto mt-10 max-w-2xl text-center text-[0.8125rem] leading-[1.5]"
          style={{ color: "var(--mkt-muted)" }}
        >
          Illustrative stories that show what&rsquo;s possible today. Real customer pages connect
          here as they launch.
        </p>
      </MarketingContainer>

      {active ? <CaseStudyModal study={active} onClose={() => setOpenKey(null)} /> : null}
    </MarketingSection>
  );
}

const MOTION_FG: Record<Motion, string> = {
  Talent: "var(--plt-forest)",
  Business: "var(--plt-ink)",
  Hub: "#3f6b54",
  Hybrid: "var(--plt-forest-bright)",
};

/** Solid, readable plan pill — works as a raised tab on a card or a label over a photo. */
function MotionPill({ motion, plan }: { motion: Motion; plan: string }) {
  return (
    <span
      className="plt-mono inline-flex items-center rounded-full px-3 py-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.16em]"
      style={{
        background: "var(--plt-bg-elevated)",
        color: MOTION_FG[motion],
        border: "1px solid var(--plt-hairline-strong)",
        boxShadow: "0 8px 22px -10px rgba(15,23,20,0.45)",
      }}
    >
      {plan}
    </span>
  );
}

function CaseStudyCard({ study, onOpen }: { study: CaseStudy; onOpen: () => void }) {
  return (
    <article
      className="group relative flex h-full flex-col rounded-[20px] transition-transform duration-300 hover:-translate-y-1"
      style={{
        background: "var(--plt-bg-elevated)",
        border: "1px solid var(--plt-hairline)",
        boxShadow: "0 24px 56px -32px rgba(15,23,20,0.22)",
      }}
    >
      {/* Plan badge — a raised tab that hangs off the top-right edge */}
      <div className="pointer-events-none absolute -top-3 right-4 z-20">
        <MotionPill motion={study.motion} plan={study.plan} />
      </div>

      <div className="overflow-hidden rounded-t-[20px]">
        <EditorialFrame
          bare
          photo={CASE_STUDY_PHOTOS[study.key] as MarketingPhoto}
          aspect="landscape"
          tone="cream"
          className="w-full"
        />
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3
          className="plt-display text-[1.1875rem] font-semibold leading-[1.2] tracking-[-0.02em]"
          style={{ color: "var(--plt-ink)" }}
        >
          {study.cardTitle}
        </h3>
        <p className="mt-2 text-[0.875rem] leading-[1.55]" style={{ color: "var(--plt-muted)" }}>
          {study.cardSummary}
        </p>
        <div
          className="mt-4 flex items-center gap-1.5 pt-1 text-[0.8125rem] font-medium"
          style={{ color: "var(--plt-forest)" }}
        >
          <span>{study.persona}</span>
          <span style={{ color: "var(--plt-hairline-strong)" }}>·</span>
          <span style={{ color: "var(--plt-muted)" }}>{study.role}</span>
        </div>
        <div
          className="mt-auto flex items-center gap-1.5 pt-4 text-[0.8125rem] font-medium"
          style={{ color: "var(--plt-ink-soft)" }}
        >
          Read the story
          <ArrowGlyph />
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 rounded-[20px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plt-forest)]"
        aria-label={`Read ${study.persona}'s story`}
      />
    </article>
  );
}

/* ───────────────────────── Modal ───────────────────────── */

function CaseStudyModal({ study, onClose }: { study: CaseStudy; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!mounted) return null;

  const photo = CASE_STUDY_PHOTOS[study.key] as MarketingPhoto;

  return createPortal(
    <div data-platform-surface="marketing">
      <div
        className="fixed inset-0 z-[200] bg-[rgba(15,23,20,0.62)] backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className="fixed inset-0 z-[201] flex items-center justify-center overflow-y-auto p-4 sm:p-6"
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cs-modal-title"
          onClick={(e) => e.stopPropagation()}
          className="relative flex max-h-[92vh] w-full max-w-[1040px] flex-col overflow-y-auto rounded-[28px] mkt-rise lg:h-[min(86vh,720px)] lg:max-h-none lg:flex-row lg:overflow-hidden"
          style={{
            background: "var(--plt-bg-elevated)",
            border: "1px solid var(--plt-hairline-strong)",
            boxShadow: "0 40px 100px -32px rgba(15,23,20,0.5)",
          }}
        >
          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105"
            style={{
              background: "var(--plt-bg-elevated)",
              border: "1px solid var(--plt-hairline-strong)",
              color: "var(--plt-ink)",
              boxShadow: "0 4px 12px -4px rgba(15,23,20,0.3)",
            }}
          >
            <CloseGlyph />
          </button>

          {/* Image column (~58% on desktop) */}
          <div className="relative aspect-[16/10] w-full shrink-0 sm:aspect-[2/1] lg:aspect-auto lg:h-full lg:w-[58%]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url({ w: 1600, q: 78 })}
              alt={photo.alt}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: "50% 42%" }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(15,23,20,0.06) 30%, rgba(15,23,20,0.5) 100%)",
              }}
            />
            <div
              aria-hidden
              className="plt-grain pointer-events-none absolute inset-0 opacity-[0.16] mix-blend-overlay"
            />
            <div className="absolute inset-x-5 bottom-5 sm:inset-x-7 sm:bottom-7">
              <MotionPill motion={study.motion} plan={study.plan} />
              <p
                className="plt-display mt-3 text-[1.5rem] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[1.875rem]"
                style={{ color: "var(--plt-on-inverse)" }}
              >
                {study.persona}
              </p>
              <p className="mt-1 text-[0.875rem]" style={{ color: "rgba(241,237,227,0.82)" }}>
                {study.role} · {study.location}
              </p>
            </div>
          </div>

          {/* Content column */}
          <div className="flex min-w-0 flex-1 flex-col lg:h-full lg:overflow-y-auto">
            <div className="flex flex-col gap-6 p-6 sm:p-8">
              <h3
                id="cs-modal-title"
                className="plt-display text-[1.375rem] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[1.625rem]"
                style={{ color: "var(--plt-ink)" }}
              >
                {study.cardTitle}
              </h3>

              <Block label="The challenge">
                <p className="text-[0.9375rem] leading-[1.6]" style={{ color: "var(--plt-ink-soft)" }}>
                  {study.challenge}
                </p>
              </Block>

              <Block label="How they use Tulala">
                <ul className="space-y-2.5">
                  {study.approach.map((a) => (
                    <li
                      key={a}
                      className="flex items-start gap-2.5 text-[0.9375rem] leading-[1.55]"
                      style={{ color: "var(--plt-ink-soft)" }}
                    >
                      <CheckGlyph />
                      {a}
                    </li>
                  ))}
                </ul>
              </Block>

              <Block label="The result">
                <div className="grid grid-cols-3 gap-3">
                  {study.outcome.map((o) => (
                    <div
                      key={o.label}
                      className="rounded-2xl px-3 py-4 text-center"
                      style={{
                        background: "var(--plt-bg-raised)",
                        border: "1px solid var(--plt-hairline)",
                      }}
                    >
                      <div
                        className="plt-display text-[1.375rem] font-semibold leading-none tracking-[-0.02em]"
                        style={{ color: "var(--plt-forest)" }}
                      >
                        {o.stat}
                      </div>
                      <div className="mt-1.5 text-[0.6875rem] leading-[1.3]" style={{ color: "var(--plt-muted)" }}>
                        {o.label}
                      </div>
                    </div>
                  ))}
                </div>
              </Block>

              <blockquote
                className="rounded-2xl p-5"
                style={{ background: "var(--plt-bg-raised)", border: "1px solid var(--plt-hairline)" }}
              >
                <p
                  className="plt-display text-[1.0625rem] font-medium leading-[1.4] tracking-[-0.01em]"
                  style={{ color: "var(--plt-ink)" }}
                >
                  &ldquo;{study.quote}&rdquo;
                </p>
                <footer className="mt-2 text-[0.8125rem]" style={{ color: "var(--plt-muted)" }}>
                  — {study.persona}, {study.role}
                </footer>
              </blockquote>

              <div className="flex flex-wrap gap-1.5">
                {study.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-2.5 py-1 text-[0.6875rem] font-medium"
                    style={{
                      background: "var(--plt-bg-raised)",
                      color: "var(--plt-ink-soft)",
                      border: "1px solid var(--plt-hairline)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Footer CTA — the example "live page" link */}
            <div
              className="mt-auto flex flex-col gap-3 border-t p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
              style={{ borderColor: "var(--plt-hairline)", background: "var(--plt-bg-raised)" }}
            >
              <div className="min-w-0">
                <div className="plt-mono inline-flex items-center gap-1.5 text-[0.8125rem]" style={{ color: "var(--plt-ink)" }}>
                  <GlobeGlyph />
                  <span className="truncate">{study.link}</span>
                </div>
                <p className="mt-1 text-[0.6875rem]" style={{ color: "var(--plt-muted)" }}>
                  Example page · live link coming soon
                </p>
              </div>
              <a
                href={`https://${study.link}`}
                onClick={(e) => e.preventDefault()}
                className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-3 text-[0.875rem] font-medium leading-none transition-transform hover:-translate-y-[1px]"
                style={{
                  background: "var(--plt-forest)",
                  color: "var(--plt-forest-on)",
                  boxShadow: "var(--plt-shadow-forest)",
                }}
              >
                Preview the page
                <ArrowGlyph />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="plt-mono mb-2.5 text-[0.625rem] font-semibold uppercase tracking-[0.2em]"
        style={{ color: "var(--plt-forest)" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

/* ───────────────────────── Glyphs ───────────────────────── */

function ArrowGlyph() {
  return (
    <svg
      aria-hidden
      width="13"
      height="9"
      viewBox="0 0 14 10"
      fill="none"
      className="transition-transform duration-200 group-hover:translate-x-0.5"
    >
      <path
        d="M1 5H13M13 5L9 1M13 5L9 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <span
      className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={{ background: "rgba(31,74,58,0.12)" }}
      aria-hidden
    >
      <svg width="9" height="7" viewBox="0 0 11 9" fill="none">
        <path
          d="M1 4.5L4 7.5L10 1.5"
          stroke="var(--plt-forest)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function CloseGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GlobeGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--plt-forest)" }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3 12H21M12 3C14.5 5.5 14.5 18.5 12 21M12 3C9.5 5.5 9.5 18.5 12 21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
