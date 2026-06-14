/**
 * ServiceMenuBlock — public "Services & pricing" menu (S12 + S19).
 *
 * Renders the talent's configured services menu (talent_profiles.services_menu /
 * catalog commerce.servicesMenu) on the public profile. Display-only: a service
 * here later PRE-FILLS an offer line / instant-book through the existing rail —
 * this block never charges anything.
 *
 * Visibility contract (filtered upstream in page.tsx, re-guarded here):
 *   • public      → shown with its price
 *   • on_request  → shown, price replaced by "On request"
 *   • agency_only → never reaches the public page
 *
 * S19: when the visible services span 2+ disciplines, render the interactive
 * ServiceMenuFilter (client island); otherwise render the static list. Server
 * component — pure presentational. --plt tokens, mirrors ServicesBlock.
 */

import type { ServiceMenuItem } from "@/lib/talent/services-menu-types";
import { LightSectionLabel } from "./section-label";
import { ServiceMenuList } from "./ServiceMenuList";
import { ServiceMenuFilter } from "./ServiceMenuFilter";

type ServiceMenuBlockProps = {
  items: ServiceMenuItem[];
  locale: string;
  heading: string;
  /** S6 — discipline term id → label, for per-service scoping chips + S19 filter. */
  disciplineLabels?: Record<string, string>;
};

export function ServiceMenuBlock({ items, locale, heading, disciplineLabels }: ServiceMenuBlockProps) {
  // Defensive re-filter (page.tsx already excludes agency_only + inactive).
  const visible = items.filter((it) => it.isActive && it.visibility !== "agency_only");
  if (visible.length === 0) return null;

  // id → name across the full visible set (bundle "Includes" resolution).
  const nameById = new Map(visible.map((it) => [it.id, it.name]));

  // S19 — disciplines actually used by the visible services (intersected with
  // known labels), in label order. The filter shows only when 2+ are present.
  const presentIds = new Set<string>();
  for (const it of visible) {
    for (const tid of it.taxonomyTermIds ?? []) {
      if (disciplineLabels?.[tid]) presentIds.add(tid);
    }
  }
  const present = [...presentIds]
    .map((id) => ({ id, label: disciplineLabels![id] }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <section aria-labelledby="service-menu-heading" data-profile-section="service-menu">
      <LightSectionLabel id="service-menu-heading">{heading}</LightSectionLabel>

      {present.length >= 2 ? (
        <ServiceMenuFilter
          items={visible}
          locale={locale}
          disciplineLabels={disciplineLabels ?? {}}
          present={present}
        />
      ) : (
        <ServiceMenuList
          items={visible}
          locale={locale}
          disciplineLabels={disciplineLabels}
          nameById={nameById}
        />
      )}
    </section>
  );
}
