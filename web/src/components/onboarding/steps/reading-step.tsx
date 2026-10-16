"use client";

/**
 * "Reading your words…" — three lines tick on while the understand step runs.
 * Phase 2 shows the ticking and a "next" line; Phase 3 replaces the tail with
 * the understood card.
 */

import { useEffect, useState } from "react";

import type { ModuleInput } from "@/lib/onboarding/module-state";
import { SKIP_AI_OFFER_MS } from "@/lib/onboarding/understand-budget";

import { LoadingSteps, ProgressBar, Title } from "../ui";

export function ReadingStep({ t, input, onSkipAi }: { t: (key: string) => string; input: ModuleInput | null; onSkipAi?: () => void }) {
  // The understand call takes ~3 s on the routed model; one line per second,
  // the last stays in progress until the card replaces this screen.
  const [done, setDone] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setDone((n) => Math.min(2, n + 1)), 1000);
    return () => window.clearInterval(id);
  }, []);
  // TUL-541: a slow read offers the short form instead of an endless ring.
  const [offerSkip, setOfferSkip] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setOfferSkip(true), SKIP_AI_OFFER_MS);
    return () => window.clearTimeout(id);
  }, []);
  const lines = [t("public.onboarding.reading.line1"), t("public.onboarding.reading.line2"), t("public.onboarding.reading.line3")];
  return (
    <div data-testid="onb-reading" aria-busy="true">
      <Title>{input?.kind === "url" ? t("public.onboarding.reading.titleLink") : t("public.onboarding.reading.title")}</Title>
      {input ? (
        <p className="mt-3 rounded-[14px] px-3 py-2 text-[0.875rem] italic" style={{ color: "var(--tl-ink-soft)", background: "var(--tl-stone-soft)" }} data-testid="onb-reading-input">
          {input.value}
        </p>
      ) : null}
      <ProgressBar expectedMs={input?.kind === "url" ? 9000 : 3500} />
      <LoadingSteps items={lines} activeIndex={done} />
      <p className="mt-6 text-[0.8125rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.reading.next")}</p>
      {offerSkip && onSkipAi ? (
        <div className="mt-4" data-testid="onb-reading-skip">
          <p className="text-[0.8125rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.reading.skipAiHint")}</p>
          <button type="button" onClick={onSkipAi} className="mt-2 text-[0.875rem] font-medium underline" style={{ color: "var(--tl-ink)" }} data-testid="onb-reading-skip-ai">
            {t("public.onboarding.reading.skipAi")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
