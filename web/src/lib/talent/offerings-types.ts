/**
 * Talent Services (storefront) — shared types + normalizers (2026-07-08).
 *
 * CONFIGURATION LAYER ONLY. Describes a talent's catalog of sellable/displayable
 * offerings (`talent_offerings` table; kind service|package|product). It never
 * charges a card — a selected offering rides the existing inquiry → offer →
 * booking → transaction rail (see offerings-offer.ts) and every charge derives
 * from the commission snapshot, never from `amountCents`.
 *
 * Directive-free (no "use server") so it imports into server actions, client
 * components, and pure mappers alike. Evolves services-menu-types (kept as the
 * legacy fallback); `priceType` reuses ServicePricingType, which is 1:1 with
 * the `inquiry_offer_line_items.pricing_unit` Postgres enum.
 */

import {
  SERVICE_PRICING_SUFFIX,
  SERVICE_PRICING_TYPES,
  type ServicePricingType,
} from "@/lib/talent/services-menu-types";

export type OfferingKind = "service" | "package" | "product";
export const OFFERING_KINDS: readonly OfferingKind[] = ["service", "package", "product"];

/** exact = show the number · from = "from $X" · quote = no number (uncharge-able) */
export type OfferingPriceDisplay = "exact" | "from" | "quote";
export const OFFERING_PRICE_DISPLAYS: readonly OfferingPriceDisplay[] = ["exact", "from", "quote"];

/**
 * How the TALENT chose to sell this offering:
 *  - request: inquiry → chat → offer → booking (human-confirmed; default)
 *  - instant: direct booking / reserve right away (fixed price required)
 */
export type OfferingBookingMode = "request" | "instant";
export const OFFERING_BOOKING_MODES: readonly OfferingBookingMode[] = ["request", "instant"];

/**
 * What a DIRECT booking collects up front (the talent's choice):
 *  full = whole total · deposit = deposit_pct now, balance later · free = reserve
 *  without payment (staff request later / cash at the appointment).
 */
export type OfferingReserveMode = "full" | "deposit" | "free";
export const OFFERING_RESERVE_MODES: readonly OfferingReserveMode[] = ["full", "deposit", "free"];

export type OfferingStatus = "draft" | "published" | "archived";
export type OfferingVisibility = "public" | "agency_only" | "on_request";
export type OfferingModerationState = "pending" | "approved" | "rejected";

/**
 * One selectable OPTION of an offering (size / tier / duration — the client
 * picks exactly one). amountCents null = the offering's base price applies.
 * Backed by talent_offering_variants.
 */
export type OfferingVariant = {
  id: string;
  label: string;
  amountCents: number | null;
};

/**
 * One stackable EXTRA (zero or more chosen; each adds its price on top).
 * Backed by talent_offering_addons.
 */
export type OfferingAddOn = {
  id: string;
  label: string;
  amountCents: number;
};

export type OfferingOwnerKind = "talent" | "workspace";

/** Who owns a catalogue row — talent roster profile or workspace Menu. */
export type OfferingOwner =
  | { kind: "talent"; talentProfileId: string }
  | { kind: "workspace"; tenantId: string };

/** One offering, app shape (camelCase). imageUrls resolves via talent_offering_media. */
export type TalentOffering = {
  id: string;
  /** Null when ownerKind === 'workspace'. */
  talentProfileId: string | null;
  ownerKind: OfferingOwnerKind;
  tenantId: string | null;
  kind: OfferingKind;
  title: string;
  description: string | null;
  priceType: ServicePricingType;
  priceDisplay: OfferingPriceDisplay;
  /** Major-unit price stored as cents. null only when quote/custom. */
  amountCents: number | null;
  currency: string;
  bookingMode: OfferingBookingMode;
  reserveMode: OfferingReserveMode;
  /** Percent of the total collected up front when reserveMode === 'deposit'. */
  depositPct: number | null;
  allowPayInPerson: boolean;
  /** When true, guest instant booking is refused (sign-in required). Default off. */
  requireAccountToBook: boolean;
  /** Hours before the appointment when free cancellation ends (null = flexible). */
  cancellationHours: number | null;
  /** Days a free reserve is held before the expiry cron auto-releases it (null = never). */
  freeReserveExpiresDays: number | null;
  durationMinutes: number | null;
  category: string | null;
  /**
   * Remaining stock. null = unlimited.
   *
   * Since capacity 0.3a this is a MIRROR of the offering's capacity pool, kept
   * in step by reserve_offering_stock / release_offering_stock. The pool is the
   * truth; this column is what the storefront reads until it is dropped.
   */
  inventoryQty: number | null;
  /**
   * The capacity pool this offering sells from, or null for unlimited.
   *
   * THIS, not `kind`, is what says an offering is stock-limited. The previous
   * design inferred it from `kind === "product"`, which silently excluded every
   * seat-limited package — including the one live course on the platform.
   */
  capacityPoolId: string | null;
  /** Units of the pool one purchase consumes. A "table for 4" consumes 4. */
  consumesUnits: number;
  status: OfferingStatus;
  visibility: OfferingVisibility;
  moderationState: OfferingModerationState;
  isFeatured: boolean;
  sortOrder: number;
  /** Long-tail sink (variations/add-ons sub-shapes, compliance, quote vars). */
  attributes: Record<string, unknown>;
  /** Resolved gallery, hero first (media_assets.public_url). */
  imageUrls: string[];
  /** Editor-only: gallery with asset ids (drives upload/remove). Public loads omit it. */
  imageAssets?: { id: string; url: string }[];
  /** Selectable options (client picks one). Loaded from talent_offering_variants. */
  variants?: OfferingVariant[];
  /** Stackable extras (client picks any). Loaded from talent_offering_addons. */
  addOns?: OfferingAddOn[];
};

