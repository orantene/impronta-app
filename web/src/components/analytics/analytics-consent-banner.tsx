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
import { CONSENT_BANNER_RESERVE_PX } from "@/lib/talent-site/floating-chrome-stack";

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
 * Support and Settings (start the banner to the right of it).
 *
 * GRK-040: on the marketing shell at phone widths the same card sat on top of
 * the last pricing tiers and the open mobile-menu footer. Talent sites already
 * reserve `--floating-consent-clearance`; marketing gets an equivalent pad so
 * scrollable content clears the card without moving the banner itself.
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
@media (max-width: 640px) {
  body:has([data-consent-banner]) [data-platform-surface="marketing"] {
    padding-bottom: calc(${CONSENT_BANNER_RESERVE_PX}px + env(safe-area-inset-bottom, 0px));
  }
  html:has([data-consent-banner]):has([data-platform-surface="marketing"]) {
    scroll-padding-bottom: calc(${CONSENT_BANNER_RESERVE_PX}px + env(safe-area-inset-bottom, 0px));
  }
}
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

export function AnalyticsConsentBanner({ locale: rootLocale = "en" }: { locale?: string }) {
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
      <div
        role="dialog"
        aria-label={t("public.consent.ariaLabel")}
        data-consent-banner=""
        data-platform-surface="marketing"
        className="site-theme-platform fixed inset-x-3 bottom-3 z-[98] sm:inset-x-auto sm:left-1/2 sm:bottom-5 sm:w-[min(36rem,calc(100vw-2.5rem))] sm:-translate-x-1/2 md:left-auto md:right-5 md:translate-x-0 md:w-[22.5rem]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div
          className="rounded-[var(--tl-radius-lg,22px)] px-4 pb-3.5 pt-3.5 sm:px-5 sm:pb-4 sm:pt-4"
          style={{
            background: "var(--tl-surface-raised, #ffffff)",
            color: "var(--tl-ink, #161a16)",
            border: "1px solid var(--tl-hairline, #e0d8c8)",
            boxShadow: "0 18px 40px -22px rgba(22, 26, 22, 0.28)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <p
              className="plt-display text-[1.0625rem] font-medium leading-tight tracking-[-0.02em] sm:text-[1.125rem]"
              style={{ color: "var(--tl-ink, #161a16)" }}
            >
              {t("public.consent.title")}
            </p>
            <button
              type="button"
              onClick={dismiss}
              aria-label={t("public.consent.closeLabel")}
              title={t("public.consent.closeLabel")}
              className="grid size-8 shrink-0 place-items-center rounded-[var(--tl-radius-sm,8px)] transition-colors"
              style={{ color: "var(--tl-muted, #5f645a)" }}
            >
              <span aria-hidden className="text-lg leading-none font-normal">
                ×
              </span>
            </button>
          </div>

          <p
            className="mt-2 text-[0.8125rem] leading-relaxed sm:text-[0.875rem]"
            style={{ color: "var(--tl-ink-soft, #3e4640)" }}
          >
            {t("public.consent.message")}
          </p>

          <p className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1 text-[0.75rem] leading-snug">
            <a
              href={privacyHref}
              className="underline underline-offset-[3px] transition-opacity hover:opacity-80"
              style={{ color: "var(--tl-forest, #1e3a2d)" }}
            >
              {t("public.consent.privacyLink")}
            </a>
            <span aria-hidden style={{ color: "var(--tl-muted-soft, #8e938a)" }}>
              ·
            </span>
            <a
              href={cookiesHref}
              className="underline underline-offset-[3px] transition-opacity hover:opacity-80"
              style={{ color: "var(--tl-forest, #1e3a2d)" }}
            >
              {t("public.consent.cookiesLink")}
            </a>
          </p>

          <div className="mt-3.5 grid grid-cols-2 gap-2 sm:mt-4">
            <button
              type="button"
              onClick={() => choose("denied")}
              className="h-10 rounded-[var(--tl-radius-sm,8px)] text-[0.8125rem] font-medium transition-colors"
              style={{
                color: "var(--tl-ink, #161a16)",
                background: "var(--tl-surface, #faf6ee)",
                border: "1px solid var(--tl-hairline-strong, #c7beac)",
              }}
            >
              {t("public.consent.decline")}
            </button>
            <button
              type="button"
              onClick={() => choose("granted")}
              className="h-10 rounded-[var(--tl-radius-sm,8px)] text-[0.8125rem] font-medium transition-colors"
              style={{
                color: "var(--tl-forest-on, #f4efe6)",
                background: "var(--tl-forest, #1e3a2d)",
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
