"use client";

import { useState } from "react";

import { clearLocaleAutoMarkerLine, localeCookieLine } from "@/i18n/locale-cookies";
import { LOCALE_SUGGESTION_DISMISSED_COOKIE } from "@/i18n/locale-suggestion";
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
 * Layout contract (CLS): `position: fixed`, bottom of the viewport, outside
 * document flow. It cannot shift a single pixel of page content, so it costs
 * nothing on Cumulative Layout Shift no matter when it paints. It is rendered
 * in the SSR HTML (not mounted by an effect), so there is no pop-in either.
 *
 * Accept is a real `<a href>`, not a router push: the locale switch is a full
 * navigation to a different URL, exactly like `PublicLanguageToggle`. The
 * cookie write happens in the click handler and the browser follows the link
 * normally afterwards — so it still works with JS disabled, minus the cookie
 * (the proxy's own locale sync then covers it on arrival).
 */
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
  if (hidden) return null;

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
      // `fixed` + `pointer-events-none` on the positioning layer so the strip
      // never blocks a click on the content it floats over; only the card
      // itself takes pointer events back.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 print:hidden"
      role="region"
      aria-label={regionLabel}
      data-locale-suggestion={locale}
    >
      <div
        className={cn(
          "pointer-events-auto flex w-full max-w-lg flex-wrap items-center gap-x-3 gap-y-2",
          "rounded-lg border border-border/60 bg-background/95 px-3 py-2 shadow-lg backdrop-blur",
          "text-sm text-foreground",
        )}
      >
        <p className="min-w-0 flex-1 leading-snug">{prompt}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={href}
            hrefLang={locale}
            lang={locale}
            onClick={acceptSuggestion}
            className={cn(
              "inline-flex items-center rounded-md bg-foreground px-2.5 py-1 text-xs font-medium",
              "text-background no-underline transition-opacity hover:opacity-90",
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
              "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium",
              "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            )}
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
