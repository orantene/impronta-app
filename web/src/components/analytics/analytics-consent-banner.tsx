"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { translatorFor } from "@/i18n/use-t";
import { getSiteUrl } from "@/lib/auth-flow";
import {
  PRIVACY_CHOICES_EVENT,
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
 * Consent strip for analytics storage and ad pixels. Mounted in the root
 * layout. Honours Global Privacy Control (treated as a "no"), and can be
 * reopened from the footer "Privacy choices" link.
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
  const isPreviewRoute =
    (pathname?.startsWith("/prototypes") ?? false) ||
    (pathname?.startsWith("/template-preview") ?? false);
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

  return (
    <>
    <style>{CONSENT_BANNER_SHELL_OFFSET_CSS}</style>
    <div
      role="dialog"
      aria-label={t("public.consent.ariaLabel")}
      data-consent-banner=""
      // G.11 - mobile: slim auto-height row, non-blocking close affordance,
      // lower z so drawer modals win, safe-area padding.
      className="fixed inset-x-2 bottom-2 z-40 rounded-2xl border border-border bg-background/95 px-3 py-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md sm:inset-x-4 sm:bottom-4 sm:px-4 md:px-6"
      style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-4xl items-start gap-2 sm:items-center">
        <p className="flex-1 text-xs leading-snug text-muted-foreground sm:text-sm">
          {t("public.consent.message")}{" "}
          <a href={`${getSiteUrl()}/legal/privacy`} className="underline underline-offset-2 hover:text-foreground">
            {t("public.consent.privacyLink")}
          </a>
          {" · "}
          <a href={`${getSiteUrl()}/legal/cookies`} className="underline underline-offset-2 hover:text-foreground">
            {t("public.consent.cookiesLink")}
          </a>
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-xs" onClick={() => choose("denied")}>
            {t("public.consent.decline")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 rounded-lg bg-foreground px-3 text-xs text-background hover:bg-foreground/90"
            onClick={() => choose("granted")}
          >
            {t("public.consent.accept")}
          </Button>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("public.consent.closeLabel")}
            title={t("public.consent.closeLabel")}
            className="ml-0.5 grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1, fontWeight: 400 }}>×</span>
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
