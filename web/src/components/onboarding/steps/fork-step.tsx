"use client";

/** "Who is this page for?" — asked only when the words were truly ambiguous. */

import type { OnboardingPath } from "@/lib/onboarding/module-state";

import { Sub, Title } from "../ui";

export function ForkStep({ t, busy, onChoose }: { t: (key: string) => string; busy: boolean; onChoose: (path: OnboardingPath) => void }) {
  const options: Array<{ path: OnboardingPath; title: string; sub: string }> = [
    { path: "talent", title: t("public.onboarding.fork.talent"), sub: t("public.onboarding.fork.talentSub") },
    { path: "business", title: t("public.onboarding.fork.business"), sub: t("public.onboarding.fork.businessSub") },
    { path: "both", title: t("public.onboarding.fork.both"), sub: t("public.onboarding.fork.bothSub") },
  ];
  return (
    <div data-testid="onb-fork">
      <Title>{t("public.onboarding.fork.title")}</Title>
      <Sub>{t("public.onboarding.fork.sub")}</Sub>
      <div className="mt-5 flex flex-col gap-3">
        {options.map((o) => (
          <button
            key={o.path}
            type="button"
            disabled={busy}
            onClick={() => onChoose(o.path)}
            data-testid={`onb-fork-${o.path}`}
            className="rounded-[22px] px-4 py-4 text-left transition-colors disabled:opacity-50"
            style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline-strong)" }}
          >
            <span className="block text-[1rem] font-semibold" style={{ color: "var(--tl-ink)" }}>{o.title}</span>
            <span className="mt-0.5 block text-[0.8125rem]" style={{ color: "var(--tl-ink-soft)" }}>{o.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
