"use client";

import { useEffect, useState } from "react";

import {
  CONSENT_BANNER_CLOSED_EVENT,
  CONSENT_CHANGE_EVENT,
  isGpcEnabled,
  readStoredConsent,
  shouldShowBanner,
} from "@/lib/analytics/consent";
import {
  clearLocaleAutoMarkerLine,
  localeCookieLine,
  LOCALE_SUGGESTION_DISMISSED_COOKIE,
} from "@/i18n/locale-cookies";
import { cn } from "@/lib/utils";

/** Session backup when the dismiss cookie is blocked or stripped on reload. */
const DISMISS_SESSION_KEY = "tulala_locale_suggest_dismissed";

function readDismissedLocally(): boolean {
  if (typeof document === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(DISMISS_SESSION_KEY)) return true;
  } catch {
    /* ignore */
  }
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${LOCALE_SUGGESTION_DISMISSED_COOKIE}=([^;]*)`),
    );
    return Boolean(match?.[1]);
  } catch {
    return false;
  }
}

function writeDismissedLocally(secureCookies: boolean): void {
  document.cookie = localeCookieLine(LOCALE_SUGGESTION_DISMISSED_COOKIE, "1", {
    secure: secureCookies,
  });
  try {
    window.sessionStorage.setItem(DISMISS_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * The visible half of the language suggestion banner.
 *
 * Everything about WHETHER to render is decided server-side by
 * `shouldSuggestLocale`; this component only paints the result and owns the two
 * cookie writes. Copy arrives pre-resolved IN THE SUGGESTED LANGUAGE — a
 * Spanish speaker reads Spanish, not an English sentence asking whether they
 * would like Spanish.
 *
 * Layout contract (TUL-394): a thin row IN DOCUMENT FLOW at the very top of
 * the page (mounted as the first child of `<body>`, which is a flex column).
 * It is never a fixed overlay, so it can never sit over a primary action: the
 * /start "Continuar" footer, the booking dock and the sticky booking bar all
 * live at the bottom and keep their space. It is rendered in the SSR HTML (not
 * mounted by an effect), so it is in the first paint and shifts nothing after
 * it; dismissing it removes the row and the content moves up once.
 *
 * Consent queue (live2b-05): while the cookie card is up, CSS also hides this
 * row (`body:has([data-consent-banner])`). After the card closes we must paint
 * with a live click handler — importing through `locale-suggestion` used to
 * pull the server middleware module into the client bundle and left the SSR
 * "No thanks" button inert. This file imports only the leaf cookie helpers.
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
  /** True while the cookie card owns the first decision (consent-then-language). */
  const [yieldToConsent, setYieldToConsent] = useState(false);

  useEffect(() => {
    if (readDismissedLocally()) {
      setHidden(true);
      return;
    }
    if (shouldShowBanner(readStoredConsent(), isGpcEnabled())) {
      setYieldToConsent(true);
    }
    const release = () => setYieldToConsent(false);
    window.addEventListener(CONSENT_CHANGE_EVENT, release);
    window.addEventListener(CONSENT_BANNER_CLOSED_EVENT, release);
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, release);
      window.removeEventListener(CONSENT_BANNER_CLOSED_EVENT, release);
    };
  }, []);

  if (hidden || yieldToConsent) return null;

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
      // In flow, top of the page: never overlays content or a bottom CTA.
      className="relative flex shrink-0 justify-center px-3 py-2 print:hidden"
      role="region"
      aria-label={regionLabel}
      data-locale-suggestion={locale}
    >
      <div
        className={cn(
          "flex w-full max-w-lg flex-wrap items-center gap-x-3 gap-y-2",
          "rounded-lg border border-border/60 bg-background/95 px-3 py-2 shadow-sm",
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
              writeDismissedLocally(secureCookies);
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
