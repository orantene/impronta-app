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
  const [activation, setActivation] = useState<TalentSiteActivationState | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(WEBSITE_ELIGIBILITY_CHANGED_EVENT, bump);
    return () => window.removeEventListener(WEBSITE_ELIGIBILITY_CHANGED_EVENT, bump);
  }, []);

  useEffect(() => {
    let live = true;
    void loadTalentSiteActivationStateAction().then((s) => {
      if (live) setActivation(s);
    });
    return () => {
      live = false;
    };
  }, [version, pathname]);

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

  return { eligibility, activation, loaded: activation != null, state, step, theme, text, continueSetup };
}
