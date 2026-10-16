"use client";

/**
 * 1D · "Pick how your page looks": three ready Maison v2 palettes with a live
 * swatch preview (the real palette tokens), the recommended one first, or keep the
 * default. Talent (myself / both) only; a studio picks its look at the style
 * tile. The pick is applied before publish.
 */

import { useEffect } from "react";

import { designLooksForCategory, type DesignLookKey } from "@/lib/onboarding/finish-url";
import { getGalleryDesign } from "@/lib/talent-site/theme-catalog/gallery-meta";

import { Sub, Title } from "../ui";

type T = (key: string) => string;

/** Literal keys (the dead-catalog guard forbids composed keys). */
const LOOK_NAME: Record<DesignLookKey, string> = {
  rose: "public.onboarding.design.rose",
  blush: "public.onboarding.design.blush",
  orchid: "public.onboarding.design.orchid",
  sage: "public.onboarding.design.sage",
  porcelain: "public.onboarding.design.porcelain",
};

/** Swatches come from the released Maison v2 palettes (the design onboarding applies). */
const V2_PALETTES = getGalleryDesign("maison-v2")?.palettes ?? [];

export function DesignPick({ t, value, onPick, category = null }: { t: T; value: DesignLookKey | null; onPick: (look: DesignLookKey | null) => void; category?: string | null }) {
  const looks = designLooksForCategory(category);
  // A non-beauty trade must not silently get the beauty default: record its first look.
  const firstLook = looks[0];
  useEffect(() => {
    if (value === null && firstLook && firstLook !== "rose") onPick(firstLook);
  }, [firstLook, value, onPick]);
  return (
    <div className="mt-5" data-testid="onb-design">
      <Title size={20}>{t("public.onboarding.design.title")}</Title>
      <Sub>{t("public.onboarding.design.sub")}</Sub>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${looks.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={t("public.onboarding.design.title")}>
        {looks.map((k, i) => {
          const p = V2_PALETTES.find((x) => x.key === k);
          if (!p) return null;
          const on = (value ?? looks[0]) === k;
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
