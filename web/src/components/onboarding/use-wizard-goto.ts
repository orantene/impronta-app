"use client";

/** TUL-812: StartFlow turns a browser Back into this event; the wizard shows the earlier step. */

import { useEffect, useRef } from "react";

import type { ModuleStep } from "@/lib/onboarding/module-state";
import { WIZARD_GOTO_EVENT } from "@/lib/onboarding/step-url";

export function useWizardGoto(enabled: boolean, goto: (step: ModuleStep) => void): void {
  const ref = useRef(goto);
  useEffect(() => {
    ref.current = goto;
  });
  useEffect(() => {
    if (!enabled) return;
    const onGoto = (e: Event) => {
      const step = (e as CustomEvent<{ step: ModuleStep }>).detail?.step;
      if (step) ref.current(step);
    };
    window.addEventListener(WIZARD_GOTO_EVENT, onGoto);
    return () => window.removeEventListener(WIZARD_GOTO_EVENT, onGoto);
  }, [enabled]);
}
