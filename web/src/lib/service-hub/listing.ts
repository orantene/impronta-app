/**
 * TUL-1367 · Service hub listing link (pure, no DB).
 *
 * One row per talent x workspace x service (public.workspace_service_listings, held
 * migration 20261231419300_workspace_service_listings_tul1367.sql). It lets ANY kind of
 * group (agency, network, studio, rental studio, collective) sell a talent's service with
 * the talent's consent, at a price the client sees, never below the talent's floor.
 *
 * The database enforces the same floor and exclusivity rules (trigger); these helpers are
 * the app-side twin for forms and the Service hub screen.
 */
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";
import type { UsdRates } from "@/lib/pricing/usd-equivalent";

export type ListingStatus = "offered" | "accepted" | "hidden";
export type ListingPriceMode = "talent_price" | "margin" | "fixed" | "from";
export type ListingShowWho = "name" | "portfolio" | "hidden";
export type ListingClientContact = "workspace" | "talent";
export type ListingBookingType = "request" | "instant";

export type ServiceListing = {
  id: string;
  tenantId: string;
  talentProfileId: string;
  offeringId: string;
  status: ListingStatus;
  priceMode: ListingPriceMode;
  marginBps: number | null;
  /** fixed / from price, in the service's (talent's) currency. */
  priceCents: number | null;
  /** Always the service's currency: the talent's currency is kept. */
  currency: string;
  /** "Lowest price I accept" for this workspace, set by the talent. */
  talentLowestCents: number | null;
  /** Workspace-wide minimum client price (workspace_service_hub_settings). */
  workspaceMinCents: number;
  /** A listing may set a HIGHER minimum, never a lower one. */
  listingMinCents: number;
  showWho: ListingShowWho;
  clientContact: ListingClientContact;
  bookingType: ListingBookingType;
  /** Version of the workspace terms (TUL-1368) the talent had accepted when consenting. */
  acceptedTermsVersion: number | null;
  /** Set when the talent raised the price above this listing's price (owner alert). */
  floorBreachedAt: string | null;
  /** Set when the talent changed the service currency: stopped until the talent re-accepts. */
  currencyChangedAt: string | null;
};

/** Cap on every cents column (overflow guard, mirrored in SQL). */
export const MAX_CENTS = 1e12;

/** Effective minimum = MAX(workspace minimum, listing minimum): a listing can raise it, never lower it. */
export function effectiveMinCents(workspaceMinCents: number, listingMinCents: number): number {
  return Math.max(0, workspaceMinCents, listingMinCents);
}

/** What the client sees, in the service's currency. */
export function listingClientPriceCents(l: ServiceListing, talentPriceCents: number): number {
  switch (l.priceMode) {
    case "talent_price":
      return talentPriceCents;
    case "margin":
      return talentPriceCents + Math.round((talentPriceCents * (l.marginBps ?? 0)) / 10000);
    default:
      return l.priceCents ?? 0;
  }
}

/**
 * Floor (PM-confirmed 2026-10-19): MAX(talent's lowest accepted price, else their price;
 * effective minimum). The minimum is a floor on the client price, NOT a margin (the margin
 * lives only in the "price + margin" mode). Never a sum.
 */
export function listingFloorCents(input: {
  talentPriceCents: number;
  talentLowestCents: number | null;
  workspaceMinCents: number;
  listingMinCents: number;
}): number {
  return Math.max(
    input.talentLowestCents ?? input.talentPriceCents,
    effectiveMinCents(input.workspaceMinCents, input.listingMinCents),
  );
}

export type ListingPriceCheck = { ok: true } | { ok: false; reason: "below_floor"; floorCents: number };

/** talentPriceCents null = a quote-only service: there is no number to protect. */
export function checkListingPrice(l: ServiceListing, talentPriceCents: number | null): ListingPriceCheck {
  if (talentPriceCents == null) return { ok: true };
  const floorCents = listingFloorCents({
    talentPriceCents,
    talentLowestCents: l.talentLowestCents,
    workspaceMinCents: l.workspaceMinCents,
    listingMinCents: l.listingMinCents,
  });
  return listingClientPriceCents(l, talentPriceCents) >= floorCents
    ? { ok: true }
    : { ok: false, reason: "below_floor", floorCents };
}

/** After a talent price change: ids of live listings now under the floor (owner is alerted). */
export function listingsBreachedByTalentPrice(listings: readonly ServiceListing[], newTalentPriceCents: number): string[] {
  return listings
    .filter((l) => l.status !== "hidden" && !checkListingPrice(l, newTalentPriceCents).ok)
    .map((l) => l.id);
}

/** Consent given, still above the floor: may be shown and sold. Open offers keep their own price. */
export function isListingSellable(l: ServiceListing): boolean {
  return l.status === "accepted" && l.floorBreachedAt == null && l.currencyChangedAt == null;
}

/**
 * Exclusive talents (TUL-1365 decision 4): sold only by their exclusive workspace, their
 * own site (not a listing) and the Tulala hub (which routes requests to that workspace).
 * The exclusive workspace comes from accepted exclusive terms (talent_exclusive_workspace, #4158).
 */
export function canListForWorkspace(input: {
  exclusiveTenantId: string | null;
  targetTenantId: string;
  targetIsHub: boolean;
}): boolean {
  if (!input.exclusiveTenantId) return true;
  return input.targetIsHub || input.exclusiveTenantId === input.targetTenantId;
}

