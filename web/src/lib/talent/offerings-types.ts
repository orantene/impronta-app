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

import { i18nPair, toI18nMap } from "@/lib/i18n/i18n-columns";
import type { LocalizedMap } from "@/lib/i18n/resolve-localized";
import { IDENTITY_REASONS, isIdentityReason, type IdentityReason } from "@/lib/orders/identity-requirement";
import { formatMoney } from "@/lib/talent/offerings-money";
import {
  SERVICE_PRICING_SUFFIX,
  SERVICE_PRICING_SUFFIX_ES,
  SERVICE_PRICING_TYPES,
  type ServicePricingType,
} from "@/lib/talent/services-menu-types";
import { resolveCategoryLabel } from "./category-label-fallback";
import { platformServiceTitle } from "./offering-title-fallback";
import { inheritedInstantErrors } from "./offering-booking-rules";

export type OfferingKind = "service" | "package" | "product";
export const OFFERING_KINDS: readonly OfferingKind[] = ["service", "package", "product"];

/** exact = show the number · from = "from $X" · quote = no number (uncharge-able) */
export type OfferingPriceDisplay = "exact" | "from" | "quote";
export const OFFERING_PRICE_DISPLAYS: readonly OfferingPriceDisplay[] = ["exact", "from", "quote"];

/**
 * How the TALENT chose to sell this offering:
 *  - request: inquiry → chat → offer → booking (human-confirmed; default)
 *  - instant: direct booking / reserve right away (one exact price required,
 *    including $0 — complimentary class, table hold, free GA)
 *  - inquiry: answered by conversation first ("Consultar")
 * On a TalentOffering, `bookingMode: null` means the service INHERITS the
 * talent default (`talent_offerings.booking_mode` is nullable since WSF-B).
 * Resolve it with resolveEffectiveBookingMode / deriveOfferingCta; never
 * read a null as request.
 */
export type OfferingBookingMode = "request" | "instant" | "inquiry";
export const OFFERING_BOOKING_MODES: readonly OfferingBookingMode[] = ["request", "instant", "inquiry"];

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
  /** Per-locale label (talent_offering_variants.label_i18n); absent before the column exists. */
  labelI18n?: LocalizedMap;
  amountCents: number | null;
};

/**
 * One stackable EXTRA (zero or more chosen; each adds its price on top).
 * Backed by talent_offering_addons.
 */
