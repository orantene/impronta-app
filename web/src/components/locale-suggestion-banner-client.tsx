"use client";

import Link from "next/link";
import { useState } from "react";

import { clearLocaleAutoMarkerLine, localeCookieLine } from "@/i18n/locale-cookies";
import { LOCALE_SUGGESTION_DISMISSED_COOKIE } from "@/i18n/locale-suggestion";
import { cn } from "@/lib/utils";

/**
 * The visible half of the language suggestion toast (TUL-516 P1).
 *
 * Everything about WHETHER to render is decided server-side by
 * `shouldSuggestLocale`; this component only paints the result and owns the two
 * cookie writes. Copy arrives pre-resolved IN THE SUGGESTED LANGUAGE — a
 * Spanish speaker reads Spanish, not an English sentence asking whether they
 * would like Spanish.
 *
 * Layout contract (TUL-516 P1): a fixed floating toast — bottom on phone,
 * bottom-right on desktop — out of document flow so theme headers are never
 * pushed down. Positioning and clearance come from `floating-chrome-stack`
 * (hidden while the cookie banner is up; yields to the booking dock/bar).
 *
 * Accept uses next/link for an internal same-site navigation. The cookie write
 * happens in the click handler; without JS the link still works and the proxy
 * locale sync covers the cookie on arrival.
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
      className="print:hidden"
      role="region"
      aria-label={regionLabel}
      data-locale-suggestion={locale}
    >
      <div
        className={cn(
          "flex w-full flex-wrap items-center gap-x-3 gap-y-2",
          "rounded-lg border border-border/60 bg-background/95 px-3 py-2 shadow-sm",
          "text-sm text-foreground",
        )}
      >
        <p className="min-w-0 flex-1 leading-snug">{prompt}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
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
          </Link>
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
