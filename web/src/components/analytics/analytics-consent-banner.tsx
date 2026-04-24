"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "impronta_analytics_consent";

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

  useEffect(() => {
    setMounted(true);
    setConsent(readConsent());
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

  if (!mounted || consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-background/95 px-4 py-3 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md md:px-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use analytics to understand how the directory and inquiries are used. You can accept
          optional analytics storage or continue without it.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={decline}>
            Decline
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-xl bg-foreground text-background hover:bg-foreground/90"
            onClick={accept}
          >
            Accept analytics
          </Button>
        </div>
      </div>
    </div>
  );
}
