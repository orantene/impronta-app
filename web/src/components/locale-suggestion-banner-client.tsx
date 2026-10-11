"use client";

import { useEffect, useState } from "react";

import {
  clearLocaleAutoMarkerLine,
  localeCookieLine,
  LOCALE_SUGGESTION_DISMISSED_COOKIE,
} from "@/i18n/locale-cookies";
import { cn } from "@/lib/utils";

/**
 * The visible half of the language suggestion banner.
 *
 * Everything about WHETHER to render is decided server-side by
 * `shouldSuggestLocale`; this component only paints the result and owns the two
 * cookie writes. Copy arrives pre-resolved IN THE SUGGESTED LANGUAGE — a
 * Spanish speaker reads Spanish, not an English sentence asking whether they
 * would like Spanish.
 *
 * Layout contract (TUL-560, replaces the TUL-394 top row): a small toast fixed
 * in the bottom-left corner. Nothing ever sits above the site header, and the
 * toast takes no layout space, so showing or dismissing it shifts nothing.
 * It floats above `--floating-chrome-bottom` (booking bar, phone chat
 * launcher) and above the demo badge, and yields entirely while the consent
 * card, a modal, the guest chat panel, or the booking dock/bar is up (see
 * `floating-chrome-stack.ts`), so it never sits over a primary action. On
 * short desktop windows it collapses to a one-row pill (the two buttons; the
 * question stays for screen readers) so it clears the hero buttons.
 * It is not in the SSR paint: it appears `LOCALE_SUGGESTION_SETTLE_MS` after
 * the window `load` event, so it never flashes over the hero while the page
 * is still arriving. Colors, radius and font come from the site's theme
 * tokens, falling back to the app palette off a talent site.
 *
 * Accept is a real `<a href>`, not a router push: the locale switch is a full
 * navigation to a different URL, exactly like `PublicLanguageToggle`. The
 * cookie write happens in the click handler and the browser follows the link
 * normally afterwards — so it still works with JS disabled, minus the cookie
 * (the proxy's own locale sync then covers it on arrival).
 */
export const LOCALE_SUGGESTION_SETTLE_MS = 1500;

export function LocaleSuggestionBannerClient({
  href,
  locale,
  localeCookieName,
  secureCookies,
  prompt,
  acceptLabel,
  dismissLabel,
  regionLabel,
}: {
  href: string;
  locale: string;
  /** Passed from the server so `LOCALE_COOKIE` keeps exactly one definition. */
  localeCookieName: string;
  secureCookies: boolean;
  prompt: string;
  acceptLabel: string;
  dismissLabel: string;
  regionLabel: string;
}) {
  const [hidden, setHidden] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(() => setSettled(true), LOCALE_SUGGESTION_SETTLE_MS);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      window.removeEventListener("load", arm);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (hidden || !settled) return null;

  const writeCookie = (name: string, value: string) => {
    document.cookie = localeCookieLine(name, value, { secure: secureCookies });
  };

  /**
   * Accepting is the most DELIBERATE act in the whole flow, so it must clear
   * the `locale_auto` marker as well as write the locale. Skipping this would
   * leave the visitor with `locale=es` + marker: they would land on the
   * Spanish page and then be offered Spanish again on the next English URL
   * they touch. The navigation that follows also lands on a `/es/...` URL,
   * where `syncLocaleCookieForPath` clears the marker a second time — belt and
   * braces on purpose, because the two paths differ for an es-default tenant
   * (there the accepted URL is UNPREFIXED and the proxy's clearing branch does
   * not run at all, leaving this the only writer that does it).
   */
  const acceptSuggestion = () => {
    writeCookie(localeCookieName, locale);
    document.cookie = clearLocaleAutoMarkerLine(secureCookies);
  };

  return (
    <div
      className="fixed left-3 z-[96] w-[calc(100%-24px)] max-w-[340px] print:hidden"
      role="region"
      aria-label={regionLabel}
      data-locale-suggestion={locale}
    >
      <div
        data-locale-suggestion-card=""
        className={cn(
          "flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 shadow-md",
          "rounded-[var(--token-shape-radius-card,min(var(--site-radius-lg,0.75rem),1.25rem))] border",
          "border-[var(--token-color-line,var(--border))]",
          "bg-[var(--token-color-surface-raised,var(--token-color-background,var(--background)))]",
          "text-[13px] text-[var(--token-color-ink,var(--foreground))]",
          "[font-family:var(--site-body-font,inherit)]",
        )}
      >
        <p data-locale-suggestion-prompt="" className="min-w-0 flex-1 leading-snug">
          {prompt}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={href}
            hrefLang={locale}
            lang={locale}
            onClick={acceptSuggestion}
            className={cn(
              "inline-flex items-center rounded-[var(--token-button-radius,0.375rem)] px-2.5 py-1 text-xs font-medium",
              "bg-[var(--token-color-primary,var(--foreground))]",
              "text-[var(--token-color-primary-on,var(--background))]",
              "no-underline transition-opacity hover:opacity-90",
            )}
          >
            {acceptLabel}
          </a>
          <button
            type="button"
            onClick={() => {
              writeCookie(LOCALE_SUGGESTION_DISMISSED_COOKIE, "1");
              setHidden(true);
            }}
            className={cn(
              "inline-flex items-center rounded-[var(--token-button-radius,0.375rem)] px-2.5 py-1 text-xs font-medium",
              "text-[var(--token-color-muted,var(--muted-foreground))] transition-opacity hover:opacity-80",
            )}
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
