"use client";

/**
 * StorefrontFilter — interactive category filter for the public Services
 * section. Client island rendered ONLY when a talent's offerings span 2+ distinct
 * categories (the decision is made server-side in TalentStorefront). Pills:
 * "All" (default) + one per present category. Selecting a category shows only
 * offerings with that exact `category`; uncategorized offerings (category null)
 * stay reachable under "All". The featured hero shows only under "All" so a
 * filtered view never surfaces an off-category signature piece.
 *
 * The full list is also rendered server-side (TalentStorefront → StorefrontBody)
 * for SEO; this island only changes what's shown after a click.
 */

import { useState } from "react";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { StorefrontBody } from "./StorefrontBody";

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="plt-mono rounded-full border px-3 py-1 text-[0.6875rem] uppercase tracking-[0.1em] transition-colors"
      style={{
        borderColor: active ? "var(--plt-ink)" : "var(--plt-hairline-strong)",
        background: active ? "var(--plt-ink)" : "transparent",
        color: active ? "var(--plt-bg-raised)" : "var(--plt-muted)",
      }}
    >
      {label}
    </button>
  );
}

export function StorefrontFilter({
  visible,
  locale,
  categories,
}: {
  visible: TalentOffering[];
  locale: string;
  categories: string[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const allLabel = pickLocale(locale, { en: "All", es: "Todos" });
  const filtered = active === null ? visible : visible.filter((o) => o.category === active);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterPill label={allLabel} active={active === null} onClick={() => setActive(null)} />
        {categories.map((c) => (
          <FilterPill key={c} label={c} active={active === c} onClick={() => setActive(c)} />
        ))}
      </div>
      <StorefrontBody visible={filtered} locale={locale} showFeatured={active === null} />
    </>
  );
}
