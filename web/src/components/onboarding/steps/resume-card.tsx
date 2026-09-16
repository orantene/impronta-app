"use client";

import type { ResumeSnapshot } from "@/lib/onboarding/module-state";

import { PrimaryButton, SecondaryButton, Sub, Title } from "../ui";

export function ResumeCard({
  t,
  snapshot,
  onContinue,
  onFresh,
}: {
  t: (key: string) => string;
  snapshot: ResumeSnapshot;
  onContinue: () => void;
  onFresh: () => void;
}) {
  const words = snapshot.state.input?.value ?? "";
  return (
    <div data-testid="onb-resume">
      <Title>{t("public.onboarding.resume.title")}</Title>
      <Sub>{t("public.onboarding.resume.body")}</Sub>
      {words ? (
        <p className="mt-4 rounded-[14px] px-3 py-2 text-[0.9375rem] italic" style={{ color: "var(--tl-ink)", background: "var(--tl-stone-soft)" }}>
          {t("public.onboarding.resume.quote").replace("{text}", words)}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-3">
        <PrimaryButton onClick={onContinue} testId="onb-resume-continue">{t("public.onboarding.resume.continue")}</PrimaryButton>
        <SecondaryButton onClick={onFresh} testId="onb-resume-fresh">{t("public.onboarding.resume.fresh")}</SecondaryButton>
      </div>
    </div>
  );
}
