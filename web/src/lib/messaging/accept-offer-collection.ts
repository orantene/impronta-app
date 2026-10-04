/**
 * What a client's offer accept collects. PURE, no I/O.
 *
 * No new money rules: this composes the two answers that already exist.
 *   1. The OFFER's own deposit term (deposit_amount_cents / deposit_pct), read
 *      exactly the way the client card and next step read it
 *      (`offerDepositCents` in messages-v5/client-thread-view.ts).
 *   2. Otherwise the talent's configured policy, through the same chain the
 *      instant-book path uses: `resolveOfferingPolicy` (offering value, then
 *      `selling_defaults`, then platform) and the `resolvePurchasePolicy`
 *      gate's collect rule (all lines `free` = take nothing; a deposit only
 *      when every line offers one, at the smallest pct; otherwise full).
 *
 * The visitor makes no payment choice on accept, so the intent is the one
 * instant book sends when the visitor does not pick "pay in person":
 * `instantBookPaymentChoice(false, reserveMode)`.
 */

import { offerDepositCents } from "@/lib/messages-v5/client-thread-view";
import { resolveOfferingPolicy } from "@/lib/talent/offering-policy-resolver";

export type AcceptPolicyLine = {
  /** `talent_offerings.reserve_mode` (raw row value). */
  reserveMode: string | null;
  /** `talent_offerings.deposit_pct` (raw row value). */
  depositPct: number | null;
  /** `talent_profiles.selling_defaults` of the offering's talent, `{}` when none set. */
  sellingDefaults: unknown;
};

export type AcceptCollectionInput = {
  totalCents: number;
  offerDepositPct: number | null;
  offerDepositCents: number | null;
  /** One entry per offer line that names a catalog offering. */
  lines: readonly AcceptPolicyLine[];
  /** Used when no line names an offering: the talent's own defaults. Null = none known. */
  talentDefaults: unknown;
};

export type AcceptCollection =
  | { collect: "none"; amountCents: 0; source: "offer" | "policy" | "zero_total" }
  | { collect: "full"; amountCents: number; source: "offer" | "policy" }
  | { collect: "deposit"; amountCents: number; depositPct: number | null; source: "offer" | "policy" };

export function planAcceptCollection(input: AcceptCollectionInput): AcceptCollection {
  const total = Math.max(0, Math.round(Number(input.totalCents) || 0));
  if (total <= 0) return { collect: "none", amountCents: 0, source: "zero_total" };

  // 1. The offer's own term wins: it is what the client was shown and accepted.
  const offerDeposit = offerDepositCents({ depositPct: input.offerDepositPct, depositCents: input.offerDepositCents, totalCents: total });
  if (offerDeposit != null && offerDeposit > 0) {
    if (offerDeposit >= total) return { collect: "full", amountCents: total, source: "offer" };
    return { collect: "deposit", amountCents: offerDeposit, depositPct: input.offerDepositPct ?? null, source: "offer" };
  }

  // 2. The talent's configured policy, offering by offering (same chain as checkout).
  const effective = (input.lines.length > 0
    ? input.lines.map((l) => resolveOfferingPolicy({ reserveMode: l.reserveMode, depositPct: l.depositPct, cancellationHours: null }, l.sellingDefaults ?? {}))
    : [resolveOfferingPolicy({ reserveMode: null, depositPct: null, cancellationHours: null }, input.talentDefaults ?? null)]);

  if (effective.every((p) => p.reserveMode === "free")) return { collect: "none", amountCents: 0, source: "policy" };
  const allDeposit = effective.every((p) => p.reserveMode === "deposit" && p.depositPct != null);
  if (allDeposit) {
    const pct = Math.min(...effective.map((p) => p.depositPct as number));
    const amount = Math.round((total * pct) / 100);
    if (amount > 0 && amount < total) return { collect: "deposit", amountCents: amount, depositPct: pct, source: "policy" };
  }
  return { collect: "full", amountCents: total, source: "policy" };
}

/** The money line on the pay card, in the offer's currency. */
export function acceptAmountLabel(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountCents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(amountCents / 100).toFixed(2)}`;
  }
}
