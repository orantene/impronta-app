"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
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

  useEffect(() => {
    if (!pathname || lastTracked.current === pathname) return;
    const first = lastTracked.current === null;
    lastTracked.current = pathname;

    // setTimeout(0): let the new route commit its <title> before reading it.
    // Deliberately NOT cleared on cleanup — strict-mode/dep-change re-runs
    // would cancel the timer before it fires; the lastTracked guard above is
    // what prevents duplicates, so the fire itself must never be revocable.
    //
    // First-load race: ga-init (Script afterInteractive) may not have defined
    // window.gtag yet when hydration effects run. gtag events queued before
    // the config command are dropped by gtag.js, so instead of pushing blind
    // we retry briefly until gtag exists. Tenants with no GA configured never
    // define window.gtag — the retries lapse silently.
    let attempts = 0;
    const fire = () => {
      if (!window.gtag && attempts < 40) {
        attempts += 1;
        setTimeout(fire, 250);
        return;
      }
      window.gtag?.("event", "page_view", {
        page_location: window.location.href,
        page_path: pathname,
        page_title: document.title,
        ...(document.referrer ? { page_referrer: document.referrer } : {}),
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
