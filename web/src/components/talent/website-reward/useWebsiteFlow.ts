"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAdminShell } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import {
  useWebsiteEligibility,
  WEBSITE_ELIGIBILITY_CHANGED_EVENT,
} from "@/components/talent/studio/useWebsiteEligibility";
import { loadTalentSiteActivationStateAction } from "@/lib/talent-site/server/site-activation-state";
import type { TalentSiteActivationState } from "@/lib/talent-site/server/site-management-types";
import { appliedThemeLabel, appliedThemeLine } from "@/lib/talent-site/theme-catalog/applied-theme-label";
import {
  websiteFlowCopy,
  websiteFlowState,
  websiteSetupStep,
  type WebsiteSetupStep,
} from "@/lib/talent/website-flow";

/** Setup step requested from another surface; /talent/site consumes it. */
let pendingSetupStep: WebsiteSetupStep | null = null;
export const WEBSITE_SETUP_REQUEST_EVENT = "tulala:website-setup-request";

export function consumeWebsiteSetupRequest(): WebsiteSetupStep | null {
  const step = pendingSetupStep;
  pendingSetupStep = null;
  return step;
}

/*
 * ONE activation store for every surface (F53). Each surface used to fetch on
 * its own, so the pill, the Today card and My presence could hold different
 * answers on the same screen (Today read "ready" while Inbox read "preview").
 * Now there is one in-flight request, one last-good value, and every
 * subscriber re-renders from it. A failed read keeps the last good value
 * instead of falling back to "no design".
 */
let storeValue: TalentSiteActivationState | null = null;
let storeInFlight: Promise<void> | null = null;
let storeStale = true;
/** A refresh asked for while one was in flight: run once more after it. */
let storeAgain = false;
/** A read has completed (even a failed one): the pill may stop waiting. */
let storeAttempted = false;
const storeListeners = new Set<() => void>();

function refreshActivationStore(): Promise<void> {
  if (storeInFlight) {
    storeAgain = true;
    return storeInFlight;
  }
  storeInFlight = loadTalentSiteActivationStateAction()
    .then((next) => {
      if (next) storeValue = next;
      storeStale = false;
    })
    .catch(() => undefined)
    .finally(() => {
      storeInFlight = null;
      storeAttempted = true;
      for (const fn of storeListeners) fn();
      if (storeAgain) {
        storeAgain = false;
        void refreshActivationStore();
      }
    });
  return storeInFlight;
}

function useActivationStore(pathname: string | null): {
  value: TalentSiteActivationState | null;
  attempted: boolean;
} {
  const [value, setValue] = useState<TalentSiteActivationState | null>(storeValue);
  const [attempted, setAttempted] = useState(storeAttempted);
  useEffect(() => {
    const sync = () => {
      setValue(storeValue);
      setAttempted(storeAttempted);
    };
    storeListeners.add(sync);
    const bump = () => {
      storeStale = true;
      void refreshActivationStore();
    };
    window.addEventListener(WEBSITE_ELIGIBILITY_CHANGED_EVENT, bump);
    return () => {
      storeListeners.delete(sync);
      window.removeEventListener(WEBSITE_ELIGIBILITY_CHANGED_EVENT, bump);
    };
  }, []);
  useEffect(() => {
    // Every route change re-reads once (shared by all mounted surfaces).
    storeStale = true;
    void refreshActivationStore();
  }, [pathname]);
  return { value, attempted };
}

/** Test seam: the store's current value. */
export function activationStoreSnapshot(): { value: TalentSiteActivationState | null; stale: boolean } {
  return { value: storeValue, stale: storeStale };
}

/**
 * The one free-website state + next action for the pill, Today and the My
 * presence card. Read-only: it never provisions a site. Re-reads on every
 * route change and on WEBSITE_ELIGIBILITY_CHANGED_EVENT (design applied,
 * published, profile saved).
 */
export function useWebsiteFlow() {
  const eligibility = useWebsiteEligibility();
  const copy = useDashboardText();
  const { setTalentPage } = useAdminShell();
  const router = useRouter();
  const pathname = usePathname();
  const { value: activation, attempted } = useActivationStore(pathname);

  const state = websiteFlowState({
    percent: eligibility.percent,
    isPublished: activation?.isPublished ?? false,
    themeDesignSlug: activation?.themeDesignSlug ?? null,
  });
  const step = websiteSetupStep(state);
  const theme = appliedThemeLabel(
    activation?.themeDesignSlug,
    activation?.themeLookSlug,
    copy.isSpanish ? "es" : "en",
  );
  const text = websiteFlowCopy(state, eligibility.percent ?? 0, copy.isSpanish, appliedThemeLine(theme));

  /** Open the setup flow at the step the talent is on (never restarts). */
  const continueSetup = useCallback(() => {
    pendingSetupStep = step;
    window.dispatchEvent(new Event(WEBSITE_SETUP_REQUEST_EVENT));
    setTalentPage("public-page");
    router.push("/talent/site");
  }, [router, setTalentPage, step]);

  return { eligibility, activation, loaded: activation != null || attempted, state, step, theme, text, continueSetup };
}
