/**
 * off-platform.ts — the tenant that cannot accept cards, and the payout
 * coherence that has to follow it.
 *
 * A parrilla in Buenos Aires takes cash. A laundry takes a transfer. Neither
 * has a Stripe account, and neither should be blocked from running a menu
 * because of it. The switch is a tenant setting; the hard part is downstream.
 *
 * WHY THE PAYOUT GATE IS THE WHOLE POINT
 * --------------------------------------
 * The commission snapshot ALREADY models off-platform money: `payment_method`
 * and `off_platform_reason` are columns, and the persist RPC accrues the
 * platform fee into `platform_commission_movements` when the method is one of
 * cash/wire/venue_paid/crypto/other on a workspace booking. The receivable is
 * not something this file invents — it exists and it works.
 *
 * What does NOT exist is the other half. `transfers.ts` fans out money the
 * platform ALREADY COLLECTED on its own account, and it has never read
 * `payment_method`. So a cash sale writes a correct snapshot, the sweep loads
 * it, and the platform wires real money to the talent for a charge it never
 * took. The fee is accrued as owed AND the payout is paid out: the tenant ends
 * up holding the cash and the platform funds the split.
 *
 * So the rule is a pair, and neither half is safe alone:
 *   money in  → accrue the fee as a receivable (already true, via the RPC)
 *   money out → NO payout leg, because there is no collected money to fan out
 *
 * A LEG IS SKIPPED, NOT FAILED. An off-platform booking has no payout by
 * design. It must not reach the `transfers.no_snapshot` alarm, which means
 * "the talent will silently never be paid" and asks for a manual backfill —
 * a true statement about a card booking and a false alarm about a cash one.
 * Alarms that fire on correct behaviour stop being read.
 */

/**
 * Payment methods that settle OUTSIDE the platform account.
 *
 * Kept identical to the `IN (...)` list in the snapshot-persist RPC
 * (20260708161912_fix_snapshot_persist_rpc_extended_lanes.sql). If the two ever
 * disagree, a method accrues a receivable without suppressing its payout — the
 * exact double-spend this module exists to prevent — so `offPlatform.test.ts`
 * pins the list against the migration text.
 */
export const OFF_PLATFORM_PAYMENT_METHODS = [
  "cash",
  "wire",
  "venue_paid",
  "crypto",
  "other",
] as const;

export type OffPlatformPaymentMethod = (typeof OFF_PLATFORM_PAYMENT_METHODS)[number];

/**
 * Did this money land somewhere other than the platform account?
 *
 * Deliberately NOT a default-true guess. A null/unknown method is treated as
 * on-platform, because the failure directions are not symmetric: wrongly
 * skipping a payout means a talent is not paid and someone complains, while
 * wrongly paying one means the platform sends money it never collected and
 * nobody notices. Only a method we recognise suppresses a payout.
 */
export function isOffPlatformPaymentMethod(method: unknown): method is OffPlatformPaymentMethod {
  return (
    typeof method === "string" &&
    (OFF_PLATFORM_PAYMENT_METHODS as readonly string[]).includes(method)
  );
}

/** How a workspace takes money. `card` is the platform default. */
export type TenantPaymentMode = "card" | "off_platform";

export type OffPlatformSettings = {
  mode: TenantPaymentMode;
  /**
   * The method recorded on the snapshot, which is what drives the accrual.
   * Only meaningful when `mode` is "off_platform".
   */
  method: OffPlatformPaymentMethod;
};

export const DEFAULT_PAYMENT_SETTINGS: OffPlatformSettings = {
  mode: "card",
  method: "cash",
};

/**
 * Read the switch from raw `agencies.settings`.
 *
 * JSONB at `settings.payments`, no migration — the shipped precedent of
 * `settings.words`, `settings.appointments` and `settings.fulfilment_pipeline`.
 * An operator-editable bundle with a product default is settings, not schema.
 *
 * Anything unrecognised resolves to the card default. A malformed settings blob
 * must not silently turn card payments off for a tenant that sells on cards.
 */
export function resolvePaymentSettings(settings: unknown): OffPlatformSettings {
  const bag =
    settings && typeof settings === "object"
      ? ((settings as Record<string, unknown>).payments as Record<string, unknown> | undefined)
      : undefined;
  if (!bag || typeof bag !== "object") return DEFAULT_PAYMENT_SETTINGS;

  if (bag.mode !== "off_platform") return DEFAULT_PAYMENT_SETTINGS;

  return {
    mode: "off_platform",
    method: isOffPlatformPaymentMethod(bag.method) ? bag.method : DEFAULT_PAYMENT_SETTINGS.method,
  };
}

/** Can this workspace put a card field in front of a customer? */
export function acceptsCardPayment(settings: unknown): boolean {
  return resolvePaymentSettings(settings).mode === "card";
}
