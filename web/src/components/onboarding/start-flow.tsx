"use client";

/** Client shell of `/start`: owns the ES/EN toggle and leaves via history or the home page. */

import { useCallback, useState } from "react";

import type { FlowLocale } from "@/lib/onboarding/flow";
import type { OnboardingChoice } from "@/lib/onboarding/module-state";

import type { PlanIntent } from "@/lib/onboarding/plan-intent";

import { OnboardingModule } from "./onboarding-module";

export function StartFlow({ initialLocale, startChoice, planIntent = null }: { initialLocale: FlowLocale; startChoice: OnboardingChoice | null; planIntent?: PlanIntent | null }) {
  const [locale, setLocale] = useState<FlowLocale>(initialLocale);
  const onLocaleChange = useCallback((next: FlowLocale) => {
    setLocale(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* the toggle still works without the URL */
    }
  }, []);
  return (
    <OnboardingModule
      variant="page"
      locale={locale}
      intent="unknown"
      startChoice={startChoice}
      planIntent={planIntent}
      onLocaleChange={onLocaleChange}
      onClose={() => {
        if (window.history.length > 1) window.history.back();
        else window.location.assign("/");
      }}
    />
  );
}