/** DB row shape (snake_case) as read/written by the actions. */
export type TalentOfferingRow = {
  id: string;
  talent_profile_id: string | null;
  owner_kind?: string;
  tenant_id: string | null;
  kind: string;
  title: string;
  description: string | null;
  price_type: string;
  price_display: string;
  amount_cents: number | null;
  currency: string;
  booking_mode: string;
  reserve_mode: string;
  deposit_pct: number | null;
  allow_pay_in_person: boolean;
  require_account_to_book?: boolean;
  cancellation_hours: number | null;
  free_reserve_expires_days: number | null;
  duration_minutes: number | null;
  category: string | null;
  inventory_qty: number | null;
  capacity_pool_id?: string | null;
  consumes_units?: number | null;
  status: string;
  visibility: string;
  moderation_state: string;
  is_featured: boolean;
  sort_order: number;
  attributes: Record<string, unknown> | null;
  title_i18n: Record<string, string> | null;
  description_i18n: Record<string, string> | null;
};

const MAX_TITLE = 120;
const MAX_DESC = 2000;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function clampCents(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}
function posInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}
function isOneOf<T extends string>(v: unknown, all: readonly T[]): v is T {
  return typeof v === "string" && (all as readonly string[]).includes(v);
}

/** Locale-aware title/description (prefer i18n map, fall back to the column). */
export function offeringText(
  row: Pick<TalentOfferingRow, "title" | "description" | "title_i18n" | "description_i18n">,
  field: "title" | "description",
  locale: string,
): string | null {
  const map = field === "title" ? row.title_i18n : row.description_i18n;
  const fromMap = map?.[locale] ?? map?.en ?? null;
  return str(fromMap, field === "title" ? MAX_TITLE : MAX_DESC) ?? (field === "title" ? row.title : row.description);
}

