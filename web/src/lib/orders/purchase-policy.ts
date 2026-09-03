/**
 * The purchase policy gate — pure, no I/O.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the client declares INTENT, never
 * POLICY. Everything about what a purchase is allowed to do is derived here,
 * server-side, from the offering rows. Nothing a caller sends about
 * `reserve_mode`, `deposit_pct`, `allow_pay_in_person`, `require_account_to_book`
 * or `cancellation_hours` is trusted, or even accepted.
 *
 * This is the whole indictment of `menu-order-engine.ts` made structural: it
 * renders offerings whose policy fields it never reads, so a menu order ignores
 * the deposit the owner configured and the "account required" they ticked. The
 * Front Door Manager's Sheet reads the same five fields to decide what to SHOW,
 * and that read is a display concern and never a gate — a guest can edit
 * anything that reaches a server action, so if the pipeline trusted a
 * client-declared payment mode then "pay in person" would be a free lunch on
 * every offering that forbids it.
 *
 * Agreed with the Front Door Manager and ruled by the Platform Features
 * Director, 2026-09-02. See docs/plans/orders-checkout-plan.md §3.
 */

import type { OfferingReserveMode } from "@/lib/talent/offerings-types";

/** The one field where the client is allowed an opinion. */
export type PaymentChoice = "full" | "deposit" | "in_person";
export const PAYMENT_CHOICES: readonly PaymentChoice[] = ["full", "deposit", "in_person"];

/**
 * The policy of ONE offering, as read from its row. This is the only shape the
 * gate accepts — a caller cannot construct it from request input because every
 * field has to come from the database.
 */
export type OfferingPolicy = {
  offeringId: string;
  /** `published` is the only sellable state. */
  status: "draft" | "published" | "archived";
  /** The tenant that owns the offering. Cross-tenant lines are refused. */
  tenantId: string;
  reserveMode: OfferingReserveMode;
  /** 1..99, or null when no deposit is configured. */
  depositPct: number | null;
  allowPayInPerson: boolean;
  requireAccountToBook: boolean;
  cancellationHours: number | null;
};

export type PurchaseIntent = {
  /** Per CART, not per click. The idempotency anchor. */
  clientOrderKey: string;
  tenantId: string;
  /** Null for a guest. Never invented. */
  actorUserId: string | null;
  paymentChoice: PaymentChoice;
  lines: Array<{ offeringId: string; units: number }>;
};

export type PolicyRefusal = {
  ok: false;
  /** Stable strings — callers match on these, never on message text. */
  reason:
    | "empty_order"
    | "unknown_offering"
    | "offering_not_published"
    | "cross_tenant_line"
    | "account_required"
    | "pay_in_person_not_allowed"
    | "deposit_not_offered"
    | "invalid_units"
    | "invalid_payment_choice";
  /** Which offering refused, when it was one line's fault. */
  offeringId?: string;
  message: string;
};

export type ResolvedPurchasePolicy = {
  ok: true;
  /**
   * What the pipeline will actually collect. Derived, never sent.
   *  - `full`      charge the whole total now
   *  - `deposit`   charge `depositPct` of the total now, balance later
   *  - `none`      reserve with no card (free reserve, or pay in person)
   */
  collect: "full" | "deposit" | "none";
  /** Set only when `collect === "deposit"`. The smallest pct across the lines. */
  depositPct: number | null;
  /** True when the client chose to settle in person and every line allows it. */
  payInPerson: boolean;
  /** The strictest cancellation window across the lines, or null if none set. */
  cancellationHours: number | null;
};

export type PolicyResult = ResolvedPurchasePolicy | PolicyRefusal;

const MAX_DISTINCT_LINES = 20;

/**
 * Resolve what this purchase may do.
 *
 * `policies` must be keyed by offering id and must have been loaded from the
 * database in the same request. A missing entry is a refusal, never a default:
 * defaulting an unknown offering to a permissive policy is how a deleted or
 * another tenant's offering becomes purchasable.
 */
