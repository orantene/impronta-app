"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { translatorFor } from "@/i18n/use-t";
import { getSiteUrl } from "@/lib/auth-flow";
import {
  PRIVACY_CHOICES_EVENT,
  isConsentBannerSuppressedPath,
  isGpcEnabled,
  readStoredConsent,
  shouldShowBanner,
  syncConsentCookie,
  writeConsent,
  type StoredConsent,
} from "@/lib/analytics/consent";

// Session-only dismiss flag — user wants to close the banner without
// committing to accept/decline for now. Cleared by tab close.
const DISMISS_SESSION_KEY = "impronta_analytics_consent_dismissed_at";

declare global {
  interface Window {
    /** Set by the TikTok snippet when the tenant HAS a pixel configured. */
    __ttqConfigured?: boolean;
    /** Set by the LinkedIn snippet when the tenant HAS a tag configured. */
    __lintrkConfigured?: boolean;
    ttq?: { page?: () => void };
    lintrk?: unknown;
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * Activate the NON-Google pixels on acceptance.
 *
 * Only gtag listens for a consent update. Meta was explicitly revoked at init
 * and TikTok/LinkedIn return early when storage isn't 'granted', so before
 * this they stayed dark for the ENTIRE session — the first and highest-intent
 * visit was invisible to paid attribution, and SpaPageViewTracker's
 * window.fbq / window.ttq calls were silent no-ops on every later navigation.
 *
 * Meta can be flipped in place. TikTok/LinkedIn have no runtime consent API,
 * so their loaders must actually run; a reload is the only reliable way to
 * re-enter their init path, and it happens once, immediately after a click
 * the visitor just made.
 */
function activatePixelsAfterConsent() {
  if (typeof window === "undefined") return;
  window.fbq?.("consent", "grant");
  const needsLoad =
    (window.__ttqConfigured === true && !window.ttq) ||
    (window.__lintrkConfigured === true && !window.lintrk);
  if (needsLoad) window.location.reload();
}

/**
 * On the authenticated dashboard the banner must never sit on a control:
 * below 720px the shell draws a fixed bottom tab bar (lift the banner above
 * it), and from 721px the shell draws a 240px left rail whose last rows are
 * Support and Settings (start the banner to the right of it). Keyed off the
 * shell's own hooks, so public pages and the marketing site are unchanged.
 */
const CONSENT_BANNER_SHELL_OFFSET_CSS = `
@media (max-width: 720px) {
  body:has([data-tulala-mobile-bottom-nav]) [data-consent-banner] {
    bottom: calc(76px + env(safe-area-inset-bottom, 0px));
  }
}
@media (min-width: 721px) {
  body:has([data-tulala-app-sidebar]) [data-consent-banner] {
    left: calc(240px + 1rem);
  }
}
`;

/**
 * TUL-561: one card, two palettes. The platform (marketing, app, dashboards)
 * paints the Tulala palette; an agency storefront or talent site
 * (`data-consent-themed`) paints its own theme tokens, so the card matches the
 * site's surface, ink, primary button, radius and fonts. Every value goes
 * through `--consent-*` so the markup never branches.
 *
 * The wrapper is transparent on purpose: `[data-platform-surface="marketing"]`
 * paints `--tl-bone` on any element that carries it, which showed as a square
 * behind the rounded card.
 */
export const CONSENT_CARD_CSS = `
[data-consent-banner]{background:transparent;--consent-surface:var(--tl-surface-raised,#fff);--consent-ink:var(--tl-ink,#161a16);--consent-soft:var(--tl-ink-soft,#3e4640);--consent-muted:var(--tl-muted,#5f645a);--consent-line:var(--tl-hairline,#e0d8c8);--consent-line-strong:var(--tl-hairline-strong,#c7beac);--consent-quiet:var(--tl-surface,#faf6ee);--consent-primary:var(--tl-forest,#1e3a2d);--consent-primary-on:var(--tl-forest-on,#f4efe6);--consent-link:var(--tl-forest,#1e3a2d);--consent-radius:var(--tl-radius-lg,22px);--consent-btn-radius:var(--tl-radius-sm,8px)}
[data-consent-banner][data-consent-themed]{--consent-surface:var(--token-color-surface-raised,var(--token-color-background,#fff));--consent-ink:var(--token-color-ink,#111);--consent-soft:color-mix(in srgb,var(--consent-ink) 82%,var(--consent-surface));--consent-muted:var(--token-color-muted,#737373);--consent-line:var(--token-color-line,#e5e5e5);--consent-line-strong:color-mix(in srgb,var(--consent-ink) 24%,var(--consent-surface));--consent-quiet:transparent;--consent-primary:var(--token-color-primary,var(--consent-ink));--consent-primary-on:var(--token-color-primary-on,var(--consent-surface));--consent-link:var(--consent-ink);--consent-radius:var(--token-shape-radius-card,min(var(--site-radius-lg,16px),1.25rem));--consent-btn-radius:var(--token-button-radius,10px);font-family:var(--site-body-font,inherit)}
[data-consent-banner][data-consent-themed] [data-consent-title]{font-family:var(--site-heading-font,inherit)}
[data-consent-card]{background:var(--consent-surface);color:var(--consent-ink);border:1px solid var(--consent-line);border-radius:var(--consent-radius);box-shadow:0 18px 40px -22px color-mix(in srgb,var(--consent-ink) 40%,transparent)}
@media (max-width:639px){[data-consent-card]{border-bottom:0;border-bottom-left-radius:0;border-bottom-right-radius:0;padding-bottom:calc(0.875rem + env(safe-area-inset-bottom,0px))}body:has([data-tulala-mobile-bottom-nav]) [data-consent-banner],body:has(.cb-bar[data-show="true"]:not([data-top="true"])) [data-consent-banner]{left:.75rem;right:.75rem}body:has([data-tulala-mobile-bottom-nav]) [data-consent-card],body:has(.cb-bar[data-show="true"]:not([data-top="true"])) [data-consent-card]{border-bottom:1px solid var(--consent-line);border-radius:var(--consent-radius);padding-bottom:.875rem}}
`;

/**
 * Consent card for analytics storage and ad pixels. Mounted in the root
 * layout. Honours Global Privacy Control (treated as a "no"), and can be
 * reopened from the footer "Privacy choices" link.
 *
 * Scoped to the marketing platform surface so it stays light and on-brand
 * even when <body> falls back to site-theme-dark (platform hosts).
 */
/**
 * Pages that render in their own language (talent sites bound to the talent's
 * languages) mark it on the page; the banner follows that, not the root header.
 */
export function pageLocaleOverride(root: ParentNode | null | undefined): string | null {
  const v = root?.querySelector?.("[data-site-locale]")?.getAttribute("data-site-locale")?.trim();
  return v ? v : null;
}

export function AnalyticsConsentBanner({
  locale: rootLocale = "en",
  themed = false,
}: {
  locale?: string;
  /** Agency storefront or talent site: paint the site's theme tokens, not the Tulala palette. */
  themed?: boolean;
}) {
  const [pageLocale, setPageLocale] = useState<string | null>(null);
  const locale = pageLocale ?? rootLocale;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Prototype routes (e.g. /prototypes/drawer-preview) are designer/dev
  // sandboxes, not customer-facing; suppress on those paths.
  const pathname = usePathname();
  const isPreviewRoute = isConsentBannerSuppressedPath(pathname);
  const t = translatorFor(locale);

  useEffect(() => {
    setPageLocale(pageLocaleOverride(document));
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
    setPageLocale(pageLocaleOverride(document));
    syncConsentCookie();
    const stored = readStoredConsent();
    let dismissed = false;
    try {
      dismissed = !!window.sessionStorage.getItem(DISMISS_SESSION_KEY);
    } catch {
      /* ignore */
    }
    if (shouldShowBanner(stored, isGpcEnabled()) && !dismissed) setOpen(true);
    const reopen = () => {
      setPageLocale(pageLocaleOverride(document));
      setOpen(true);
    };
    window.addEventListener(PRIVACY_CHOICES_EVENT, reopen);
    return () => window.removeEventListener(PRIVACY_CHOICES_EVENT, reopen);
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.sessionStorage.setItem(DISMISS_SESSION_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  const choose = useCallback((next: StoredConsent) => {
    writeConsent(next);
    // Google reacts to the consent update; Meta flips in place; TikTok and
    // LinkedIn have no runtime consent API and need a reload to load.
    if (next === "granted") activatePixelsAfterConsent();
    setOpen(false);
  }, []);

  if (!mounted || !open || isPreviewRoute) return null;

  const privacyHref = `${getSiteUrl()}/legal/privacy`;
  const cookiesHref = `${getSiteUrl()}/legal/cookies`;

  return (
    <>
      <style>{CONSENT_BANNER_SHELL_OFFSET_CSS}</style>
      <style>{CONSENT_CARD_CSS}</style>
      <div
        role="dialog"
        aria-label={t("public.consent.ariaLabel")}
        data-consent-banner=""
        data-consent-themed={themed ? "" : undefined}
        data-platform-surface={themed ? undefined : "marketing"}
        className={`${themed ? "" : "site-theme-platform "}fixed inset-x-0 bottom-0 z-[98] sm:inset-x-auto sm:left-1/2 sm:bottom-5 sm:w-[min(36rem,calc(100vw-2.5rem))] sm:-translate-x-1/2 md:left-auto md:right-5 md:translate-x-0 md:w-[22.5rem]`}
      >
        <div data-consent-card="" className="px-4 pb-3.5 pt-3 sm:px-5 sm:pb-4 sm:pt-4">
          <div className="flex items-center justify-between gap-3 sm:items-start">
            <p
              data-consent-title=""
              className="plt-display text-[1rem] font-medium leading-tight tracking-[-0.02em] sm:text-[1.125rem]"
            >
              {t("public.consent.title")}
            </p>
            <button
              type="button"
              onClick={dismiss}
              aria-label={t("public.consent.closeLabel")}
              title={t("public.consent.closeLabel")}
              className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-[var(--consent-btn-radius)] transition-opacity hover:opacity-70"
              style={{ color: "var(--consent-muted)" }}
            >
              <span aria-hidden className="text-lg leading-none font-normal">
                ×
              </span>
            </button>
          </div>

          <p
            className="mt-1.5 text-[0.8125rem] leading-snug sm:mt-2 sm:text-[0.875rem] sm:leading-relaxed"
            style={{ color: "var(--consent-soft)" }}
          >
            {t("public.consent.message")}
          </p>

          <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[0.75rem] leading-snug sm:mt-2.5">
            <a
              href={privacyHref}
              className="underline underline-offset-[3px] transition-opacity hover:opacity-80"
              style={{ color: "var(--consent-link)" }}
            >
              {t("public.consent.privacyLink")}
            </a>
            <span aria-hidden style={{ color: "var(--consent-muted)" }}>
              ·
            </span>
            <a
              href={cookiesHref}
              className="underline underline-offset-[3px] transition-opacity hover:opacity-80"
              style={{ color: "var(--consent-link)" }}
            >
              {t("public.consent.cookiesLink")}
            </a>
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4">
            <button
              type="button"
              onClick={() => choose("denied")}
              className="h-10 rounded-[var(--consent-btn-radius)] text-[0.8125rem] font-medium transition-opacity hover:opacity-80"
              style={{
                color: "var(--consent-ink)",
                background: "var(--consent-quiet)",
                border: "1px solid var(--consent-line-strong)",
              }}
            >
              {t("public.consent.decline")}
            </button>
            <button
              type="button"
              onClick={() => choose("granted")}
              className="h-10 rounded-[var(--consent-btn-radius)] text-[0.8125rem] font-medium transition-opacity hover:opacity-90"
              style={{
                color: "var(--consent-primary-on)",
                background: "var(--consent-primary)",
              }}
            >
              {t("public.consent.accept")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
