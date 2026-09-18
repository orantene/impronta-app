"use client";

/**
 * "Choose a style you love": four tiles, one tap. The choice becomes the
 * brand.visual_direction fact the composer starts its Look from; the Look
 * can be changed later in the builder. Business and both only.
 */

import { useState } from "react";

import { VISUAL_DIRECTIONS, type VisualDirection } from "@/lib/onboarding/module-state";

import { PrimaryButton, Sub, Title } from "../ui";

type T = (key: string) => string;

/** Marketing photos already shipped with the site; no new bytes. */
const TILE_IMAGE: Record<VisualDirection, string> = {
  natural: "/marketing/photos/service-pros-lifestyle.jpg",
  modern: "/marketing/photos/agency-workspace-builder.jpg",
  minimal: "/marketing/photos/mk-hero-service.jpg",
  vibrant: "/marketing/photos/event-night-beams.jpg",
};

/** Literal keys (the dead-catalog guard forbids composed keys). */
const TILE_COPY: Record<VisualDirection, { title: string; sub: string }> = {
  natural: { title: "public.onboarding.style.natural", sub: "public.onboarding.style.naturalSub" },
  modern: { title: "public.onboarding.style.modern", sub: "public.onboarding.style.modernSub" },
  minimal: { title: "public.onboarding.style.minimal", sub: "public.onboarding.style.minimalSub" },
  vibrant: { title: "public.onboarding.style.vibrant", sub: "public.onboarding.style.vibrantSub" },
};

export function StyleStep({ t, initial, busy, onChoose }: { t: T; initial: VisualDirection | null; busy: boolean; onChoose: (d: VisualDirection, notes: string | null) => void }) {
  const [picked, setPicked] = useState<VisualDirection | null>(initial ?? "natural");
  const [notes, setNotes] = useState("");
  return (
    <div data-testid="onb-style">
      <Title>{t("public.onboarding.style.title")}</Title>
      <Sub>{t("public.onboarding.style.sub")}</Sub>
      <div className="mt-5 grid grid-cols-2 gap-3" role="radiogroup" aria-label={t("public.onboarding.style.title")}>
        {VISUAL_DIRECTIONS.map((d) => {
          const on = picked === d;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPicked(d)}
              data-testid={`onb-style-${d}`}
              className="overflow-hidden rounded-[16px] text-left transition-transform active:scale-[0.98]"
              style={{ border: on ? "2px solid var(--tl-ink)" : "1px solid var(--tl-hairline)", background: "var(--tl-surface-raised)" }}
            >
              <div className="relative aspect-[4/3] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- static marketing photo, sized by the tile */}
                <img src={TILE_IMAGE[d]} alt="" className="h-full w-full object-cover" loading="lazy" />
                {on ? (
                  <span aria-hidden className="absolute right-2 top-2 grid size-6 place-items-center rounded-full text-[0.75rem]" style={{ background: "var(--tl-ink)", color: "var(--tl-bone)" }}>✓</span>
                ) : null}
              </div>
              <div className="px-3 py-2">
                <span className="block text-[0.9375rem] font-semibold" style={{ color: "var(--tl-ink)" }}>{t(TILE_COPY[d].title)}</span>
                <span className="block text-[0.75rem]" style={{ color: "var(--tl-muted)" }}>{t(TILE_COPY[d].sub)}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        <label htmlFor="onb-style-notes" className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.style.notesLabel")}</label>
        <textarea
          id="onb-style-notes"
          name="onb-style-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 300))}
          rows={2}
          placeholder={t("public.onboarding.style.notesHint")}
          data-testid="onb-style-notes"
          className="w-full resize-none rounded-[14px] px-3 py-2 text-[0.9375rem] leading-[1.5] outline-none placeholder:text-[var(--tl-muted-soft)]"
          style={{ background: "var(--tl-surface-raised)", border: "1px solid var(--tl-hairline)", color: "var(--tl-ink)" }}
        />
      </div>
      <p className="mt-3 text-[0.8125rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.style.changeLater")}</p>
      <div className="mt-5">
        <PrimaryButton onClick={() => picked && onChoose(picked, notes.trim() || null)} disabled={busy || !picked} testId="onb-style-continue">{t("public.onboarding.style.continue")}</PrimaryButton>
      </div>
    </div>
  );
}
