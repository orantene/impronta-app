/**
 * pos-types.ts — the prop vocabulary every Counter component shares.
 *
 * Everything here is presentational data plus callbacks. Nothing imports
 * `lib/pos/*` (that tree is `server-only` and owned by another agent's money
 * path); field names track the engine's real shapes closely enough — see
 * `LineRow` in `lib/pos/sale-rows.ts`, `StartCollectionResult` in
 * `lib/pos/collection.ts` — that wiring a future page to these props is a
 * mapping exercise, not a redesign.
 */

/** Mirrors `PosMode` from `lib/pos/modes.ts` — kept a plain string union here
 * rather than importing the value, so this module stays free of any runtime
 * dependency beyond React. Components that DO need the real mode metadata
 * (the rail) import `PosMode` as a type from `lib/pos/modes` directly. */
export type PosCounterDestinationId = "sell" | "orders" | "shifts";

// ── Catalog / sell surface ───────────────────────────────────────────

export type PosVariantChip = {
  readonly id: string;
  readonly label: string;
  /** Cents added to the base price when this variant is chosen. */
  readonly deltaCents: number;
  readonly selected: boolean;
  readonly disabled?: boolean;
};

export type PosProductTile = {
  readonly id: string;
  readonly title: string;
  /** Base price in integer cents. */
  readonly amountCents: number;
  readonly currency: string;
  readonly categoryId: string;
  readonly favourite?: boolean;
  readonly variants?: readonly PosVariantChip[];
  /** Missing image is fine — the tile renders on name + price alone. */
  readonly imageUrl?: string | null;
};

export type PosCategoryTab = {
  readonly id: string;
  readonly label: string;
};

// ── Basket ────────────────────────────────────────────────────────────

export type PosBasketLine = {
  readonly id: string;
  readonly label: string;
  /** Whole units, or a fractional quantity for a measured line (kg, L). */
  readonly units: number;
  readonly unitCents: number;
  /** Extras charged once for the line — mirrors `order_lines` semantics. */
  readonly addonCents?: number;
  readonly variantLabel?: string | null;
  readonly sessionLabel?: string | null;
  readonly notes?: string | null;
  /** A line already sent to preparation cannot have its quantity changed. */
  readonly locked?: boolean;
};

export type PosBasketTotals = {
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
};

// ── Customer ──────────────────────────────────────────────────────────

export type PosAttachedCustomer = {
  readonly id: string;
  readonly displayName: string;
  readonly email?: string | null;
  readonly phone?: string | null;
};

// ── Collection ────────────────────────────────────────────────────────

export type PosCollectionMethodId = "cash" | "card" | "link" | "pass";

export type PosCollectionMethodState = {
  readonly id: PosCollectionMethodId;
  readonly available: boolean;
  /** Shown in place of the method's own panel when `available` is false. */
  readonly unavailableReason?: string;
};

// ── Refusals — the five sentences the engine can hand back at the counter ──

export type PosRefusalReason =
  | "balanceChanged"
  | "saleReloading"
  | "needsCustomerName"
  | "paymentDeclined"
  | "paymentUnknown";

// ── Held sales ────────────────────────────────────────────────────────

export type PosHeldSale = {
  readonly orderId: string;
  readonly label: string;
  readonly totalCents: number;
  readonly currency: string;
  readonly heldAt: string;
};

// ── Shift ─────────────────────────────────────────────────────────────

export type PosShiftSummary = {
  readonly id: string;
  readonly openingCashCents: number;
  readonly countedCashCents?: number | null;
  readonly expectedCashCents?: number | null;
  readonly openedAt: string;
};