export function resolvePurchasePolicy(
  intent: PurchaseIntent,
  policies: ReadonlyMap<string, OfferingPolicy>,
): PolicyResult {
  if (!PAYMENT_CHOICES.includes(intent.paymentChoice)) {
    return {
      ok: false,
      reason: "invalid_payment_choice",
      message: "That payment option is not available.",
    };
  }

  if (intent.lines.length === 0) {
    return { ok: false, reason: "empty_order", message: "Your order is empty." };
  }
  if (intent.lines.length > MAX_DISTINCT_LINES) {
    return {
      ok: false,
      reason: "invalid_units",
      message: `An order can hold at most ${MAX_DISTINCT_LINES} different items.`,
    };
  }

  const resolved: OfferingPolicy[] = [];

  for (const line of intent.lines) {
    if (!Number.isFinite(line.units) || line.units <= 0 || line.units > 999) {
      return {
        ok: false,
        reason: "invalid_units",
        offeringId: line.offeringId,
        message: "That quantity is not available.",
      };
    }

    const policy = policies.get(line.offeringId);
    if (!policy) {
      // NOT a default. An offering we could not load is one we must not sell.
      return {
        ok: false,
        reason: "unknown_offering",
        offeringId: line.offeringId,
        message: "That item is no longer available.",
      };
    }
    if (policy.status !== "published") {
      return {
        ok: false,
        reason: "offering_not_published",
        offeringId: line.offeringId,
        message: "That item is no longer available.",
      };
    }
    if (policy.tenantId !== intent.tenantId) {
      // Belongs to another workspace. Refuse rather than book it here, or one
      // tenant's storefront sells another tenant's inventory.
      return {
        ok: false,
        reason: "cross_tenant_line",
        offeringId: line.offeringId,
        message: "That item is no longer available.",
      };
    }

    resolved.push(policy);
  }

  // ── Gates, evaluated across EVERY line. One line that forbids something
  //    forbids it for the whole order: a cart is charged once, so it cannot be
  //    half pay-in-person.
  const accountRequired = resolved.find((p) => p.requireAccountToBook);
  if (accountRequired && !intent.actorUserId) {
    return {
      ok: false,
      reason: "account_required",
      offeringId: accountRequired.offeringId,
      message: "Please sign in to book this.",
    };
  }

  if (intent.paymentChoice === "in_person") {
    const forbids = resolved.find((p) => !p.allowPayInPerson);
    if (forbids) {
      return {
        ok: false,
        reason: "pay_in_person_not_allowed",
        offeringId: forbids.offeringId,
        message: "This one has to be paid online.",
      };
    }
    return {
      ok: true,
      collect: "none",
      depositPct: null,
      payInPerson: true,
      cancellationHours: strictestCancellation(resolved),
    };
  }

  if (intent.paymentChoice === "deposit") {
    // A deposit is only offered when EVERY line offers one. Charging a deposit
    // against a line configured for full payment would under-collect and leave
    // a balance nobody agreed to.
    const noDeposit = resolved.find((p) => p.reserveMode !== "deposit" || !p.depositPct);
    if (noDeposit) {
      return {
        ok: false,
        reason: "deposit_not_offered",
        offeringId: noDeposit.offeringId,
        message: "This one is paid in full at booking.",
      };
    }
    const pcts = resolved.map((p) => p.depositPct as number);
    return {
      ok: true,
      collect: "deposit",
      // The SMALLEST configured percentage. Taking the largest would charge a
      // client more up front than one of the offerings asked for.
      depositPct: Math.min(...pcts),
      payInPerson: false,
      cancellationHours: strictestCancellation(resolved),
    };
  }

  // paymentChoice === "full".
  //
  // `reserve_mode: 'free'` means the OWNER chose to take no money at booking.
  // A client asking to pay in full does not override that — the offering is not
  // configured to be charged, and charging it would invent a price the owner
  // never agreed to collect up front.
  const allFree = resolved.every((p) => p.reserveMode === "free");
  return {
    ok: true,
    collect: allFree ? "none" : "full",
    depositPct: null,
    payInPerson: false,
    cancellationHours: strictestCancellation(resolved),
  };
}

/** The tightest window wins: a cart is cancelled as a whole. */
function strictestCancellation(policies: readonly OfferingPolicy[]): number | null {
  const hours = policies
    .map((p) => p.cancellationHours)
    .filter((h): h is number => typeof h === "number" && Number.isFinite(h) && h >= 0);
  return hours.length > 0 ? Math.max(...hours) : null;
}
