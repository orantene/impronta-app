"use client";

/**
 * Screen 1 of 4: "How do you work?" Three large cards, one tap to choose, the
 * selected card fills lime and a one-line "We'll create..." confirms what the
 * choice makes. Copy is local (ES/EN pairs from the 1B ticket).
 */

import { withLocaleHref } from "@/i18n/pathnames";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";

import { CHOOSE_COPY, type FlowLocale } from "@/lib/onboarding/flow";
import type { OnboardingChoice } from "@/lib/onboarding/module-state";

import { PrimaryButton } from "../ui";

const ORDER: OnboardingChoice[] = ["myself", "studio", "both"];

function Icon({ choice }: { choice: OnboardingChoice }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (choice === "myself") return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></svg>;
  if (choice === "studio") return <svg {...common}><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.4" /><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5M15.5 14.4c2.6-.3 5.5 1 5.5 4" /></svg>;
  return <svg {...common}><circle cx="8" cy="8" r="2.8" /><circle cx="16.5" cy="9" r="2.4" /><path d="M2.5 19c0-2.8 2.4-4.6 5.5-4.6s5.5 1.8 5.5 4.6M14.5 14.6c3-.4 6 .9 6 4" /></svg>;
}

export function ChooseStep({
  locale,
  initial,
  busy,
  onContinue,
}: {
  locale: FlowLocale;
  initial: OnboardingChoice | null;
  busy: boolean;
  onContinue: (choice: OnboardingChoice) => void;
}) {
  const c = CHOOSE_COPY[locale];
  const [selected, setSelected] = useState<OnboardingChoice | null>(initial);
  const [agencyOpen, setAgencyOpen] = useState(false);
  const cardRefs = useRef<Partial<Record<OnboardingChoice, HTMLButtonElement | null>>>({});
  // Roving tabindex (TUL-1125): one Tab stop for the group, arrows move and select.
  const tabStop: OnboardingChoice = selected ?? ORDER[0];
  const onCardKey = (e: KeyboardEvent<HTMLButtonElement>, choice: OnboardingChoice) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    // Home / End jump to the first / last card (radio group pattern).
    const edge = e.key === "Home" ? 0 : e.key === "End" ? ORDER.length - 1 : null;
    if (!step && edge === null) return;
    e.preventDefault();
    const next = edge !== null ? ORDER[edge] : ORDER[(ORDER.indexOf(choice) + step + ORDER.length) % ORDER.length];
    setSelected(next);
    cardRefs.current[next]?.focus();
  };
  return (
    <div data-testid="onb-choose">
      <h1 className="tl-display font-semibold leading-[1.08] tracking-[-0.03em]" style={{ color: "var(--tl-ink)", fontSize: 32 }}>
        {c.title}
      </h1>
      <p className="mt-2 text-[0.9375rem] leading-[1.5]" style={{ color: "var(--tl-ink-soft)" }}>{c.subtitle}</p>
      <div className="mt-6 flex flex-col gap-3" role="radiogroup" aria-label={c.title}>
        {ORDER.map((choice) => {
          const on = selected === choice;
          return (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={choice === tabStop ? 0 : -1}
              ref={(el) => { cardRefs.current[choice] = el; }}
              disabled={busy}
              onClick={() => setSelected(choice)}
              onKeyDown={(e) => onCardKey(e, choice)}
              data-testid={`onb-choice-${choice}`}
              className="flex min-h-[76px] w-full touch-manipulation items-center gap-4 rounded-[22px] px-4 py-3 text-left transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tl-forest)] motion-reduce:transition-none disabled:opacity-60"
              style={{
                background: on ? "var(--tl-lime)" : "var(--tl-surface-raised)",
                border: `1.5px solid ${on ? "var(--tl-lime-edge)" : "var(--tl-hairline-strong)"}`,
                color: "var(--tl-ink)",
              }}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-[14px]" style={{ background: on ? "var(--tl-surface-raised)" : "var(--tl-stone-soft)", color: "var(--tl-forest)" }}>
                <Icon choice={choice} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[1.0625rem] font-semibold leading-tight">{c.cards[choice].title}</span>
                <span className="mt-0.5 block text-[0.8125rem] leading-snug" style={{ color: "var(--tl-ink-soft)" }}>{c.cards[choice].sub}</span>
              </span>
              {/* TUL-811: a radio mark, not a chevron; the card selects, Continue moves on. */}
              <span aria-hidden data-testid={`onb-choice-mark-${choice}`} className="grid size-6 shrink-0 place-items-center rounded-full" style={{ border: `1.5px solid ${on ? "var(--tl-forest)" : "var(--tl-hairline-strong)"}`, background: on ? "var(--tl-forest)" : "transparent" }}>
                {on ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--tl-forest-on)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2l2.3 2.3 4.7-4.9" /></svg> : null}
              </span>
            </button>
          );
        })}
      </div>
      {/* Reserved height so selecting a card does not shove the rest of the page. */}
      <div className="mt-2 min-h-[2.6em] px-2" aria-live="polite">
        {selected ? (
          <p className="text-[0.8125rem] leading-snug" style={{ color: "var(--tl-forest)" }} data-testid="onb-creates">
            {c.createsPrefix}
            {c.cards[selected].creates}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setAgencyOpen((v) => !v)}
        aria-expanded={agencyOpen}
        data-testid="onb-agency-link"
        className="mt-5 inline-flex min-h-11 items-center text-[0.875rem] font-medium underline underline-offset-4"
        style={{ color: "var(--tl-ink-soft)" }}
      >
        {c.agencyLink}
      </button>
      <Link
        href={withLocaleHref("/directory", locale)}
        data-testid="onb-book-link"
        className="mt-1 inline-flex min-h-11 items-center text-[0.875rem] font-medium underline underline-offset-4 sm:ml-5"
        style={{ color: "var(--tl-ink-soft)" }}
      >
        {c.bookLink}
      </Link>
      {agencyOpen ? (
        <p className="mt-1 text-[0.875rem] leading-[1.5]" style={{ color: "var(--tl-ink-soft)" }} data-testid="onb-agency-note">{c.agencyNote}</p>
      ) : null}
      <div className="sticky bottom-0 -mx-4 mt-6 px-4 pb-1 pt-3 sm:mx-0 sm:px-0" style={{ background: "var(--tl-bone)" }}>
        <PrimaryButton disabled={!selected || busy} onClick={() => selected && onContinue(selected)} testId="onb-choose-continue">
          {c.next}
        </PrimaryButton>
      </div>
    </div>
  );
}
