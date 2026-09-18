"use client";

/**
 * Step 4 · Building. The build is one server call of 6–25 s; this screen has
 * to carry a person through it. Three things move at once: the step list
 * (ring on the current step, ticks behind it), a progress bar paced to the
 * measured build time for the path, and a rotating line of what is being
 * made. Nothing here waits on the server except the last tick.
 */

import { useEffect, useState } from "react";

import type { OnboardingPath } from "@/lib/onboarding/module-state";

import { LoadingSteps, ProgressBar, Sub, Title, WhileYouWait } from "../ui";

/** Measured on the isolated stack (Phase 4): talent ≈ 6 s, business ≈ 20–25 s. */
const EXPECTED_MS: Record<OnboardingPath, number> = { talent: 7000, business: 24000, both: 28000 };

export function BuildingStep({ t, path, done = false }: { t: (key: string) => string; path: OnboardingPath; done?: boolean }) {
  const steps = path === "talent"
    ? ["account", "profile"]
    : path === "both"
      ? ["account", "workspace", "site", "photos", "profile"]
      : ["account", "workspace", "site", "photos"];
  const expected = EXPECTED_MS[path];
  // Pace the ring across the steps over the expected time; the last step
  // stays "in progress" until the real result arrives.
  const [active, setActive] = useState(1);
  useEffect(() => {
    const per = Math.max(1500, expected / steps.length);
    const id = window.setInterval(() => setActive((n) => Math.min(steps.length - 1, n + 1)), per);
    return () => window.clearInterval(id);
  }, [expected, steps.length]);
  const whileLines = path === "talent"
    ? [
        t("public.onboarding.building.while.talent1"),
        t("public.onboarding.building.while.talent2"),
        t("public.onboarding.building.while.talent3"),
        t("public.onboarding.building.while.talent4"),
        t("public.onboarding.building.while.talent5"),
      ]
    : [
        t("public.onboarding.building.while.business1"),
        t("public.onboarding.building.while.business2"),
        t("public.onboarding.building.while.business3"),
        t("public.onboarding.building.while.business4"),
        t("public.onboarding.building.while.business5"),
      ];
  return (
    <div data-testid="onb-building" aria-busy={!done} className="-mx-4 -mt-2 min-h-[70vh] rounded-[20px] px-5 py-6 sm:-mx-6" style={{ background: "var(--tl-surface-inverse)", color: "var(--tl-on-inverse)" }}>
      <div className="mb-5 flex justify-center" aria-hidden>
        <span className="inline-block size-12 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--tl-on-inverse)", borderTopColor: "transparent", opacity: 0.9 }} />
      </div>
      <Title tone="inverse">{path === "talent" ? t("public.onboarding.building.titleTalent") : t("public.onboarding.building.title")}</Title>
      <Sub tone="inverse">{path === "talent" ? t("public.onboarding.building.subTalent") : t("public.onboarding.building.sub")}</Sub>
      <ProgressBar expectedMs={expected} done={done} label={t("public.onboarding.building.progressLabel")} />
      <LoadingSteps items={steps.map((s) => t(`public.onboarding.building.steps.${s}`))} activeIndex={done ? steps.length : active} tone="inverse" />
      <WhileYouWait lines={whileLines} tone="inverse" />
      <p className="mt-4 text-[0.75rem]" style={{ color: "var(--tl-on-inverse)", opacity: 0.7 }}>{t("public.onboarding.building.canClose")}</p>
    </div>
  );
}
