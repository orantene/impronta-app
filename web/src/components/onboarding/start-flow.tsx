"use client";

/** Client shell of `/start`: owns the ES/EN toggle and leaves via history or the home page. */

import { useCallback, useEffect, useState } from "react";

import type { FlowLocale } from "@/lib/onboarding/flow";
import { planStepSync, stepForPopTarget, urlWithStep, WIZARD_GOTO_EVENT } from "@/lib/onboarding/step-url";
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
  // Forward steps push a history entry so the browser Back button walks the wizard back;
  // the saved progress (server side) restores the step and the draft after a refresh.
  useEffect(() => {
    let stack: string[] = [];
    const currentStep = () => document.querySelector("[data-onboarding-step]")?.getAttribute("data-onboarding-step") ?? null;
    const sync = () => {
      try {
        const step = currentStep();
        const plan = planStepSync(stack, step);
        stack = plan.stack;
        if (plan.op === "back") {
          window.history.back();
          return;
        }
        if (plan.op === "none") return;
        const next = urlWithStep(window.location.href, step);
        if (next === window.location.href) return;
        if (plan.op === "push") window.history.pushState(window.history.state, "", next);
        else window.history.replaceState(window.history.state, "", next);
      } catch {
        /* the wizard works without the URL */
      }
    };
    const onPop = () => {
      try {
        const current = currentStep();
        const target = new URL(window.location.href).searchParams.get("step");
        const to = stepForPopTarget(current, target);
        if (to) {
          const at = stack.lastIndexOf(to);
          stack = at >= 0 ? stack.slice(0, at + 1) : [...stack, to];
          window.dispatchEvent(new CustomEvent(WIZARD_GOTO_EVENT, { detail: { step: to } }));
        } else if (current && target !== current) {
          window.history.replaceState(window.history.state, "", urlWithStep(window.location.href, current));
        }
      } catch {
        /* the wizard works without the URL */
      }
    };
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
