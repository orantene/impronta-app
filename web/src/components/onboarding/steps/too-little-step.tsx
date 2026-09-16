"use client";

import { PrimaryButton, Sub, Title } from "../ui";

export function TooLittleStep({ t, onBack }: { t: (key: string) => string; onBack: () => void }) {
  return (
    <div data-testid="onb-too-little">
      <Title>{t("public.onboarding.tooLittle.title")}</Title>
      <Sub>{t("public.onboarding.tooLittle.sub")}</Sub>
      <div className="mt-6">
        <PrimaryButton onClick={onBack} testId="onb-too-little-back">{t("public.onboarding.tooLittle.cta")}</PrimaryButton>
      </div>
    </div>
  );
}
