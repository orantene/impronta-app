"use client";

/**
 * LocaleSwitchPill: the top bar's "ES | EN" switch for a talent with exactly
 * one secondary language (PR 7). Same 32px height, border and radius as the
 * search and + buttons beside it. A radiogroup: Left / Right move the choice.
 * Picking writes the dashboard cookie and reloads (the caller's `onPick`), so
 * copy and the content locale both follow. The site's primary never changes.
 *
 * Token classes only; inline styles are frozen under components/admin/shell.
 */
import { useRef, type KeyboardEvent } from "react";

import { getLocaleMetadata, type Locale } from "@/i18n/config";
import { nextTabIndex } from "@/lib/i18n/locale-field-model";

export function LocaleSwitchPill({
  locales,
  active,
  label,
  onPick,
}: {
  locales: readonly Locale[];
  active: Locale;
  label: string;
  onPick: (next: Locale) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, locales.indexOf(active));

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextTabIndex(index, event.key, locales.length);
    if (next === index) return;
    event.preventDefault();
    refs.current[next]?.focus();
    const code = locales[next];
    if (code) onPick(code);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-tulala-locale-switch
      className="inline-flex h-[32px] shrink-0 items-center gap-px rounded-[9px] border border-admin-border bg-admin-card p-[2px] font-admin-body"
    >
      {locales.map((code, i) => {
        const on = i === activeIndex;
        return (
          <button
            key={code}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={getLocaleMetadata(code).label}
            title={getLocaleMetadata(code).label}
            tabIndex={on ? 0 : -1}
            onClick={() => {
              if (!on) onPick(code);
            }}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`inline-flex h-full min-w-[30px] cursor-pointer items-center justify-center rounded-[7px] px-[7px] text-admin-11h font-semibold uppercase tracking-[0.04em] [transition:color_var(--transition-admin-micro)] ${
              on ? "bg-admin-surface-alt text-admin-ink" : "text-admin-ink-muted hover:text-admin-ink"
            }`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
