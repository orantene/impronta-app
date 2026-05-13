"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "impronta_analytics_consent";
// Session-only dismiss flag — user wants to close the banner without
// committing to accept/decline for now. Cleared by tab close.
const DISMISS_SESSION_KEY = "impronta_analytics_consent_dismissed_at";

type Consent = "granted" | "denied" | null;

function readConsent(): Consent {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "granted" || v === "denied") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function updateGtagConsent(next: "granted" | "denied") {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const analytics_storage = next;
  window.gtag("consent", "update", {
    analytics_storage,
    ad_storage: analytics_storage,
    ad_user_data: analytics_storage,
    ad_personalization: analytics_storage,
  });
}

/**
 * Simple consent strip for analytics storage (GA4). Does not replace a full CMP for ads.
 */
export function AnalyticsConsentBanner() {
  const [consent, setConsent] = useState<Consent>(null);
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Prototype routes (e.g. /prototypes/drawer-preview) are designer/dev
  // sandboxes, not customer-facing — the consent banner overlaps drawers
  // and clutters screenshots. Suppress on those paths.
  const pathname = usePathname();
  const isPrototypeRoute = pathname?.startsWith("/prototypes") ?? false;

  useEffect(() => {
    setMounted(true);
    setConsent(readConsent());
    try {
      if (typeof window !== "undefined" && window.sessionStorage.getItem(DISMISS_SESSION_KEY)) {
        setDismissed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(DISMISS_SESSION_KEY, String(Date.now()));
      }
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  const accept = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "granted");
    } catch {
      /* ignore */
    }
    updateGtagConsent("granted");
    setConsent("granted");
  }, []);

  const decline = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "denied");
    } catch {
      /* ignore */
    }
    updateGtagConsent("denied");
    setConsent("denied");
  }, []);

  if (!mounted || consent !== null || isPrototypeRoute || dismissed) return null;

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      // G.11 — mobile: slim auto-height row (was full block), non-blocking
      // close affordance, lower z so drawer modals win, safe-area padding.
      className="fixed inset-x-2 bottom-2 z-40 rounded-2xl border border-border bg-background/95 px-3 py-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md sm:inset-x-4 sm:bottom-4 sm:px-4 md:px-6"
      style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-4xl items-start gap-2 sm:items-center">
        <p className="flex-1 text-xs leading-snug text-muted-foreground sm:text-sm">
          We use analytics to understand how the directory and inquiries are used.
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-xs" onClick={decline}>
            Decline
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 rounded-lg bg-foreground px-3 text-xs text-background hover:bg-foreground/90"
            onClick={accept}
          >
            Accept
          </Button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close — decide later"
            title="Close — decide later"
            className="ml-0.5 grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1, fontWeight: 400 }}>×</span>
          </button>
        </div>
      </div>
    </div>
  );
}
