/**
 * Promo engine types (design doc promos-engine-talent-design-2026-10-14, A + I).
 *
 * Money is integer minor units everywhere. Time rules are LOCAL wall-clock
 * values in the promo's `tz`, never UTC instants (L3 rule 1).
 */

export type OfferKind = "percent" | "fixed" | "fixed_price" | "free_addon";
export type ScopeKind = "all" | "services" | "products";
export type Audience = "public" | "new_clients" | "returning" | "lapsed" | "one_client";
export type Unlock = "auto" | "code" | "link";
export type AppliesOn = "appointment" | "purchase";

export type Promo = {
  id: string;
  offer_kind: OfferKind;
  /** Percent as a number (e.g. 15 or 12.5); minor units for fixed / fixed_price. Ignored for free_addon. */
  value: number;
  currency: string;
  /** free_addon only: the add-on the client gets at 0. */
  addon?: { id: string; list_cents: number } | null;
  scope: ScopeKind;
  /** Empty or missing = everything in the scope. */
  target_ids?: readonly string[] | null;
  /** Minimum spend across the lines the promo covers. */
  min_subtotal_cents?: number | null;
  audience: Audience;
  unlock: Unlock;
  code?: string | null;
  applies_on: AppliesOn;
  /** "YYYY-MM-DD" (end inclusive to 23:59:59 local), local "YYYY-MM-DDTHH:MM[:SS]", or an ISO instant with offset. */
  starts_at?: string | null;
  ends_at?: string | null;
  /** purchase basis: the appointment must start on or before this local date. */
  use_by_date?: string | null;
  tz: string;
  /** 0 = Sunday ... 6 = Saturday, in `tz`. Empty or missing = every day. */
  weekdays?: readonly number[] | null;
  /** "HH:MM" local. to <= from means the window crosses midnight. */
  time_from?: string | null;
  time_to?: string | null;
  slot_id?: string | null;
  max_uses?: number | null;
  per_client_max?: number | null;
  deposit_required?: boolean;
  is_single_use?: boolean;
  customer_id?: string | null;
  is_draft?: boolean;
  is_paused?: boolean;
  archived_at?: string | null;
  is_trial?: boolean;
};

export type LineKind = "service" | "product" | "addon";

export type CartLine = {
  id: string;
  kind: LineKind;
  target_id: string;
  /** Unit list price. */
  list_cents: number;
  qty: number;
  currency: string;
  /** Services: the appointment start, an ISO instant. */
  appointment_start?: string | null;
  slot_id?: string | null;
};

export type ClientStatus = "new" | "returning" | "lapsed";

export type Client = {
  customerId?: string | null;
  phone?: string | null;
  email?: string | null;
  status: ClientStatus;
};

/** Counted by the caller from redemption rows (confirmed + held), matched on phone OR email for the client. */
export type PromoUsage = { used: number; usedByClient: number };
export type UsageMap = Readonly<Record<string, PromoUsage>>;

export type Unlocked = {
  codes: readonly string[];
  linkPromoIds: readonly string[];
};

export type RejectReason =
  | "not_started"
  | "expired"
  | "use_by_passed"
  | "wrong_day"
  | "wrong_time"
  | "sold_out"
  | "client_limit"
  | "audience"
  | "locked"
  | "draft"
  | "paused"
  | "archived"
  | "below_minimum"
  | "not_applicable"
  /** Eligible, but another promo gave the client a better deal. Not consumed. */
  | "outranked";

export type PromoSource = "personal" | "code" | "link" | "auto";

export type QuoteInput = {
  cart: readonly CartLine[];
  client: Client;
  now: string | Date;
  promos: readonly Promo[];
  usage: UsageMap;
  unlocked: Unlocked;
};

export type QuoteLine = {
  lineId: string;
  list_cents: number;
  discount_cents: number;
  final_cents: number;
  promoId: string | null;
};

export type QuoteGift = {
  promoId: string;
  addonId: string;
  /** Gifted value, shown in results; the client pays 0 for it. */
  value_cents: number;
};

export type AppliedPromo = {
  promoId: string;
  kind: "price" | "gift";
  source: PromoSource;
  lineIds: readonly string[];
  discount_cents: number;
};

export type QuoteResult = {
  currency: string;
  lines: QuoteLine[];
  gifts: QuoteGift[];
  applied: AppliedPromo[];
  rejected: { promoId: string; reason: RejectReason }[];
  totals: {
    list_cents: number;
    discount_cents: number;
    /** Sum of final prices waived because it fell under the Stripe minimum. */
    waived_cents: number;
    charged_cents: number;
    fee_cents: number;
  };
  free_booking: boolean;
};

export type PromoStatus = "draft" | "archived" | "paused" | "scheduled" | "live" | "sold_out" | "expired";
