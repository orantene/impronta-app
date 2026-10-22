/**
 * The pure money rules every price surface shares (TUL-1298). No server-only imports.
 *
 * The deposit is `amountToCollectCents`, the function `createPurchase` charges with: a deposit is a
 * PART payment, so it rounds DOWN. The booking sheet, the purchase rail and the emails call
 * these helpers instead of redoing `Math.round(total * pct / 100)`.
 */
import { amountToCollectCents } from "@/lib/orders/purchase-pricing";
import type { DueNow, DueNowInput } from "./types";

/** The deposit on a total. Same function the checkout charges with (floor). */
export function depositCents(totalCents: number, depositPct: number | null): number {
  return amountToCollectCents(totalCents, "deposit", depositPct);
}

/** Cents collected at confirm for a catalog reserve policy (full / deposit / free). Null total: nothing to show. */
export function collectNowCents(
  totalCents: number | null | undefined,
  reserveMode: "full" | "deposit" | "free" | null | undefined,
  depositPct: number | null | undefined,
): number | null {
  if (totalCents == null) return null;
  if (reserveMode === "free") return 0;
  if (reserveMode === "deposit") return depositCents(totalCents, typeof depositPct === "number" && Number.isFinite(depositPct) ? depositPct : null);
  return totalCents;
}

/** The unit price a line is charged at: the tier's own price, else the offering's (what `pricePurchase` does). */
export function effectiveUnitCents(
  variantAmountCents: number | null | undefined,
  offeringAmountCents: number | null | undefined,
): number | null {
  if (variantAmountCents != null) return variantAmountCents;
  return offeringAmountCents ?? null;
}

/** What is still owed once `principalCents` is credited. Never negative. */
export function balanceCents(totalCents: number, principalCents: number): number {
  return Math.max(0, totalCents - principalCents);
}

/** Promo-adjusted total -> principal -> balance. Pure; the card fee is added by the server on top. */
export function priceDueNow(input: DueNowInput): DueNow {
  const subtotalCents = input.subtotalCents;
  const discountCents = Math.min(subtotalCents, Math.max(0, input.discountCents));
  const totalCents = subtotalCents - discountCents;
  // `collect` is already "none" for pay-in-person (the policy derives it); it is passed through untouched.
  const principalCents = amountToCollectCents(totalCents, input.collect, input.depositPct);
  return { subtotalCents, discountCents, totalCents, principalCents, balanceCents: balanceCents(totalCents, principalCents) };
}

/**
 * The service money a paid transaction credited to its order. A pass-through order row stores the
 * principal in `net_amount_cents` and the card fee in `platform_fee_cents`, so its balance is
 * total - net, NOT total - gross (TUL-1305). A fee-NETTED row (`platform_fee_basis_points` > 0, inquiry
 * lane) keeps net = gross - commission, so its principal is the gross. Anything inconsistent falls
 * back to the gross, which is what these emails showed before.
 */
export function transactionPrincipalCents(t: { grossCents: number; netCents: number; feeNetted: boolean }): number {
  if (t.feeNetted) return t.grossCents;
  return t.netCents > 0 && t.netCents <= t.grossCents ? t.netCents : t.grossCents;
}
