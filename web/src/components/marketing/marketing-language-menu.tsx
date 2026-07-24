"use client";

import { useEffect, useRef, useState } from "react";
import { withLocalePath } from "@/i18n/pathnames";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { cn } from "@/lib/utils";
import { HeaderPopover } from "./marketing-header-popover";

/**
 * Language control for the marketing header: a globe icon button that opens a
 * small menu, matching the support (`?`) control beside it.
 *
 * Replaces the previous inline EN|ES segmented pill. Two reasons: a segmented
 * toggle reads as a filter rather than a setting, and it put two competing
 * text chips in a bar that already carries the wordmark, five nav items and
 * two CTAs. One icon that expands on demand keeps the bar quiet and scales if
 * a third locale is ever added.
 *
 * Still plain `<a>` links, never `next/link` — locale switching goes through a
 * rewrite and client navigation strips it. Server data (`activeLocale`,
 * `pathnameWithoutLocale`) is passed down from the shell; only the open/close
 * state is client-side.
 */

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  es: "Español",
};

/**
 * Flags are decoration, never the label. Two reasons they stay paired with
 * text: a flag names a country, not a language (Español is not only Mexico),
 * and Windows ships no flag-emoji font, so Chrome/Edge there render the raw
 * regional-indicator letters ("MX") instead of an image. With the written
 * name alongside, that degradation reads as a small prefix rather than a
 * broken glyph. Marked aria-hidden so screen readers announce only the name.
 *
 * MX rather than ES for Spanish: the platform's Spanish-speaking tenants and
 * traffic are Mexico-first.
 */
const LOCALE_FLAGS: Record<string, string> = {
  en: "🇺🇸",
  es: "🇲🇽",
};

const ROW =
  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[0.875rem] font-medium transition-colors hover:bg-[var(--plt-bg-raised)]";

export function MarketingLanguageMenu({
  activeLocale,
  pathnameWithoutLocale,
  className,
  availableLocales,
  defaultLocale = FALLBACK_LANGUAGE_SETTINGS.defaultLocale,
  label = "Language",
}: {
  activeLocale: string;
  pathnameWithoutLocale: string;
  className?: string;
  availableLocales?: readonly string[];
  defaultLocale?: string;
  /** Localized accessible name + menu heading (e.g. "Idioma" in Spanish). */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const locales = availableLocales ?? FALLBACK_LANGUAGE_SETTINGS.publicLocales;
  if (locales.length <= 1) return null;

  const settings = {
    ...FALLBACK_LANGUAGE_SETTINGS,
    defaultLocale,
    publicLocales: Array.from(locales),
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        /* Colours as classes, not inline `style` — inline declarations outrank
           stylesheet rules, which would nullify the `hover:` variants. */
        className="flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-[var(--plt-hairline-strong)] bg-[var(--plt-bg-raised)] px-2.5 text-[var(--plt-ink-soft)] transition-[background-color,border-color,color] hover:border-[var(--plt-ink-soft)] hover:bg-[var(--plt-bg-deep)] hover:text-[var(--plt-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plt-forest)]"
      >
        <GlobeGlyph />
        {/* The active locale stays visible so the current language is legible
            without opening the menu. Uppercase, quiet, never a second CTA. */}
        <span className="text-[0.6875rem] font-semibold uppercase leading-none tracking-[0.06em]">
          {activeLocale}
        </span>
      </button>

      {open ? (
        <HeaderPopover label={label} widthClass="lg:w-[12rem]" onClose={() => setOpen(false)}>
          <p
            className="px-3 pb-1 pt-1 text-[0.6875rem] font-medium uppercase tracking-wide"
            style={{ color: "var(--plt-muted)" }}
          >
            {label}
          </p>
          {locales.map((code) => {
            const active = activeLocale === code;
            return (
              <a
                key={code}
                href={withLocalePath(pathnameWithoutLocale, code, settings)}
                role="menuitem"
                aria-current={active ? "true" : undefined}
                className={ROW}
                style={{
                  color: active ? "var(--plt-ink-strong)" : "var(--plt-ink)",
                  background: active ? "var(--plt-bg-raised)" : undefined,
                }}
              >
                <span className="flex items-center gap-2.5">
                  {LOCALE_FLAGS[code] ? (
                    <span aria-hidden className="text-[1.0625rem] leading-none">
                      {LOCALE_FLAGS[code]}
                    </span>
                  ) : null}
                  {LOCALE_LABELS[code] ?? code.toUpperCase()}
                </span>
                {active ? <CheckGlyph /> : null}
              </a>
            );
          })}
        </HeaderPopover>
      ) : null}
    </div>
  );
}

function GlobeGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.2 9.5h17.6M3.2 14.5h17.6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ color: "var(--plt-forest)" }}
    >
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
