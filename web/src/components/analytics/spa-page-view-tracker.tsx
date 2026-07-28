"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    /** Set by ga-init AFTER gtag('config') — the only safe "GA ready" signal. */
    __gaConfigured?: boolean;
    fbq?: (...args: unknown[]) => void;
    ttq?: { page?: () => void };
  }
}

/**
 * SPA page_view tracker — GA4 (and pixel) parity for client-side navigations.
 *
 * gtag.js only auto-sends `page_view` on the initial config, so every
 * soft navigation (directory → profile link, the quick-open profile modal,
 * locale switches…) was invisible to GA4. AnalyticsScripts now configures
 * GA4 with `send_page_view: false` and THIS component owns page_view
 * entirely: it fires once per pathname — including the first load — so a
 * modal open (which navigates to the real /t/<code> URL) registers exactly
 * like a full page visit.
 *
 * Meta/TikTok pixels auto-fire their own PageView during init, so for them
 * this component only covers SUBSEQUENT route changes (skip-first).
 *
 * Fires on pathname changes only — query-string churn (directory filters,
 * sort, view toggles) is deliberately NOT a page_view; those surfaces emit
 * their own product events (apply_filter, search, refine_search).
 */
export function SpaPageViewTracker() {
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);

  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastTracked.current === pathname) return;
    const first = lastTracked.current === null;
    lastTracked.current = pathname;

    // setTimeout(0): let the new route commit its <title> before reading it.
    // Deliberately NOT cleared on cleanup — strict-mode/dep-change re-runs
    // would cancel the timer before it fires; the lastTracked guard above is
    // what prevents duplicates, so the fire itself must never be revocable.
    //
    // First-load race: hydration effects run BEFORE afterInteractive
    // scripts, and the beforeInteractive consent snippet defines window.gtag
    // for every tenant — so "gtag exists" never meant "GA is configured".
    // Events queued before the config command are dropped by gtag.js (this
    // silently killed the landing page_view). Wait for the __gaConfigured
    // sentinel that ga-init sets right after its config call. Tenants with
    // no GA never set it — the retries lapse silently as before.
    let attempts = 0;
    const fire = () => {
      if (!window.__gaConfigured && attempts < 40) {
        attempts += 1;
        setTimeout(fire, 250);
        return;
      }
      // page_referrer: after a soft nav document.referrer still holds the
      // EXTERNAL landing referrer; sending it on every hit reads as a new
      // referral mid-session in GA4. Send the previous in-app URL instead.
      const referrer = prevUrlRef.current ?? document.referrer;
      prevUrlRef.current = window.location.href;
      window.gtag?.("event", "page_view", {
        page_location: window.location.href,
        page_path: pathname,
        page_title: document.title,
        ...(referrer ? { page_referrer: referrer } : {}),
      });
      if (!first) {
        window.fbq?.("track", "PageView");
        window.ttq?.page?.();
      }
    };
    setTimeout(fire, 0);
  }, [pathname]);

  return null;
}