export type OfferingAddOn = {
  id: string;
  label: string;
  /** Per-locale label (talent_offering_addons.label_i18n); absent before the column exists. */
  labelI18n?: LocalizedMap;
  amountCents: number;
  /** Minutes added when the guest selects this extra. Group extras carry this. */
  durationMinutes?: number | null;
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
  /**
   * Every language of the title / description (`title_i18n` / `description_i18n`).
   * Carried through the editor so a save keeps the languages it did not edit.
   */
  titleI18n?: LocalizedMap;
  descriptionI18n?: LocalizedMap;
  priceType: ServicePricingType;
  priceDisplay: OfferingPriceDisplay;
  /** Major-unit price stored as cents. null only when quote/custom. */
  amountCents: number | null;
  currency: string;
  /** Explicit mode, or null = inherit the talent default. */
  bookingMode: OfferingBookingMode | null;
  /**
   * WSF-C, public loaders only: the talent's switches leave this service no
   * route (bookings and inquiries off, or an inquiry service with inquiries
   * off). The storefront hides its button. Absent = shown.
   */
  publicCtaHidden?: boolean;
  /**
   * WSF-C, public loaders only: set when the talent paused new work on this
   * direct channel, so any storefront can show the §8 banner.
   */
  publicPause?: "bookings_paused" | "inquiries_paused" | "portfolio_only";
  reserveMode: OfferingReserveMode;
  /** Percent of the total collected up front when reserveMode === 'deposit'. */
  depositPct: number | null;
  allowPayInPerson: boolean;
  /** When true, guest instant booking is refused (sign-in required). Default off. */
  requireAccountToBook: boolean;
  /**
   * This PRODUCT needs a named buyer, whatever it costs.
   *
   * Distinct from `requireAccountToBook`, which demands an ACCOUNT. This one
   * demands only an email or a phone, and it is the only thing that makes a
   * sale refuse for want of a name: money on its own never does.
   */
  requiresIdentity: boolean;
  /** WHY a name is needed. Required exactly when `requiresIdentity`. */
  identityReason: IdentityReason | null;
  /** Hours before the appointment when free cancellation ends (null = flexible). */
  cancellationHours: number | null;
  /** Days a free reserve is held before the expiry cron auto-releases it (null = never). */
  freeReserveExpiresDays: number | null;
  durationMinutes: number | null;
  category: string | null;
  /**
   * The category in the visitor's language (`category_i18n`), set by
   * `rowToOffering` only when it differs from `category`. `category` stays the
   * grouping key.
   */
  categoryLabel?: string;
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
  /** Set on the first publish. Distinguishes Draft from Hidden. */
  firstPublishedAt: string | null;
  /** Present when the row was read with `updated_at`. */
  updatedAt?: string | null;
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
  booking_mode: string | null;
  reserve_mode: string;
  deposit_pct: number | null;
  allow_pay_in_person: boolean;
  require_account_to_book?: boolean;
  requires_identity?: boolean;
  identity_reason?: string | null;
  cancellation_hours: number | null;
  free_reserve_expires_days: number | null;
  duration_minutes: number | null;
  category: string | null;
  /** Per-locale category label; absent before migration 20261231299520. */
  category_i18n?: Record<string, string> | null;
  inventory_qty: number | null;
  capacity_pool_id?: string | null;
  consumes_units?: number | null;
  status: string;
  first_published_at?: string | null;
  updated_at?: string | null;
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

/**
 * Locale-aware title/description: the i18n map walked along `chain`
 * (default `[locale, "en"]`), then the plain column.
 */
export function offeringText(
  row: Pick<TalentOfferingRow, "title" | "description" | "title_i18n" | "description_i18n">,
  field: "title" | "description",
  locale: string,
  chain: readonly string[] = [locale, "en"],
): string | null {
  const map = field === "title" ? row.title_i18n : row.description_i18n;
  const clean = toI18nMap(map);
  const max = field === "title" ? MAX_TITLE : MAX_DESC;
  const visitor = (locale ?? "").trim().toLowerCase().slice(0, 2) || "en";
  let otherLang: string | null = null;
  for (const code of [locale, ...chain]) {
    const hit = str(clean[code], max);
    if (!hit) continue;
    const codeKey = (code ?? "").trim().toLowerCase().slice(0, 2) || "en";
    if (codeKey === visitor) return hit;
    // Keep the first non-visitor hit (usually English) for later; a Spanish
    // visitor must not lock onto English before the platform dictionary runs.
    if (!otherLang) otherLang = hit;
  }
  // TUL-189: platform dictionary for a few standard titles when the talent
  // has no title in the visitor's language (same idea as category labels).
  if (field === "title") {
    const plain = str(row.title, max);
    for (const candidate of [plain, otherLang, str(clean.en, max)]) {
      if (!candidate) continue;
      const platform = platformServiceTitle(candidate, visitor);
      if (platform) return str(platform, max);
    }
  }
  if (otherLang) return otherLang;
  return field === "title" ? row.title : row.description;
}

/**
 * The category text for `locale` along `chain` (`category_i18n`), as
 * `{ categoryLabel }` only when it differs from the plain category; `{}`
 * otherwise, so a row with no stored translation maps exactly as before.
 */
function categoryLabelField(
  row: Pick<TalentOfferingRow, "category" | "category_i18n">,
  locale: string,
  chain: readonly string[],
): { categoryLabel?: string } {
  // TUL-15: the talent's own `category_i18n` first, then the platform
  // dictionary for a standard trade category, else the plain category.
  const label = resolveCategoryLabel({
    category: str(row.category, 80),
    categoryI18n: toI18nMap(row.category_i18n),
    locale,
    chain,
  });
  return label ? { categoryLabel: label } : {};
}

/** DB row → app shape. Tolerant of bad data (defaults, clamps). */
export function rowToOffering(
  row: TalentOfferingRow,
  locale = "en",
  imageUrls: string[] = [],
  chain: readonly string[] = [locale, "en"],
): TalentOffering {
  const priceType = isOneOf(row.price_type, SERVICE_PRICING_TYPES) ? row.price_type : "flat_package";
  const priceDisplay = isOneOf(row.price_display, OFFERING_PRICE_DISPLAYS) ? row.price_display : "exact";
  return {
    id: row.id,
    talentProfileId: row.talent_profile_id,
    ownerKind: row.owner_kind === "workspace" ? "workspace" : "talent",
    tenantId: row.tenant_id ?? null,
    kind: isOneOf(row.kind, OFFERING_KINDS) ? row.kind : "service",
    title: offeringText(row, "title", locale, chain) ?? row.title,
    description: offeringText(row, "description", locale, chain),
    titleI18n: toI18nMap(row.title_i18n),
    descriptionI18n: toI18nMap(row.description_i18n),
    priceType,
    priceDisplay,
    amountCents: clampCents(row.amount_cents),
    currency: (row.currency || "USD").toUpperCase().slice(0, 8),
    bookingMode: isOneOf(row.booking_mode, OFFERING_BOOKING_MODES) ? row.booking_mode : null,
    reserveMode: isOneOf(row.reserve_mode, OFFERING_RESERVE_MODES) ? row.reserve_mode : "full",
    depositPct:
      typeof row.deposit_pct === "number" && Number.isFinite(row.deposit_pct) && row.deposit_pct > 0 && row.deposit_pct < 100
        ? Math.round(row.deposit_pct)
        : null,
    allowPayInPerson: row.allow_pay_in_person === true,
    requireAccountToBook: row.require_account_to_book === true,
    requiresIdentity: row.requires_identity === true,
    // The pairing CHECK on the table makes a flagged row without a reason
    // impossible; a legacy or hand-edited row falls back to the commonest one
    // rather than reading as "no name needed".
    identityReason: row.requires_identity === true
      ? (isIdentityReason(row.identity_reason) ? row.identity_reason : "attendee_names")
      : null,
    cancellationHours:
      typeof row.cancellation_hours === "number" && Number.isFinite(row.cancellation_hours) && row.cancellation_hours >= 0
        ? Math.round(row.cancellation_hours)
        : null,
    freeReserveExpiresDays: posInt(row.free_reserve_expires_days),
    durationMinutes: posInt(row.duration_minutes),
    category: str(row.category, 80),
    ...categoryLabelField(row, locale, chain),
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
    firstPublishedAt: typeof row.first_published_at === "string" ? row.first_published_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
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

/**
 * App shape → DB patch. The plain title / description are the PRIMARY-language
 * value and are written into `title_i18n[primaryLocale]` / `description_i18n[...]`;
 * every other language already in `o.titleI18n` / `o.descriptionI18n` survives.
 * With no maps and the default "en" primary this is exactly `{ en: title }`.
 */
export function offeringToRowPatch(
  o: TalentOffering,
  primaryLocale = "en",
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
    // Written as a PAIR, because `talent_offerings_identity_reason_paired`
    // refuses a half-filled one and the two came apart the last time a flag and
    // its reason were written as separate expressions.
    ...identityStamp(o),
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
    title_i18n: nullIfEmpty(i18nPair(o.titleI18n, title, primaryLocale)),
    description_i18n: nullIfEmpty(i18nPair(o.descriptionI18n, description, primaryLocale)),
  };
}

function nullIfEmpty(map: Record<string, string>): Record<string, string> | null {
  return Object.keys(map).length > 0 ? map : null;
}

/** The flag and its reason, always together. Mirrors the DB pairing CHECK. */
function identityStamp(
  o: Pick<TalentOffering, "requiresIdentity" | "identityReason">,
): { requires_identity: boolean; identity_reason: string | null } {
  if (o.requiresIdentity !== true) return { requires_identity: false, identity_reason: null };
  return {
    requires_identity: true,
    identity_reason: isIdentityReason(o.identityReason) ? o.identityReason : "attendee_names",
  };
}

/** Human labels for the editor's reason picker. No em dashes: user-facing. */
export const IDENTITY_REASON_LABELS: Record<IdentityReason, string> = {
  attendee_names: "Every attendee has to be named",
  delivery: "It has to be delivered to someone",
  entitlement: "It issues credit spent later",
};

export { IDENTITY_REASONS };
export type { IdentityReason };

/** Validation errors for a save. [] = persistable. Mirrors the DB CHECKs. */
export function validateOffering(o: TalentOffering, defaultPosture?: string | null): string[] {
  const errors: string[] = [];
  if (!str(o.title, MAX_TITLE)) errors.push("Give it a name (e.g. “60-min massage”).");
  const quoteOnly = o.priceDisplay === "quote" || o.priceType === "custom";
  // A DRAFT may be saved before it has a price (2026-09-23), so photos can be
  // attached first: the photo is the second question, the price the third.
  // Only on "request" booking; instant booking still needs its exact price,
  // which the database also enforces (talent_offerings_instant_needs_price).
  // A negative amount is refused in every status.
  const priceLaterDraft = o.status === "draft" && o.bookingMode !== "instant" && o.amountCents == null;
  if (!quoteOnly && !priceLaterDraft && (o.amountCents == null || o.amountCents < 0)) {
    errors.push(`“${o.title || "This service"}” needs a price — or switch it to “Contact for price.”`);
  }
  if (o.bookingMode === "instant") {
    if (quoteOnly || o.amountCents == null || o.amountCents < 0 || o.priceDisplay !== "exact") {
      errors.push(`Direct booking needs one exact price — set an amount on “${o.title}” (zero is free) or switch it to “Inquiry to book.”`);
    }
  }
  if (o.bookingMode === "instant" && o.reserveMode === "deposit" && (o.depositPct == null || o.depositPct <= 0 || o.depositPct >= 100)) {
    errors.push(`Set the deposit percent (1–99) for “${o.title}” — or switch it to full payment / free reserve.`);
  }
  // WSF B2: an inherited Instant default is held to the same rules.
  errors.push(...inheritedInstantErrors(o, o.bookingMode, defaultPosture));
  if (o.requiresIdentity && !isIdentityReason(o.identityReason)) {
    errors.push(`Say why “${o.title || "this item"}” needs the buyer's name.`);
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
  if (o.bookingMode === "inquiry") return "request";
  if (o.bookingMode === "instant") return o.kind === "product" ? "buy_now" : "book_now";
  return "request_to_book";
}

/**
 * SERVER GUARD: may this offering be taken via the direct/instant path?
 * A quote/custom/on-request/draft offering is unbookable by construction —
 * the ONLY path for those is a human-composed offer. Zero is a price (free).
 * Null is not.
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
    o.amountCents >= 0
  );
}

/** Money formatter resilient to a bad currency code (TUL-383: `$700 MXN`). */
export function formatOfferingPrice(amountCents: number, currency: string, locale: string): string {
  return formatMoney(amountCents, currency, locale);
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
  const suffix = (es ? SERVICE_PRICING_SUFFIX_ES : SERVICE_PRICING_SUFFIX)[o.priceType];
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
    bookingMode: "instant",
    reserveMode: "full",
    depositPct: null,
    allowPayInPerson: false,
    requireAccountToBook: false,
    requiresIdentity: false,
    identityReason: null,
    cancellationHours: null,
    freeReserveExpiresDays: null,
    durationMinutes: null,
    category: null,
    inventoryQty: null,
    capacityPoolId: null,
    consumesUnits: 1,
    status: "published",
    firstPublishedAt: null,
    visibility: "public",
    moderationState: "approved",
    isFeatured: false,
    sortOrder,
    attributes: {},
    imageUrls: [],
  };
}
