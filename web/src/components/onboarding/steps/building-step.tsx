"use client";

/** Step 4 · Building. The real steps tick; the copy is the measured promise. */

import { useEffect, useState } from "react";

import type { OnboardingPath } from "@/lib/onboarding/module-state";

import { Sub, Tick, Title } from "../ui";

export function BuildingStep({ t, path }: { t: (key: string) => string; path: OnboardingPath }) {
  const steps = path === "talent"
    ? ["account", "profile"]
    : path === "both"
      ? ["account", "workspace", "site", "photos", "profile"]
      : ["account", "workspace", "site", "photos"];
  // Visual pacing only (the build is one server call): one tick every ~4 s,
  // the last one waits for the real result.
  const [done, setDone] = useState(1);
  useEffect(() => {
    const id = window.setInterval(() => setDone((n) => Math.min(steps.length - 1, n + 1)), 4000);
    return () => window.clearInterval(id);
  }, [steps.length]);
  return (
    <div data-testid="onb-building" aria-busy="true">
      <Title>{path === "talent" ? t("public.onboarding.building.titleTalent") : t("public.onboarding.building.title")}</Title>
      <Sub>{t("public.onboarding.building.sub")}</Sub>
      <ul className="mt-6 flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-3 text-[0.9375rem]" style={{ color: i < done ? "var(--tl-ink)" : "var(--tl-muted)" }}>
            <Tick done={i < done} />
            {t(`public.onboarding.building.steps.${s}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
