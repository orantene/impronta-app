/**
 * pos-types.ts — the prop vocabulary every Counter component shares.
 *
 * Everything here is presentational data plus callbacks. Nothing imports the
 * live-money `lib/pos/*` tree (`server-only`, owned by another agent's money
 * path) EXCEPT `lib/pos/modes.ts`, which is pure data with zero runtime
 * imports of its own (see that file's header) and is already a value import
 * in `PosFrame.tsx` for the same reason. Field names elsewhere track the
 * engine's real shapes closely enough — see `LineRow` in
 * `lib/pos/sale-rows.ts`, `StartCollectionResult` in `lib/pos/collection.ts`
 * — that wiring a future page to these props is a mapping exercise, not a
 * redesign.
 */

import type { POS_MODE_META } from "@/lib/pos/modes";

/**
 * The counter mode's own destination ids, derived from the single source
 * (`POS_MODE_META.counter.destinations` in `lib/pos/modes.ts`) instead of a
 * second hand-written union that would drift the moment that mode gains or
 * loses a screen. `import type` only — erased at compile time, no runtime
 * cost — keeping this module's own promise of zero runtime deps beyond React.
 *
 * `PosModeMeta.destinations` is deliberately typed `readonly string[]`
 * (every mode's rail shares one field, and their destination sets differ),
 * so the indexed-access type below resolves to `string` rather than the
 * three literal ids — narrower typing would require widening `modes.ts`'s
 * own type, which is out of this task's scope (see `pos-copy.ts` decisions).
 * `string` is still strictly better than a hand-copied literal union: it can
 * never go stale relative to the one array `PosFrame.tsx` actually renders.
 */
export type PosCounterDestinationId = (typeof POS_MODE_META)["counter"]["destinations"][number];

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

/**
 * A discriminated union, not one object with an optional field: an
 * unavailable method's panel renders `unavailableReason` in place of its own
 * UI, and a bare `available: false` with no reason produced an empty status
 * box — exactly where the honest sentence belongs. Making the reason
 * required on the `available: false` arm turns that into a compile error at
 * every call site instead of a blank box a person sees live.
 */
export type PosCollectionMethodState =
  | {
      readonly id: PosCollectionMethodId;
      readonly available: true;
    }
  | {
      readonly id: PosCollectionMethodId;
      readonly available: false;
      /** Shown in place of the method's own panel. Required, not optional. */
      readonly unavailableReason: string;
    };

// ── Refusals — every sentence the engine can hand back at the counter ──

/**
 * THE WHOLE VOCABULARY, AS A VALUE.
 *
 * It used to be a hand-written type union with a hand-written copy of that
 * union in `PosRefusalBanner.render.test.tsx`. Two lists, and the test's was
 * the one that decided how many reasons got proved: adding a reason to the
 * type and forgetting the test's array left the new sentence unrendered by
 * any check, in any language. The array is the source now and the type is
 * derived from it, so the test iterating this array cannot go stale.
 *
 * Every entry is a DIFFERENT sentence a cashier can act on. `lib/pos/
 * refusal-reason.ts` maps the engine's own reason strings onto these, and its
 * maps are typed `Record<EngineReason, PosRefusalReason>` so a reason the
 * engine gains and this list has not is a compile error rather than a blank
 * banner in front of a customer.
 */
export const POS_REFUSAL_REASONS = [
  "balanceChanged",
  "saleReloading",
  "needsCustomerName",
  "paymentDeclined",
  "paymentUnknown",
  "capacityGone",
  "bookingChanged",
  "tenderShort",
  "emptySale",
  "itemRefused",
  "discountRefused",
  "discountNeedsCustomer",
  "readerUnavailable",
  "pickupWindow",
  "wrongWorkspace",
  "notAllowed",
  "amountInvalid",
  "shiftAlreadyOpen",
  "shiftAlreadyClosed",
] as const;

export type PosRefusalReason = (typeof POS_REFUSAL_REASONS)[number];

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
