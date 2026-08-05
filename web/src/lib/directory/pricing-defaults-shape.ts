/**
 * Tenant "starting price" defaults — pure shape + parse/serialise.
 *
 * Directive-free (no `server-only`, no `use server`) so the admin card, the
 * server action and the directory resolver can all share it. See the
 * page-roles-shape.ts precedent for why this lives apart from the I/O.
 *
 * Stored under the `directoryPricingDefaults` namespace of `agencies.settings`.
 *
 * WHY THIS EXISTS
 * Cards show "From $X" from the talent's own published offering. On a fresh
 * roster almost nobody has entered pricing yet (Impronta: 3 of 43), so the
 * single strongest signal a client uses to choose is missing from ~95% of the
 * grid. An agency already knows its standard day rate per category; this lets
 * them state it once instead of editing 40 profiles.
 *
 * WHAT IT IS NOT
 * It is not a guess. Every number here is typed by an agency operator who
 * stands behind it, and it is never used to override a talent who has priced
 * themselves — or who deliberately chose "quote on request".
 */

export type TenantPricingDefaults = {
  /** Master switch. Off → the tenant never shows a default price. */
  enabled: boolean;
  /** ISO currency for every amount in this namespace. */
  currency: string;
  /** Fallback for any talent whose type has no specific default. */
  globalFromCents: number | null;
  /** Per primary-talent-type-slug overrides, e.g. { "fashion-model": 15000 }. */
  byTypeSlug: Record<string, number>;
};

export const EMPTY_PRICING_DEFAULTS: TenantPricingDefaults = {
  enabled: false,
  currency: "USD",
  globalFromCents: null,
  byTypeSlug: {},
};

/** Guard rail for operator input — a card price of $0 or $1M is a typo. */
export const MIN_DEFAULT_PRICE_CENTS = 100;
export const MAX_DEFAULT_PRICE_CENTS = 100_000_00;

function cleanAmount(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n);
  if (cents < MIN_DEFAULT_PRICE_CENTS || cents > MAX_DEFAULT_PRICE_CENTS) {
    return null;
  }
  return cents;
}

export function parsePricingDefaults(settings: unknown): TenantPricingDefaults {
  if (typeof settings !== "object" || settings === null) {
    return EMPTY_PRICING_DEFAULTS;
  }
  const ns = (settings as Record<string, unknown>).directoryPricingDefaults;
  if (typeof ns !== "object" || ns === null) return EMPTY_PRICING_DEFAULTS;

  const raw = ns as Record<string, unknown>;
  const byTypeSlug: Record<string, number> = {};
  if (typeof raw.byTypeSlug === "object" && raw.byTypeSlug !== null) {
    for (const [slug, value] of Object.entries(
      raw.byTypeSlug as Record<string, unknown>,
    )) {
      const cents = cleanAmount(value);
      if (slug.trim() && cents !== null) byTypeSlug[slug.trim()] = cents;
    }
  }

  const currency =
    typeof raw.currency === "string" && raw.currency.trim().length === 3
      ? raw.currency.trim().toUpperCase()
      : "USD";

  return {
    enabled: raw.enabled === true,
    currency,
    globalFromCents: cleanAmount(raw.globalFromCents),
    byTypeSlug,
  };
}

/** Merge into the existing settings bag without clobbering sibling namespaces. */
export function pricingDefaultsToSettings(
  settings: unknown,
  next: TenantPricingDefaults,
): Record<string, unknown> {
  const base =
    typeof settings === "object" && settings !== null
      ? (settings as Record<string, unknown>)
      : {};
  return { ...base, directoryPricingDefaults: next };
}

/**
 * The cascade, as a pure function so the precedence rules are unit-testable
 * without a database.
 *
 * `hasDeliberateQuoteOnly` is the consent gate: a talent who published a
 * service and chose "quote on request" has made a pricing statement, and a
 * tenant or platform default must never speak over it. Only a talent with no
 * pricing signal at all inherits a default.
 */
export type PriceSource = "talent" | "tenant_default" | "platform_default";

export type ResolvedStartingPrice = {
  amountCents: number;
  currency: string;
  source: PriceSource;
};

export function resolveStartingPrice(input: {
  ownPrice: { amountCents: number; currency: string } | null;
  hasDeliberateQuoteOnly: boolean;
  primaryTypeSlug: string | null;
  tenantDefaults: TenantPricingDefaults;
  platformFromCents: number | null;
  platformCurrency: string;
}): ResolvedStartingPrice | null {
  // 1. The talent's own published price always wins.
  if (input.ownPrice) {
    return { ...input.ownPrice, source: "talent" };
  }
  // 2. Their explicit "ask me" is a decision, not a gap.
  if (input.hasDeliberateQuoteOnly) return null;

  // 3. Tenant default — per type first, then the tenant-wide floor.
  const { tenantDefaults: td } = input;
  if (td.enabled) {
    const byType =
      input.primaryTypeSlug != null
        ? td.byTypeSlug[input.primaryTypeSlug]
        : undefined;
    const cents = byType ?? td.globalFromCents;
    if (typeof cents === "number" && cents > 0) {
      return { amountCents: cents, currency: td.currency, source: "tenant_default" };
    }
  }

  // 4. Platform floor. Null unless a super_admin set one on purpose.
  if (input.platformFromCents != null && input.platformFromCents > 0) {
    return {
      amountCents: input.platformFromCents,
      currency: input.platformCurrency,
      source: "platform_default",
    };
  }
  return null;
}

/**
 * Result/option types for the admin actions.
 *
 * These live HERE and not in the `"use server"` action file on purpose: a
 * type re-export from a server-action module is a known runtime-500 footgun in
 * this codebase (a `"use server"` file may only export async functions).
 */
export type TalentTypeOption = {
  slug: string;
  label: string;
  talentCount: number;
};

export type UpdatePricingDefaultsResult =
  | { ok: true }
  | { ok: false; error: string };

export type LoadPricingDefaultsResult =
  | { ok: true; data: TenantPricingDefaults; talentTypes: TalentTypeOption[] }
  | { ok: false; error: string };

/** One roster row in the bulk rate editor. */
export type RosterRateRow = {
  talentProfileId: string;
  displayName: string;
  roleLabel: string | null;
  /** Current headline amount in cents, or null when quote-only / unpriced. */
  headlineCents: number | null;
  currency: string;
  /** True when the talent deliberately publishes "quote on request". */
  quoteOnly: boolean;
  /**
   * Title of the catalog row a save would edit (featured-first, else the
   * cheapest priced public row) — shown so the operator knows WHICH service
   * the number lands on. Null when the talent has no editable priced row.
   */
  targetTitle: string | null;
  /**
   * True when the talent has NO public catalog at all: saving a number here
   * creates a standard "Day rate" service instead of silently doing nothing.
   */
  willCreate: boolean;
};

export type LoadRosterRatesResult =
  | { ok: true; rows: RosterRateRow[]; currency: string }
  | { ok: false; error: string };

export type SaveRosterRatesResult =
  | { ok: true; updated: number; created: number }
  | { ok: false; error: string };
