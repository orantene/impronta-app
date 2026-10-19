"use client";

/** Client shell of `/start`: owns the ES/EN toggle and leaves via history or the home page. */

import { useCallback, useEffect, useState } from "react";

import type { FlowLocale } from "@/lib/onboarding/flow";
import { urlWithStep } from "@/lib/onboarding/step-url";
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
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* the toggle still works without the URL */
    }
  }, []);
  // TUL-812: mirror the wizard's step into ?step= (the module marks its root with data-onboarding-step).
  useEffect(() => {
    const sync = () => {
      try {
        const step = document.querySelector("[data-onboarding-step]")?.getAttribute("data-onboarding-step");
        const next = urlWithStep(window.location.href, step);
        if (next !== window.location.href) window.history.replaceState(window.history.state, "", next);
      } catch {
        /* the wizard works without the URL */
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-onboarding-step"] });
    return () => observer.disconnect();
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
