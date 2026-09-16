"use client";

/**
 * "Reading your words…" — three lines tick on while the understand step runs.
 * Phase 2 shows the ticking and a "next" line; Phase 3 replaces the tail with
 * the understood card.
 */

import { useEffect, useState } from "react";

import type { ModuleInput } from "@/lib/onboarding/module-state";

import { Tick, Title } from "../ui";

export function ReadingStep({ t, input }: { t: (key: string) => string; input: ModuleInput | null }) {
  const [done, setDone] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setDone((n) => Math.min(3, n + 1)), 650);
    return () => window.clearInterval(id);
  }, []);
  const lines = [t("public.onboarding.reading.line1"), t("public.onboarding.reading.line2"), t("public.onboarding.reading.line3")];
  return (
    <div data-testid="onb-reading" aria-busy={done < 3}>
      <Title>{input?.kind === "url" ? t("public.onboarding.reading.titleLink") : t("public.onboarding.reading.title")}</Title>
      {input ? (
        <p className="mt-3 rounded-[14px] px-3 py-2 text-[0.875rem] italic" style={{ color: "var(--tl-ink-soft)", background: "var(--tl-stone-soft)" }} data-testid="onb-reading-input">
          {input.value}
        </p>
      ) : null}
      <ul className="mt-5 flex flex-col gap-3">
        {lines.map((line, i) => (
          <li key={line} className="flex items-center gap-3 text-[0.9375rem]" style={{ color: i < done ? "var(--tl-ink)" : "var(--tl-muted)" }}>
            <Tick done={i < done} />
            {line}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[0.8125rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.reading.next")}</p>
    </div>
  );
}