/** DB row → app shape. Tolerant of bad data (defaults, clamps). */
export function rowToOffering(row: TalentOfferingRow, locale = "en", imageUrls: string[] = []): TalentOffering {
  const priceType = isOneOf(row.price_type, SERVICE_PRICING_TYPES) ? row.price_type : "flat_package";
  const priceDisplay = isOneOf(row.price_display, OFFERING_PRICE_DISPLAYS) ? row.price_display : "exact";
  return {
    id: row.id,
    talentProfileId: row.talent_profile_id,
    ownerKind: row.owner_kind === "workspace" ? "workspace" : "talent",
    tenantId: row.tenant_id ?? null,
    kind: isOneOf(row.kind, OFFERING_KINDS) ? row.kind : "service",
    title: offeringText(row, "title", locale) ?? row.title,
    description: offeringText(row, "description", locale),
    priceType,
    priceDisplay,
    amountCents: clampCents(row.amount_cents),
    currency: (row.currency || "USD").toUpperCase().slice(0, 8),
    bookingMode: isOneOf(row.booking_mode, OFFERING_BOOKING_MODES) ? row.booking_mode : "request",
    reserveMode: isOneOf(row.reserve_mode, OFFERING_RESERVE_MODES) ? row.reserve_mode : "full",
    depositPct:
      typeof row.deposit_pct === "number" && Number.isFinite(row.deposit_pct) && row.deposit_pct > 0 && row.deposit_pct < 100
        ? Math.round(row.deposit_pct)
        : null,
    allowPayInPerson: row.allow_pay_in_person === true,
    requireAccountToBook: row.require_account_to_book === true,
    cancellationHours:
      typeof row.cancellation_hours === "number" && Number.isFinite(row.cancellation_hours) && row.cancellation_hours >= 0
        ? Math.round(row.cancellation_hours)
        : null,
    freeReserveExpiresDays: posInt(row.free_reserve_expires_days),
    durationMinutes: posInt(row.duration_minutes),
    category: str(row.category, 80),
    inventoryQty:
      typeof row.inventory_qty === "number" && Number.isFinite(row.inventory_qty) && row.inventory_qty >= 0
        ? Math.round(row.inventory_qty)
        : null,
    capacityPoolId: typeof row.capacity_pool_id === "string" && row.capacity_pool_id ? row.capacity_pool_id : null,
    consumesUnits:
      typeof row.consumes_units === "number" && Number.isFinite(row.consumes_units) && row.consumes_units > 0
        ? Math.round(row.consumes_units)
        : 1,
    status: isOneOf(row.status, ["draft", "published", "archived"] as const) ? row.status : "draft",
    visibility: isOneOf(row.visibility, ["public", "agency_only", "on_request"] as const)
      ? row.visibility
      : "public",
    moderationState: isOneOf(row.moderation_state, ["pending", "approved", "rejected"] as const)
      ? row.moderation_state
      : "approved",
    isFeatured: row.is_featured === true,
    sortOrder: typeof row.sort_order === "number" && Number.isFinite(row.sort_order) ? row.sort_order : 0,
    attributes: row.attributes && typeof row.attributes === "object" ? row.attributes : {},
    imageUrls,
  };
}

/** App shape → DB patch (writers persist title + title_i18n.en together). */
export function offeringToRowPatch(
  o: TalentOffering,
): Omit<TalentOfferingRow, "id" | "talent_profile_id" | "inventory_qty"> {
  const title = str(o.title, MAX_TITLE) ?? "";
  const description = str(o.description, MAX_DESC);
  return {
    tenant_id: o.tenantId,
    owner_kind: o.ownerKind,
    kind: o.kind,
    title,
    description,
    price_type: o.priceType,
    price_display: o.priceDisplay,
    amount_cents: o.priceDisplay === "quote" || o.priceType === "custom" ? clampCents(o.amountCents) : clampCents(o.amountCents),
    currency: (o.currency || "USD").toUpperCase().slice(0, 8),
    booking_mode: o.bookingMode,
    reserve_mode: o.reserveMode,
    deposit_pct: o.reserveMode === "deposit" && o.depositPct ? Math.round(o.depositPct) : null,
    allow_pay_in_person: o.allowPayInPerson === true,
    require_account_to_book: o.requireAccountToBook === true,
    cancellation_hours: o.cancellationHours != null && o.cancellationHours >= 0 ? Math.round(o.cancellationHours) : null,
    // Only free reserves auto-expire; other modes keep the column null.
    free_reserve_expires_days: o.reserveMode === "free" ? posInt(o.freeReserveExpiresDays) : null,
    duration_minutes: posInt(o.durationMinutes),
    category: str(o.category, 80),
    // inventory_qty is DELIBERATELY ABSENT from the editor write shape.
    // It is the mirror of a capacity pool, and setting it means "this many
    // available NOW", which has to become `available + already held` on the pool
    // under its row lock. A plain write here would either shrink the ceiling
    // below what is outstanding or desync the mirror the storefront reads.
    // Every stock edit goes through setOfferingStock() in lib/capacity.
    status: o.status,
    visibility: o.visibility,
    moderation_state: o.moderationState,
    is_featured: o.isFeatured === true,
    sort_order: o.sortOrder,
    attributes: o.attributes ?? {},
    title_i18n: title ? { en: title } : null,
    description_i18n: description ? { en: description } : null,
  };
}

