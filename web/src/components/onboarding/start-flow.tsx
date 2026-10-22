"use client";

/** Client shell of `/start`: owns the ES/EN toggle and leaves via history or the home page. */

import { useCallback, useEffect, useState } from "react";

import type { FlowLocale } from "@/lib/onboarding/flow";
import { createStepHistory, stepHistoryState } from "@/lib/onboarding/step-history";
import { WIZARD_GOTO_EVENT } from "@/lib/onboarding/step-url";
import type { OnboardingChoice } from "@/lib/onboarding/module-state";

import type { PlanIntent } from "@/lib/onboarding/plan-intent";

import { OnboardingModule } from "./onboarding-module";

export function StartFlow({
  initialLocale,
  startChoice,
  planIntent = null,
  marketingOrigin,
}: {
  initialLocale: FlowLocale;
  startChoice: OnboardingChoice | null;
  planIntent?: PlanIntent | null;
  /** Server-resolved marketing origin for legal links (TUL-750). */
  marketingOrigin: string;
}) {
  const [locale, setLocale] = useState<FlowLocale>(initialLocale);
  const onLocaleChange = useCallback((next: FlowLocale) => {
    setLocale(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState(stepHistoryState(url.searchParams.get("step")), "", url.toString());
    } catch {
      /* the toggle still works without the URL */
    }
  }, []);
  // TUL-812: mirror the wizard's step into ?step= (the module marks its root with data-onboarding-step).
  // Forward steps push a history entry so the browser Back button walks the wizard back;
  // the saved progress (server side) restores the step and the draft after a refresh.
  // The wiring lives in lib/onboarding/step-history.ts (writes go through Next's router, see there).
  useEffect(() => {
    const history = createStepHistory({
      currentStep: () => document.querySelector("[data-onboarding-step]")?.getAttribute("data-onboarding-step") ?? null,
      href: () => window.location.href,
      pushState: (state, url) => window.history.pushState(state, "", url),
      replaceState: (state, url) => window.history.replaceState(state, "", url),
      back: () => window.history.back(),
      goto: (step) => window.dispatchEvent(new CustomEvent(WIZARD_GOTO_EVENT, { detail: { step } })),
    });
    const safe = (fn: () => void) => () => {
      try {
        fn();
      } catch {
        /* the wizard works without the URL */
      }
    };
    const sync = safe(() => history.sync());
    const onPop = (e: PopStateEvent) => safe(() => history.onPop(e.state))();
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-onboarding-step"] });
    window.addEventListener("popstate", onPop);
    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", onPop);
    };
  }, []);
  return (
    <OnboardingModule
      variant="page"
      locale={locale}
      intent="unknown"
      startChoice={startChoice}
      planIntent={planIntent}
      marketingOrigin={marketingOrigin}
      onLocaleChange={onLocaleChange}
      onClose={() => {
        if (window.history.length > 1) window.history.back();
        else window.location.assign("/");
      }}
    />
  );
}
