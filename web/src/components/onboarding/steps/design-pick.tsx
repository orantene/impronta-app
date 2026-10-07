"use client";

/**
 * 1D · "Pick how your page looks": three ready looks with a live swatch
 * preview (the real palette tokens), the recommended one first, or keep the
 * default. Talent (myself / both) only; a studio picks its look at the style
 * tile. The pick is applied before publish.
 */

import { DESIGN_LOOK_KEYS, type DesignLookKey } from "@/lib/onboarding/finish-url";
import { MAISON_PALETTES } from "@/lib/talent-site/theme-catalog/maison/seed";

import { Sub, Title } from "../ui";

type T = (key: string) => string;

/** Literal keys (the dead-catalog guard forbids composed keys). */
const LOOK_NAME: Record<DesignLookKey, string> = {
  pink: "public.onboarding.design.pink",
  pearl: "public.onboarding.design.pearl",
  sand: "public.onboarding.design.sand",
};

export function DesignPick({ t, value, onPick }: { t: T; value: DesignLookKey | null; onPick: (look: DesignLookKey | null) => void }) {
  return (
    <div className="mt-5" data-testid="onb-design">
      <Title size={20}>{t("public.onboarding.design.title")}</Title>
      <Sub>{t("public.onboarding.design.sub")}</Sub>
      <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("public.onboarding.design.title")}>
        {DESIGN_LOOK_KEYS.map((k, i) => {
          const p = MAISON_PALETTES[k];
          const on = (value ?? DESIGN_LOOK_KEYS[0]) === k && (value !== null || i === 0);
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(k)}
              data-testid={`onb-design-${k}`}
              className="overflow-hidden rounded-[14px] text-left"
              style={{ border: on ? "2px solid var(--tl-ink)" : "1px solid var(--tl-hairline)", background: "var(--tl-surface-raised)" }}
            >
              <div className="flex h-20 flex-col justify-between p-2" style={{ background: p.page }} aria-hidden>
                <span className="h-2 w-10 rounded-full" style={{ background: p.text }} />
                <span className="h-5 w-full rounded-[8px]" style={{ background: p.section, border: `1px solid ${p.rule}` }} />
                <span className="h-3 w-12 rounded-full" style={{ background: p.accent }} />
              </div>
              <div className="px-2 py-1.5">
                <span className="block truncate text-[0.8125rem] font-semibold" style={{ color: "var(--tl-ink)" }}>{t(LOOK_NAME[k])}</span>
                {i === 0 ? <span className="block text-[0.6875rem]" style={{ color: "var(--tl-muted)" }}>{t("public.onboarding.design.recommended")}</span> : null}
              </div>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => onPick(null)} data-testid="onb-design-keep" className="mt-2 text-[0.8125rem] underline underline-offset-2" style={{ color: value === null ? "var(--tl-ink)" : "var(--tl-muted)" }}>
        {t("public.onboarding.design.keep")}
      </button>
    </div>
  );
}
