"use client";

import { useEffect, useState } from "react";

import type { Essentials } from "@/lib/onboarding/essentials";
import type { ModuleStep } from "@/lib/onboarding/module-state";
import { loadOnboardingSetup, type SetupPayload } from "@/lib/server-actions/onboarding-setup";

/**
 * Step 3's data for the wizard: the prefill (loaded on the setup step and the review),
 * what the person saved there, and `confirmed`, the essentials they really confirmed
 * (never the unconfirmed prefill) for the summary cards (TUL-806, TUL-1822).
 */
export function useSetupData(step: ModuleStep) {
  const [setupData, setSetupData] = useState<SetupPayload | null>(null);
  const [savedSetup, setSavedSetup] = useState<Essentials | null>(null);
  useEffect(() => {
    if ((step !== "setup" && step !== "readyToBuild") || setupData) return;
    let cancelled = false;
    void loadOnboardingSetup().then((r) => {
      if (!cancelled && r.ok) setSetupData(r.setup);
    });
    return () => {
      cancelled = true;
    };
  }, [step, setupData]);
  const confirmed = savedSetup ?? (setupData?.saved ? setupData.essentials : null);
  return { setupData, savedSetup, setSavedSetup, confirmed };
}
