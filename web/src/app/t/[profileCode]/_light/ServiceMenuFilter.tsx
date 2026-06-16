"use client";

/**
 * ServiceMenuFilter — interactive discipline filter for the public services menu
 * (S19). Client island rendered ONLY when a talent's services span 2+ disciplines
 * (the decision is made server-side in ServiceMenuBlock). Pills: "All" (default)
 * + one per present discipline. A "general" service (no discipline scoping)
 * applies to every discipline, so it stays visible under every filter.
 */

import { useState } from "react";
import type { ServiceMenuItem } from "@/lib/talent/services-menu-types";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { serviceMatchesDiscipline } from "@/lib/talent/services-menu-types";
import { ServiceMenuList } from "./ServiceMenuList";

type Discipline = { id: string; label: string };

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

export function ServiceMenuFilter({
  items,
  locale,
  disciplineLabels,
  present,
}: {
  items: ServiceMenuItem[];
  locale: string;
  disciplineLabels: Record<string, string>;
  present: Discipline[];
}) {
  const [active, setActive] = useState<string | null>(null);
  const nameById = new Map(items.map((it) => [it.id, it.name]));
  const allLabel = pickLocale(locale, { en: "All", es: "Todos" });

  // Only the disciplines shown as pills are "known" — a service scoped solely to
  // a stale id then behaves like general (shows under every pill, not nowhere).
  const knownIds = new Set(present.map((d) => d.id));
  const filtered = items.filter((it) => serviceMatchesDiscipline(it, active, knownIds));

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        <FilterPill label={allLabel} active={active === null} onClick={() => setActive(null)} />
        {present.map((d) => (
          <FilterPill
            key={d.id}
            label={d.label}
            active={active === d.id}
            onClick={() => setActive(d.id)}
          />
        ))}
      </div>
      <ServiceMenuList
        items={filtered}
        locale={locale}
        disciplineLabels={disciplineLabels}
        nameById={nameById}
      />
    </>
  );
}
