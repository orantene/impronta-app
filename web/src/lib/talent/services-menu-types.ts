/**
 * Talent services menu — shared plain types + normaliser (2026-06-14).
 *
 * CONFIGURATION LAYER ONLY. Describes a talent's published *menu of services*
 * (talent_profiles.services_menu jsonb). It does NOT charge a card or run any
 * money math — a selected service merely PRE-FILLS an offer line item / instant-
 * book through the existing rail (see services-menu-offer mapper).
 *
 * Directive-free (no "use server") so it imports cleanly into server actions,
 * client components, and pure mappers alike.
 *
 * Storage contract: talent_profiles.services_menu jsonb = ServiceMenuItem[].
 */

/**
 * How a service is priced. These values are exactly the (extended)
 * `inquiry_offer_line_items.pricing_unit` Postgres enum, so a service's
 * pricingType maps 1:1 onto an offer line unit (the offer mapper is identity).
 *   • custom        — quote on request; carries no fixed amount (amountCents null)
 *   • flat_package  — one flat total (units = 1)
 */
export type ServicePricingType =
  | "hour"
  | "day"
  | "week"
  | "half_day"
  | "event"
  | "per_person"
  | "per_contact"
  | "flat_package"
  | "custom";

export const SERVICE_PRICING_TYPES: readonly ServicePricingType[] = [
  "hour",
  "day",
  "week",
  "half_day",
  "event",
  "per_person",
  "per_contact",
  "flat_package",
  "custom",
];

/** Per-service visibility. */
export type ServiceVisibility = "public" | "agency_only" | "on_request";
export const SERVICE_VISIBILITIES: readonly ServiceVisibility[] = ["public", "agency_only", "on_request"];

/** Human labels for the unit dropdown + price preview suffix. */
export const SERVICE_PRICING_LABELS: Record<ServicePricingType, string> = {
  hour: "Per hour",
  day: "Per day",
  week: "Per week",
  half_day: "Per half-day",
  event: "Per event",
  per_person: "Per person",
  per_contact: "Per session",
  flat_package: "Flat package",
  custom: "Custom / quote on request",
};

/** Short suffix shown next to a price (e.g. "$X / person"). Empty = no suffix. */
export const SERVICE_PRICING_SUFFIX: Record<ServicePricingType, string> = {
  hour: "/ hour",
  day: "/ day",
  week: "/ week",
  half_day: "/ half-day",
  event: "/ event",
  per_person: "/ person",
  per_contact: "/ session",
  flat_package: "",
  custom: "",
};

/** A `custom` service carries no amount — it's a quote-on-request trigger. */
export function pricingTypeRequiresAmount(t: ServicePricingType): boolean {
  return t !== "custom";
}

/** Optional add-on (overtime, travel, equipment, …) attached to a service. */
export type ServiceAddOn = {
  id: string;
  label: string;
  pricingType: ServicePricingType;
  amountCents: number | null;
};

/** A named tier of one service (e.g. 2h / 4h / full-day). */
export type ServiceTier = {
  id: string;
  label: string;
  amountCents: number | null;
};

/** One service in the talent's menu. */
export type ServiceMenuItem = {
  id: string;
  name: string;
  description: string | null;
  pricingType: ServicePricingType;
  /** Major-unit price stored as cents. null = quote on request (custom). */
  amountCents: number | null;
  /** ISO currency code (defaults to the talent's default_currency on create). */
  currency: string;
  /** null = general (applies to all the talent's disciplines); else scoped to
   *  these talent_profile_taxonomy term ids. */
  taxonomyTermIds: string[] | null;
  addOns: ServiceAddOn[];
  tiers: ServiceTier[];
  isActive: boolean;
  visibility: ServiceVisibility;
  sortOrder: number;
  /** At most one service per talent may be the designated instant-book service. */
  isInstantBook: boolean;
  /** Bundle/package contents (S10): ids of other menu services included in this
   *  one. Only meaningful for a flat_package service; null/[] otherwise. */
  childServiceIds: string[] | null;
};

const MAX_NAME = 120;
const MAX_DESC = 1000;
const MAX_ITEMS = 60;
const MAX_SUB = 30; // add-ons / tiers per service

function clampCents(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}
function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function isPricingType(v: unknown): v is ServicePricingType {
  return typeof v === "string" && (SERVICE_PRICING_TYPES as readonly string[]).includes(v);
}
function isVisibility(v: unknown): v is ServiceVisibility {
  return typeof v === "string" && (SERVICE_VISIBILITIES as readonly string[]).includes(v);
}

let _idSeq = 0;
/** Deterministic-ish id (no Math.random/Date dep at module scope). */
function fallbackId(seed: number): string {
  _idSeq += 1;
  return `svc_${seed.toString(36)}_${_idSeq.toString(36)}`;
}

function normalizeSub(raw: unknown, seed: number): ServiceAddOn | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = str(o.label, MAX_NAME);
  if (!label) return null;
  const pricingType = isPricingType(o.pricingType) ? o.pricingType : "flat_package";
  return {
    id: str(o.id, 64) ?? fallbackId(seed),
    label,
    pricingType,
    amountCents: clampCents(o.amountCents),
  };
}

