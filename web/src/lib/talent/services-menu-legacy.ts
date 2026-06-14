/**
 * Legacy → services-menu mapper (S11). Pure + directive-free.
 *
 * Brings a talent's pre-menu rate data into the new services menu:
 *   • booking_terms.fixedRateCents → one priced flat_package "Standard booking"
 *   • package_teasers[{label,detail}] → custom (quote-on-request) services
 *
 * starting_from is deliberately NOT mapped — it's free text ("from $500/night")
 * with no reliable amount, so importing it would create a junk priced line.
 *
 * The import is OPT-IN and only offered when the menu is empty (see
 * importLegacyServicesMenu); this module just does the shape transform so it's
 * unit-testable in isolation.
 */

import type { ServiceMenuItem } from "./services-menu-types";

export type LegacyPackageTeaser = { label: string; detail: string | null };

export type LegacyRateSources = {
  packageTeasers: LegacyPackageTeaser[];
  fixedRateCents: number | null;
  /** Currency for any priced item (the talent's default). */
  currency: string;
};

let _seq = 0;
function legacyId(prefix: string): string {
  _seq += 1;
  return `svc_legacy_${prefix}_${_seq.toString(36)}`;
}

function makeItem(partial: {
  idPrefix: string;
  name: string;
  description?: string | null;
  pricingType: ServiceMenuItem["pricingType"];
  amountCents: number | null;
  currency: string;
  sortOrder: number;
}): ServiceMenuItem {
  return {
    id: legacyId(partial.idPrefix),
    name: partial.name,
    description: partial.description ?? null,
    pricingType: partial.pricingType,
    amountCents: partial.amountCents,
    currency: partial.currency,
    taxonomyTermIds: null,
    addOns: [],
    tiers: [],
    isActive: true,
    visibility: "public",
    sortOrder: partial.sortOrder,
    isInstantBook: false,
    childServiceIds: null,
  };
}

/** Coerce raw package_teasers jsonb into clean {label, detail} rows. */
export function parsePackageTeasers(raw: unknown): LegacyPackageTeaser[] {
  if (!Array.isArray(raw)) return [];
  const out: LegacyPackageTeaser[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const label = typeof (p as { label?: unknown }).label === "string" ? (p as { label: string }).label.trim() : "";
    if (!label) continue;
    const detailRaw = (p as { detail?: unknown }).detail;
    out.push({ label, detail: typeof detailRaw === "string" && detailRaw.trim() ? detailRaw.trim() : null });
  }
  return out;
}

/** True when there's something worth importing (a fixed rate or a named teaser). */
export function hasImportableLegacy(src: LegacyRateSources): boolean {
  return (src.fixedRateCents != null && src.fixedRateCents > 0) || src.packageTeasers.length > 0;
}

/**
 * Build services-menu items from legacy rate data. Returns [] when nothing maps.
 * Result is NOT normalized — the caller passes it through the normal save path
 * (normalize + validate + dual-write) so it gets the same treatment as a hand-
 * authored menu.
 */
export function legacyToServiceMenuItems(src: LegacyRateSources): ServiceMenuItem[] {
  const out: ServiceMenuItem[] = [];

  if (src.fixedRateCents != null && src.fixedRateCents > 0) {
    out.push(
      makeItem({
        idPrefix: "fixed",
        name: "Standard booking",
        pricingType: "flat_package",
        amountCents: Math.round(src.fixedRateCents),
        currency: src.currency,
        sortOrder: out.length,
      }),
    );
  }

  for (const t of src.packageTeasers) {
    out.push(
      makeItem({
        idPrefix: "pkg",
        name: t.label,
        description: t.detail,
        pricingType: "custom", // teasers carry no price → quote on request
        amountCents: null,
        currency: src.currency,
        sortOrder: out.length,
      }),
    );
  }

  return out;
}
