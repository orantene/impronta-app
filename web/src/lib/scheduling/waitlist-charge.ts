/**
 * waitlist-charge.ts — a waitlist place on a PAID session is bought, not given
 * (TUL-1552).
 *
 * `accept_session_waitlist_offer` reserves AND COMMITS the seat and marks the
 * entry accepted, with no order and no payment. That is right for a free class
 * and wrong for a paid one: staff "accept" handed out unpaid seats. This module
 * is the paid half, shared by both callers through `acceptWaitlistOffer`:
 *
 *   accept  → `createPurchase` (the same gate `bookSeat` uses): a
 *             pending_payment order holding the seat through the capacity
 *             engine on the pool's TTL, plus a Checkout link for the guest.
 *             The entry stays `offered`.
 *   paid    → the order-paid seam (`mintAndDeliverForPaidOrder`) calls
 *             `acceptWaitlistEntriesForPaidOrder`, which marks the entry
 *             accepted against the order's own committed seat. The seat was
 *             committed by `completeOrderForTransaction`; nothing here commits.
 *   lapsed  → the order sweep cancels the order and the capacity reaper frees
 *             the hold. The entry was never accepted, so nothing to undo.
 *
 * No migration: the link from order back to entry is the order's
 * `source_channel = 'waitlist'`, its session line and the buyer's e-mail, all of
 * which `createPurchase` already writes. Every read checks `error`, and every
 * unknown refuses: a paid place is never committed unpaid.
 *
 * The engines are injected (`WaitlistChargeDeps`) so this file stays importable
 * from the shared waitlist module without dragging the server-only purchase
 * pipeline into it, and so the routing is unit-testable.
 */
import { logServerError } from "@/lib/server/safe-error";
import type { PurchaseInput, PurchaseResult } from "@/lib/orders/purchase-types";
import type { CheckoutSessionInput, CheckoutSessionResult } from "@/lib/payments/stripe-checkout";
import { DEFAULT_TIER_KEY, tierReserveRequest } from "@/lib/sessions/tier-pools";

/**
 * Duck-typed like `StorefrontAdmin`: the real service-role client and the
 * storefront in-memory PostgREST both satisfy it.
 */
export type WaitlistChargeAdmin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * How long a waitlist order holds its seat: the 30-minute offer window plus
 * two minutes, so the Checkout link can close a minute BEFORE the hold and
 * still be 30 minutes away when Stripe creates it (its minimum).
 */
export const WAITLIST_HOLD_SECONDS = 32 * 60;
/** Checkout closes this long before the hold, so nobody pays for a released seat. */
export const WAITLIST_CHECKOUT_MARGIN_SECONDS = 60;
const STRIPE_MIN_CHECKOUT_SECONDS = 30 * 60;

export type WaitlistChargeDeps = {
  createPurchase: (admin: never, input: PurchaseInput) => Promise<PurchaseResult>;
  createCheckout: (input: CheckoutSessionInput) => Promise<CheckoutSessionResult>;
  /** Where the guest lands after paying. Null: the order is held, the link is not made. */
  origin: string | null;
  locale: "en" | "es" | null;
  /** `staff` from the desk, `guest` from the storefront (the D-10 sellable rule). */
  channel: "staff" | "guest";
};

export type WaitlistPaymentPending = {
  orderId: string;
  /** Stripe Checkout for this order. Null when it could not be opened yet; accepting again retries. */
  payUrl: string | null;
  /** When the held seat goes back to the pool if nobody pays. */
  holdExpiresAt: string | null;
  collectCents: number;
  currency: string;
};

export type WaitlistPriceRead =
  /** Not a paid live offer: the commit RPC decides, exactly as before. */
  | { kind: "rpc" }
  | { kind: "error" }
  /** Paid, but no single price can be named (e.g. priced only by tier): refuse, never commit. */
  | { kind: "ambiguous" }
  | {
      kind: "paid";
      entry: { id: string; customerName: string; customerEmail: string | null; partySize: number };
      session: { id: string; offeringId: string; title: string | null; startsAt: string; endsAt: string };
    };

