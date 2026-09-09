/**
 * Entitlement credit ledger — issued → reserved → consumed | restored | expired.
 */

export type CreditState = "issued" | "reserved" | "consumed" | "restored" | "expired";

export type CreditTransition =
  | { ok: true; next: CreditState }
  | { ok: false; error: string };

const ALLOWED: Record<CreditState, readonly CreditState[]> = {
  issued: ["reserved", "consumed", "expired"],
  reserved: ["consumed", "restored", "expired"],
  consumed: [],
  restored: ["issued", "reserved", "expired"],
  expired: [],
};

export function transitionCredit(from: CreditState, to: CreditState): CreditTransition {
  if (!(ALLOWED[from] ?? []).includes(to)) {
    return { ok: false, error: `Cannot move a credit from ${from} to ${to}.` };
  }
  return { ok: true, next: to };
}

/** A booking may reserve an issued (or restored) credit without consuming it yet. */
export function reserveCreditForBooking(state: CreditState): CreditTransition {
  return transitionCredit(state, "reserved");
}