/** Validation errors for a save. [] = persistable. Mirrors the DB CHECKs. */
export function validateOffering(o: TalentOffering): string[] {
  const errors: string[] = [];
  if (!str(o.title, MAX_TITLE)) errors.push("Give it a name (e.g. “60-min massage”).");
  const quoteOnly = o.priceDisplay === "quote" || o.priceType === "custom";
  if (!quoteOnly && (o.amountCents == null || o.amountCents <= 0)) {
    errors.push(`“${o.title || "This service"}” needs a price — or switch it to “Contact for price.”`);
  }
  if (o.bookingMode === "instant") {
    if (quoteOnly || o.amountCents == null || o.amountCents <= 0 || o.priceDisplay !== "exact") {
      errors.push(`Direct booking needs one fixed price — set an exact amount on “${o.title}” or switch it to “Inquiry to book.”`);
    }
  }
  if (o.bookingMode === "instant" && o.reserveMode === "deposit" && (o.depositPct == null || o.depositPct <= 0 || o.depositPct >= 100)) {
    errors.push(`Set the deposit percent (1–99) for “${o.title}” — or switch it to full payment / free reserve.`);
  }
  if (!o.currency || o.currency.length < 3) errors.push("Pick a currency.");
  return errors;
}

/** What the public CTA should be, resolved from BEHAVIOR (not kind). */
export type OfferingCtaKind = "book_now" | "buy_now" | "request_to_book" | "request" | "ask_quote";
export function resolveOfferingCta(
  o: Pick<TalentOffering, "kind" | "bookingMode" | "priceType" | "priceDisplay" | "amountCents" | "visibility">,
): OfferingCtaKind {
  if (o.visibility === "on_request") return "request";
  if (o.priceDisplay === "quote" || o.priceType === "custom" || o.amountCents == null) return "ask_quote";
  if (o.bookingMode === "instant") return o.kind === "product" ? "buy_now" : "book_now";
  return "request_to_book";
}

/**
 * SERVER GUARD: may this offering be charged via the direct/instant path?
 * A quote/custom/on-request/draft offering is uncharge-able by construction —
 * the ONLY path to money for those is a human-composed offer.
 */
export function offeringIsDirectlyBookable(
  o: Pick<
    TalentOffering,
    "bookingMode" | "status" | "moderationState" | "visibility" | "priceType" | "priceDisplay" | "amountCents"
  >,
): boolean {
  return (
    o.bookingMode === "instant" &&
    o.status === "published" &&
    o.moderationState === "approved" &&
    o.visibility !== "agency_only" &&
    o.priceType !== "custom" &&
    o.priceDisplay === "exact" &&
    o.amountCents != null &&
    o.amountCents > 0
  );
}

/** Money formatter resilient to a bad currency code. */
export function formatOfferingPrice(amountCents: number, currency: string, locale: string): string {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat(locale === "es" ? "es" : "en", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toLocaleString()}`;
  }
}

/** The public price line: "$120 / session" · "from $450" · "Quote on request" · "On request". */
export function offeringPriceLabel(
  o: Pick<TalentOffering, "priceType" | "priceDisplay" | "amountCents" | "currency" | "visibility">,
  locale: string,
): string {
  const es = locale === "es";
  if (o.visibility === "on_request") return es ? "Bajo consulta" : "On request";
  if (o.priceDisplay === "quote" || o.priceType === "custom" || o.amountCents == null) {
    return es ? "Cotización a pedido" : "Quote on request";
  }
  const price = formatOfferingPrice(o.amountCents, o.currency, locale);
  const suffix = SERVICE_PRICING_SUFFIX[o.priceType];
  const core = suffix ? `${price} ${suffix}` : price;
  return o.priceDisplay === "from" ? (es ? `desde ${core}` : `from ${core}`) : core;
}

/** Blank offering for the editor's Add flow (smart defaults do the hiding). */
export function blankOffering(
  owner: OfferingOwner | string,
  defaultCurrency: string,
  sortOrder: number,
): TalentOffering {
  // Back-compat: callers that pass a talent profile id string.
  const resolved: OfferingOwner =
    typeof owner === "string" ? { kind: "talent", talentProfileId: owner } : owner;
  return {
    id: "",
    talentProfileId: resolved.kind === "talent" ? resolved.talentProfileId : null,
    ownerKind: resolved.kind,
    tenantId: resolved.kind === "workspace" ? resolved.tenantId : null,
    kind: "service",
    title: "",
    description: null,
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: null,
    currency: defaultCurrency,
    bookingMode: "request",
    reserveMode: "full",
    depositPct: null,
    allowPayInPerson: false,
    requireAccountToBook: false,
    cancellationHours: null,
    freeReserveExpiresDays: null,
    durationMinutes: null,
    category: null,
    inventoryQty: null,
    capacityPoolId: null,
    consumesUnits: 1,
    status: "published",
    visibility: "public",
    moderationState: "approved",
    isFeatured: false,
    sortOrder,
    attributes: {},
    imageUrls: [],
  };
}