function normalizeItem(raw: unknown, index: number, currencyFallback: string): ServiceMenuItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = str(o.name, MAX_NAME);
  if (!name) return null;

  const pricingType = isPricingType(o.pricingType) ? o.pricingType : "event";
  // custom services carry no amount; all others coerce to a non-negative int.
  const amountCents = pricingType === "custom" ? null : clampCents(o.amountCents);

  const termIds = Array.isArray(o.taxonomyTermIds)
    ? (o.taxonomyTermIds.filter((x) => typeof x === "string" && x.length > 0) as string[])
    : null;

  const childIds = Array.isArray(o.childServiceIds)
    ? (o.childServiceIds.filter((x) => typeof x === "string" && x.length > 0) as string[])
    : null;

  const addOns = Array.isArray(o.addOns)
    ? (o.addOns.map((a, i) => normalizeSub(a, index * 1000 + i)).filter(Boolean) as ServiceAddOn[]).slice(0, MAX_SUB)
    : [];
  const tiers = Array.isArray(o.tiers)
    ? (o.tiers
        .map((t, i) => {
          const n = normalizeSub({ ...(t as object), pricingType: "flat_package" }, index * 2000 + i);
          return n ? { id: n.id, label: n.label, amountCents: n.amountCents } : null;
        })
        .filter(Boolean) as ServiceTier[]).slice(0, MAX_SUB)
    : [];

  const currency =
    typeof o.currency === "string" && o.currency.trim().length >= 3
      ? o.currency.trim().toUpperCase().slice(0, 8)
      : currencyFallback;

  return {
    id: str(o.id, 64) ?? fallbackId(index),
    name,
    description: str(o.description, MAX_DESC),
    pricingType,
    amountCents,
    currency,
    taxonomyTermIds: termIds && termIds.length > 0 ? termIds : null,
    addOns,
    tiers,
    isActive: o.isActive !== false, // default active
    visibility: isVisibility(o.visibility) ? o.visibility : "public",
    sortOrder: typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder) ? o.sortOrder : index,
    isInstantBook: o.isInstantBook === true,
    childServiceIds: childIds && childIds.length > 0 ? childIds : null,
  };
}

/**
 * Coerce an arbitrary stored jsonb value into a safe ServiceMenuItem[].
 * - drops malformed/nameless items
 * - dedups ids, re-sorts by sortOrder then re-indexes sortOrder 0..n
 * - enforces AT MOST ONE isInstantBook item (first active wins)
 * - caps the list length
 */
export function normalizeServicesMenu(raw: unknown, currencyFallback = "USD"): ServiceMenuItem[] {
  if (!Array.isArray(raw)) return [];
  const items = (raw.map((r, i) => normalizeItem(r, i, currencyFallback)).filter(Boolean) as ServiceMenuItem[]);

  // dedup ids
  const seen = new Set<string>();
  const deduped: ServiceMenuItem[] = [];
  for (const it of items) {
    if (seen.has(it.id)) it.id = fallbackId(deduped.length);
    seen.add(it.id);
    deduped.push(it);
  }

  // sort + re-index
  deduped.sort((a, b) => a.sortOrder - b.sortOrder);
  deduped.forEach((it, i) => (it.sortOrder = i));

  // at most one instant-book service (prefer the first active one)
  let claimed = false;
  for (const it of deduped) {
    if (it.isInstantBook && it.isActive && !claimed) {
      claimed = true;
    } else if (it.isInstantBook) {
      it.isInstantBook = false;
    }
  }

  return deduped.slice(0, MAX_ITEMS);
}

/**
 * The single service designated for instant-book (S16), if any. normalize already
 * enforces "at most one isInstantBook", so this is the first active, priced,
 * non-custom instant-book service. Returns null when none qualifies — callers
 * then fall back to the legacy booking_terms.fixedRateCents.
 */
export function findInstantBookService(items: ServiceMenuItem[]): ServiceMenuItem | null {
  return (
    items.find(
      (it) =>
        it.isInstantBook &&
        it.isActive &&
        it.pricingType !== "custom" &&
        it.amountCents != null &&
        it.amountCents > 0,
    ) ?? null
  );
}

/**
 * Validation errors for a save (S20). Returns [] when the menu is persistable.
 * - a non-custom service must have a positive amount
 * - an instant-book service must be active + priced + not custom
 */
export function validateServicesMenu(items: ServiceMenuItem[]): string[] {
  const errors: string[] = [];
  for (const it of items) {
    if (pricingTypeRequiresAmount(it.pricingType) && (it.amountCents == null || it.amountCents <= 0)) {
      errors.push(`"${it.name}" needs a price (or set it to Custom / quote on request).`);
    }
    if (it.isInstantBook) {
      if (!it.isActive) errors.push(`The instant-book service "${it.name}" must be active.`);
      if (it.pricingType === "custom" || it.amountCents == null || it.amountCents <= 0) {
        errors.push(`The instant-book service "${it.name}" must have a fixed price.`);
      }
    }
  }
  return errors;
}