const IDENTITY_RANK: Record<ListingShowWho, number> = { hidden: 0, portfolio: 1, name: 2 };
const TERMS_PRICE_MODE: Record<string, ListingPriceMode> = {
  talent_price: "talent_price",
  talent_plus_margin: "margin",
  fixed: "fixed",
  from: "from",
};

/** Consent is bound to the accepted terms: never show more of the talent, same price mode. */
export function listingWithinTerms(
  l: Pick<ServiceListing, "showWho" | "priceMode">,
  terms: { showIdentity: ListingShowWho; clientPriceMode: string },
): boolean {
  return IDENTITY_RANK[l.showWho] <= IDENTITY_RANK[terms.showIdentity] && TERMS_PRICE_MODE[terms.clientPriceMode] === l.priceMode;
}

/** An owner edit to any field the talent agreed to sends the listing back to "offered". */
export function ownerEditNeedsReconsent(before: ServiceListing, after: ServiceListing): boolean {
  return (
    before.priceMode !== after.priceMode ||
    before.marginBps !== after.marginBps ||
    before.priceCents !== after.priceCents ||
    before.showWho !== after.showWho ||
    before.clientContact !== after.clientContact ||
    before.bookingType !== after.bookingType
  );
}

export type ListingValidation = { ok: true } | { ok: false; reason: string };

export function validateListingInput(l: ServiceListing): ListingValidation {
  if (l.priceMode === "margin" && (l.marginBps == null || !Number.isInteger(l.marginBps) || l.marginBps < 0 || l.marginBps > 10000)) {
    return { ok: false, reason: "margin_bps" };
  }
  if ((l.priceMode === "fixed" || l.priceMode === "from") && (l.priceCents == null || !Number.isInteger(l.priceCents) || l.priceCents < 0 || l.priceCents > MAX_CENTS)) {
    return { ok: false, reason: "price_cents" };
  }
  if (l.bookingType === "instant" && l.priceMode === "from") return { ok: false, reason: "instant_needs_price" };
  if (l.talentLowestCents != null && (!Number.isInteger(l.talentLowestCents) || l.talentLowestCents < 0)) {
    return { ok: false, reason: "talent_lowest" };
  }
  for (const [k, v] of [["workspace_min", l.workspaceMinCents], ["listing_min", l.listingMinCents]] as const) {
    if (!Number.isInteger(v) || v < 0 || v > MAX_CENTS) return { ok: false, reason: k };
  }
  if (l.talentLowestCents != null && l.talentLowestCents > MAX_CENTS) return { ok: false, reason: "talent_lowest" };
  if (!/^[A-Z]{3}$/.test(l.currency)) return { ok: false, reason: "currency" };
  return { ok: true };
}

/**
 * Hub display: the price in the service's (talent's) currency, which is also what is
 * charged, plus "≈" in the workspace currency when a rate exists. No rate, no line.
 * DISPLAY ONLY: never converts a stored amount or what checkout charges.
 */
export function hubPriceDisplay(input: {
  amountCents: number;
  serviceCurrency: string;
  workspaceCurrency: string;
  usdRates: UsdRates | null;
  locale: string;
}): { primary: string; secondary: string | null } {
  const src = input.serviceCurrency.toUpperCase();
  const dst = input.workspaceCurrency.toUpperCase();
  const primary = formatDashboardMoneyCents(input.amountCents, src, input.locale);
  if (src === dst || !input.usdRates) return { primary, secondary: null };
  const srcPerUsd = input.usdRates.perUsd[src];
  const dstPerUsd = input.usdRates.perUsd[dst];
  if (!(srcPerUsd > 0) || !(dstPerUsd > 0)) return { primary, secondary: null };
  const converted = Math.round((input.amountCents / srcPerUsd) * dstPerUsd);
  return { primary, secondary: `≈ ${formatDashboardMoneyCents(converted, dst, input.locale)}` };
}

/** Map a DB row (snake_case) to the typed row; null (fail closed) on a bad row. */
export function parseListingRow(raw: Record<string, unknown>): ServiceListing | null {
  const status = raw.status as ListingStatus;
  if (typeof raw.id !== "string" || !["offered", "accepted", "hidden"].includes(status)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[service-hub/listing] skipped bad workspace_service_listings row", raw.id, "status", raw.status);
    }
    return null;
  }
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: raw.id,
    tenantId: String(raw.tenant_id),
    talentProfileId: String(raw.talent_profile_id),
    offeringId: String(raw.offering_id),
    status,
    priceMode: raw.price_mode as ListingPriceMode,
    marginBps: num(raw.margin_bps),
    priceCents: num(raw.price_cents),
    currency: String(raw.currency ?? ""),
    talentLowestCents: num(raw.talent_lowest_cents),
    workspaceMinCents: Number(raw.workspace_min_cents ?? 0),
    listingMinCents: Number(raw.listing_min_cents ?? 0),
    showWho: raw.show_who as ListingShowWho,
    clientContact: raw.client_contact as ListingClientContact,
    bookingType: raw.booking_type as ListingBookingType,
    acceptedTermsVersion: num(raw.accepted_terms_version),
    floorBreachedAt: (raw.floor_breached_at as string | null) ?? null,
    currencyChangedAt: (raw.currency_changed_at as string | null) ?? null,
  };
}