type EntryRow = {
  id: string; tenant_id: string; session_id: string; status: string; offer_expires_at: string | null;
  customer_name: string | null; customer_email: string | null; party_size: number | null;
};
type SessionRow = { id: string; offering_id: string | null; status: string; title: string | null; starts_at: string; ends_at: string };

/**
 * Is this a live offer on a PAID session? Only then does the charge path run.
 * Anything the commit RPC already refuses (not offered, expired, wrong status)
 * is left to it so its refusal catalogue stays the one an operator reads.
 */
export async function readWaitlistPrice(
  admin: WaitlistChargeAdmin,
  input: { tenantId: string; entryId: string; expectedStatus?: string | null },
  now: Date = new Date(),
): Promise<WaitlistPriceRead> {
  const { data: entryData, error: entryErr } = await admin
    .from("session_waitlist_entries")
    .select("id, tenant_id, session_id, status, offer_expires_at, customer_name, customer_email, party_size")
    .eq("id", input.entryId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (entryErr) {
    logServerError("scheduling.waitlistCharge/entry", entryErr);
    return { kind: "error" };
  }
  const entry = entryData as EntryRow | null;
  if (!entry || entry.status !== "offered") return { kind: "rpc" };
  if (input.expectedStatus && entry.status !== input.expectedStatus) return { kind: "rpc" };
  const expires = entry.offer_expires_at ? Date.parse(entry.offer_expires_at) : NaN;
  if (!Number.isFinite(expires) || expires <= now.getTime()) return { kind: "rpc" };

  const { data: sessionData, error: sessionErr } = await admin
    .from("sessions")
    .select("id, offering_id, status, title, starts_at, ends_at")
    .eq("id", entry.session_id)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (sessionErr) {
    logServerError("scheduling.waitlistCharge/session", sessionErr);
    return { kind: "error" };
  }
  const session = sessionData as SessionRow | null;
  // No session, or a session that sells nothing (no offering): the RPC answers.
  if (!session || !session.offering_id) return { kind: "rpc" };

  const { data: offeringData, error: offeringErr } = await admin
    .from("talent_offerings")
    .select("id, amount_cents")
    .eq("id", session.offering_id)
    .maybeSingle();
  if (offeringErr) {
    logServerError("scheduling.waitlistCharge/offering", offeringErr);
    return { kind: "error" };
  }
  // A place is FREE only when its price is a definite 0: the base amount is 0
  // AND no tier/variant the guest could be placed on has a price. Anything
  // else is paid, and a paid place whose single price cannot be named (a base
  // of 0 or no base, with priced tiers) is refused: the entry carries no tier,
  // so charging the base would sell a priced tier for nothing.
  if (!offeringData) {
    logServerError("scheduling.waitlistCharge/offering", `session ${session.id}: offering ${session.offering_id} not found`);
    return { kind: "ambiguous" };
  }
  const { data: variantRows, error: variantErr } = await admin
    .from("talent_offering_variants")
    .select("id, amount_cents")
    .eq("offering_id", session.offering_id);
  if (variantErr) {
    logServerError("scheduling.waitlistCharge/variants", variantErr);
    return { kind: "error" };
  }
  const rawBase = (offeringData as { amount_cents?: number | null }).amount_cents;
  const base = typeof rawBase === "number" && Number.isFinite(rawBase) ? rawBase : null;
  const pricedTier = ((variantRows ?? []) as Array<{ amount_cents?: number | null }>).some(
    (v) => typeof v.amount_cents === "number" && v.amount_cents > 0,
  );
  if (base === 0 && !pricedTier) return { kind: "rpc" };
  if (base === null || base <= 0) {
    logServerError(
      "scheduling.waitlistCharge/price",
      `session ${session.id}: no single price to charge (base ${String(rawBase)}, priced tier ${String(pricedTier)}); refused`,
    );
    return { kind: "ambiguous" };
  }

  return {
    kind: "paid",
    entry: {
      id: entry.id,
      customerName: (entry.customer_name ?? "").trim(),
      customerEmail: entry.customer_email ? entry.customer_email.trim().toLowerCase() : null,
      partySize: typeof entry.party_size === "number" && entry.party_size > 0 ? entry.party_size : 1,
    },
    session: { id: session.id, offeringId: session.offering_id, title: session.title, startsAt: session.starts_at, endsAt: session.ends_at },
  };
}

export type WaitlistChargeResult =
  | { ok: true; payment: WaitlistPaymentPending; units: number }
  | { ok: false; reason: "no_pool" | "session_full" | "unavailable" };

/** Open the order that holds the seat, and the link that pays for it. */
export async function chargeForWaitlistPlace(
  admin: WaitlistChargeAdmin,
  input: { tenantId: string; priced: Extract<WaitlistPriceRead, { kind: "paid" }> },
  deps: WaitlistChargeDeps,
): Promise<WaitlistChargeResult> {
  const { entry, session } = input.priced;
  const { data: pool, error: poolErr } = await admin
    .from("capacity_pools")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("subject_kind", "session_tier")
    .eq("subject_id", session.id)
    .eq("pool_key", DEFAULT_TIER_KEY)
    .maybeSingle();
  if (poolErr) {
    logServerError("scheduling.waitlistCharge/pool", poolErr);
    return { ok: false, reason: "unavailable" };
  }
  const poolId = (pool as { id?: string } | null)?.id;
  if (!poolId) return { ok: false, reason: "no_pool" };
  const request = tierReserveRequest({ id: session.id, startsAt: session.startsAt, endsAt: session.endsAt }, poolId, entry.partySize);
  if (!request) return { ok: false, reason: "unavailable" };

  const result = await deps.createPurchase(admin as never, {
    tenantId: input.tenantId,
    // One order per entry: a second click (or a retried request) replays it.
    clientOrderKey: `waitlist:${entry.id}`,
    // The GUEST buys. The operator who clicked is not the payer.
    actorUserId: null,
    contact: { email: entry.customerEmail, displayName: entry.customerName || null },
    lines: [{ offeringId: session.offeringId, units: entry.partySize, sessionId: session.id }],
    paymentChoice: "full",
    sourceChannel: "waitlist",
    channel: deps.channel,
    capacity: [{
      offeringId: session.offeringId, poolId: request.poolId, startsAt: request.startsAt, endsAt: request.endsAt, units: request.units,
      // Held for the offer window, not the pool's 15 minutes (this leg only; the pool is untouched).
      ttlSeconds: WAITLIST_HOLD_SECONDS,
    }],
    locale: deps.locale,
  });
  if (!result.ok) {
    if (result.reason === "sold_out") return { ok: false, reason: "session_full" };
    logServerError("scheduling.waitlistCharge/purchase", `${result.reason}: ${result.error ?? ""}`);
    return { ok: false, reason: "unavailable" };
  }

  const { data: orderData, error: orderErr } = await admin
    .from("orders")
    .select("id, receipt_code, hold_expires_at")
    .eq("id", result.orderId)
    .maybeSingle();
  if (orderErr) logServerError("scheduling.waitlistCharge/order", orderErr);
  const order = (orderErr ? null : orderData) as { receipt_code?: string | null; hold_expires_at?: string | null } | null;

  // Checkout closes WAITLIST_CHECKOUT_MARGIN_SECONDS before the hold does, so
  // nobody can pay for a seat already back in the pool. Stripe refuses an
  // expiry under 30 minutes away; if that cannot be met (or the hold end is
  // unknown) no link is opened, and accepting again retries on the same order.
  const holdEndMs = order?.hold_expires_at ? Date.parse(order.hold_expires_at) : NaN;
  const checkoutEndMs = holdEndMs - WAITLIST_CHECKOUT_MARGIN_SECONDS * 1000;
  const checkoutExpiryOk = Number.isFinite(checkoutEndMs) && checkoutEndMs - Date.now() >= STRIPE_MIN_CHECKOUT_SECONDS * 1000;
  if (!checkoutExpiryOk) {
    logServerError("scheduling.waitlistCharge/checkoutExpiry", `order ${result.orderId}: hold ends ${String(order?.hold_expires_at)}; no link opened`);
  }

  let payUrl: string | null = null;
  if (checkoutExpiryOk && result.collectCents > 0 && result.transactionId && result.bookingId && deps.origin) {
    const receipt = typeof order?.receipt_code === "string" ? order.receipt_code : null;
    const checkout = await deps.createCheckout({
      expiresAt: new Date(checkoutEndMs).toISOString(),
      transactionId: result.transactionId,
      amountCents: result.collectCents,
      // The order's own currency, from the pipeline. Never guessed.
      currency: result.currency,
      payerEmail: entry.customerEmail,
      inquiryId: result.inquiryId,
      bookingId: result.bookingId,
      successUrl: receipt ? `${deps.origin}/r/${receipt}?paid=1` : `${deps.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${deps.origin}/`,
      description: session.title ?? "Class",
      locale: deps.locale,
    });
    if (checkout.ok) payUrl = checkout.url;
    else logServerError("scheduling.waitlistCharge/checkout", checkout.error);
  }

  return {
    ok: true,
    units: entry.partySize,
    payment: {
      orderId: result.orderId,
      payUrl,
      holdExpiresAt: order?.hold_expires_at ?? null,
      collectCents: result.collectCents,
      currency: result.currency,
    },
  };
}

/**
 * The order-paid seam: a paid waitlist order makes its entry `accepted`,
 * naming the order's own committed seat. Idempotent (only an `offered` entry
 * moves), and never commits anything itself. Best effort by contract: the
 * seam swallows errors, so every failure is logged with enough to fix by hand.
 */
export async function acceptWaitlistEntriesForPaidOrder(
  admin: WaitlistChargeAdmin,
  ctx: { orderId: string; tenantId: string; lines: ReadonlyArray<{ id: string; sessionId: string | null }> },
): Promise<void> {
  const sessionLines = ctx.lines.filter((l) => l.sessionId);
  if (sessionLines.length === 0) return;

  const { data: orderData, error: orderErr } = await admin
    .from("orders")
    .select("id, status, source_channel, customer_id")
    .eq("id", ctx.orderId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (orderErr) {
    logServerError("scheduling.waitlistPaid/order", orderErr);
    return;
  }
  const order = orderData as { status: string; source_channel: string | null; customer_id: string | null } | null;
  if (!order || order.source_channel !== "waitlist") return;
  if (order.status !== "paid" && order.status !== "fulfilled") return;
  if (!order.customer_id) {
    logServerError("scheduling.waitlistPaid/customer", `order ${ctx.orderId}: paid waitlist order has no customer`);
    return;
  }

  const { data: customer, error: customerErr } = await admin
    .from("customers")
    .select("id, email")
    .eq("id", order.customer_id)
    .maybeSingle();
  if (customerErr) {
    logServerError("scheduling.waitlistPaid/customer", customerErr);
    return;
  }
  const email = String((customer as { email?: string | null } | null)?.email ?? "").trim().toLowerCase();
  if (!email) return;

  for (const line of sessionLines) {
    const { data: allocs, error: allocErr } = await admin
      .from("capacity_allocations")
      .select("id, state")
      .eq("order_line_id", line.id)
      .eq("state", "committed");
    if (allocErr) {
      logServerError("scheduling.waitlistPaid/allocation", allocErr);
      continue;
    }
    const seat = ((allocs ?? []) as Array<{ id: string }>)[0]?.id;
    if (!seat) {
      logServerError("scheduling.waitlistPaid/allocation", `order ${ctx.orderId} line ${line.id}: paid but no committed seat`);
      continue;
    }
    const { data: entries, error: entriesErr } = await admin
      .from("session_waitlist_entries")
      .select("id, customer_email, status")
      .eq("tenant_id", ctx.tenantId)
      .eq("session_id", line.sessionId)
      .eq("status", "offered");
    if (entriesErr) {
      logServerError("scheduling.waitlistPaid/entries", entriesErr);
      continue;
    }
    const mine = ((entries ?? []) as Array<{ id: string; customer_email: string | null }>).find(
      (e) => String(e.customer_email ?? "").trim().toLowerCase() === email,
    );
    if (!mine) continue;
    const { error: updErr } = await admin
      .from("session_waitlist_entries")
      .update({ status: "accepted", decided_at: new Date().toISOString(), accepted_allocation_id: seat })
      .eq("id", mine.id)
      .eq("tenant_id", ctx.tenantId)
      .eq("status", "offered");
    if (updErr) logServerError("scheduling.waitlistPaid/accept", updErr);
  }
}
