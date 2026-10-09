/**
 * lib/payments/link-checkout.ts
 *
 * A Stripe payment link's way to Checkout, and back out of it: open (or resume)
 * the one session its claim may have, and expire that session when the link is
 * cancelled. Split from `links.ts`, which keeps minting, loading, the mock
 * settle and cancel/reap; the settle side is `link-settlement.ts`.
 */

import { paymentLineItemName, paymentPortion } from "@/lib/payments/line-item-name";
import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { recordTalentPolicyAcceptance } from "@/lib/legal/acceptances";
import {
  bindCollectionReservation,
  CARD_RESERVATION_TTL_SECONDS,
  collectionMetadata,
  paymentRequestIdFromMetadata,
  RESERVATION_METADATA_KEY,
  STRIPE_CHECKOUT_MIN_TTL_SECONDS,
} from "@/lib/pos/collection-reservations";
import type { Admin } from "@/lib/pos/sale-rows";
import { bookingShellForOrder, type BookingShellContact } from "@/lib/orders/booking-shell";
import {
  createCheckoutSessionForTransaction,
  expireCheckoutSession,
  retrieveCheckoutSessionLink,
} from "@/lib/payments/stripe-checkout";
import { normalizeCurrencyCode } from "@/lib/inquiry/offer-currency";
import { resolvePayeeName } from "@/lib/payments/payee-name";
import { PAYMENT_LINK_METADATA_KEY } from "@/lib/payments/link-settlement";
import { resolveLinkPayoutReceiver } from "@/lib/payments/link-payout-receiver";
import { collectForOrderPrincipal } from "@/lib/orders/purchase-collect";
import type { SupabaseClient } from "@supabase/supabase-js";


export type OpenPaymentLinkCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: "not_found" | "expired" | "not_open" | "provider_unavailable" | "unavailable" | "start_failed" }
  /** TUL-284: the link is priced in a currency other than its order's. Nothing was opened or charged. */
  | { ok: false; reason: "currency_mismatch"; linkCurrency: string; orderCurrency: string };

export type OpenPaymentLinkCheckoutDeps = {
  createCheckoutSession?: typeof createCheckoutSessionForTransaction;
  retrieveCheckoutSession?: typeof retrieveCheckoutSessionLink;
  resolveReceiver?: typeof resolveLinkPayoutReceiver;
  resolveCollect?: typeof collectForOrderPrincipal;
  now?: () => number;
};

/** A money row past waiting: the customer goes to the "paid / processing" view. */
const SETTLED_TXN_STATUSES = new Set(["paid", "payout_pending", "payout_sent"]);
const REQUESTED_TXN_STATUSES = new Set(["payment_requested", "pending"]);

/**
 * The claim has to outlive the session by at least this, because Stripe refuses
 * an `expires_at` closer than 30 minutes and the session is stamped with the
 * CLAIM's expiry. The minute over the floor is the time between reading the
 * claim and Stripe receiving the create.
 */
const SESSION_FLOOR_MS = (STRIPE_CHECKOUT_MIN_TTL_SECONDS + 60) * 1000;

type LinkForCheckout = {
  id: string;
  tenant_id: string;
  order_id: string;
  code: string;
  amount_cents: number;
  currency: string | null;
  provider: string;
  status: string;
  expires_at: string;
  reservation_id: string | null;
  inquiry_id: string | null;
};

type ClaimRow = { id: string; state: string; transaction_id: string | null; expires_at: string };

/**
 * Send the customer of a Stripe payment link to Checkout, the way the till's
 * card collection does (`startCollection`), over the claim the link already
 * holds.
 *
 * THE DEFECT THIS CLOSES (audit 2026-09-25, #1 and #2). The pay page used to
 * create a Checkout session carrying only `{payment_link_code, order_id,
 * tenant_id}`: no money row, no `client_reference_id`, no `expires_at`. The
 * webhook could not route it, acknowledged it as `invalid`, and the customer
 * was charged while the link and the order stayed unpaid; the link lapsed after
 * 33 minutes while the session stayed payable for a day, so the same balance
 * could be requested and taken again.
 *
 * Now, in order:
 *   1. the link must be an open, unexpired Stripe link whose claim is live;
 *   2. a money row this claim ALREADY has is resumed, never doubled: an open
 *      session sends the customer back to it, a paid row to the paid view;
 *   3. the claim and the link are pushed out together when fewer than 31
 *      minutes remain, so Stripe will accept the claim's own expiry (once per
 *      session: a bound claim is never extended again);
 *   4. a `booking_transactions` row is opened (provider `stripe`, the claim and
 *      the link on its metadata) and bound to the claim;
 *   5. the session is created for that row: `client_reference_id` routes the
 *      webhook to `markPaid`, `expires_at` is the claim's, the key is
 *      `cs_txn_<row>`;
 *   6. the row moves to `payment_requested` with the provider request id, and
 *      the order to `pending_payment`.
 *
 * `markPaid` then does for the link exactly what it does for every card
 * payment: PaymentIntent id (so the refund route works), booking sync, receipt
 * email, transfers, order completion, claim settled, and finally the link paid.
 */
export async function openPaymentLinkCheckout(
  admin: Admin,
  input: { code: string; successUrl: string; cancelUrl: string; locale?: string | null },
  deps: OpenPaymentLinkCheckoutDeps = {},
): Promise<OpenPaymentLinkCheckoutResult> {
  return openOnce(admin, input, deps, 0);
}

async function openOnce(
  admin: Admin,
  input: { code: string; successUrl: string; cancelUrl: string; locale?: string | null },
  deps: OpenPaymentLinkCheckoutDeps,
  attempt: number,
): Promise<OpenPaymentLinkCheckoutResult> {
  const now = deps.now ?? Date.now;

  const { data: linkData, error: linkErr } = await admin
    .from("payment_links")
    .select("id, tenant_id, order_id, code, amount_cents, currency, provider, status, expires_at, reservation_id, inquiry_id")
    .eq("code", input.code)
    .maybeSingle();
  if (linkErr) {
    logServerError("payments.openPaymentLinkCheckout.link", linkErr);
    return { ok: false, reason: "unavailable" };
  }
  if (!linkData) return { ok: false, reason: "not_found" };
  const link = linkData as LinkForCheckout;
  if (link.provider !== "stripe") return { ok: false, reason: "provider_unavailable" };
  if (link.status !== "open") return { ok: false, reason: "not_open" };
  if (Date.parse(link.expires_at) <= now()) return { ok: false, reason: "expired" };
  if (!link.reservation_id) {
    logServerError("payments.openPaymentLinkCheckout.claim", `link ${link.id} holds no reservation`);
    return { ok: false, reason: "unavailable" };
  }

  const claim = await loadClaim(admin, link.reservation_id);
  if (claim === false) return { ok: false, reason: "unavailable" };
  if (!claim) {
    logServerError("payments.openPaymentLinkCheckout.claim", `link ${link.id}: reservation ${link.reservation_id} not found`);
    return { ok: false, reason: "unavailable" };
  }
  // Settled: the money landed and the webhook is closing the link. Released:
  // the balance went back, so this link can no longer take it.
  if (claim.state === "settled") return { ok: true, url: input.successUrl };
  if (claim.state !== "reserved") return { ok: false, reason: "expired" };

  const { data: orderData, error: orderErr } = await admin
    .from("orders")
    .select("id, tenant_id, currency, customer_id, policy_version_id, total_cents, status")
    .eq("id", link.order_id)
    .maybeSingle();
  if (orderErr) {
    logServerError("payments.openPaymentLinkCheckout.order", orderErr);
    return { ok: false, reason: "unavailable" };
  }
  const order = orderData as { id: string; tenant_id: string; currency: string; customer_id: string | null; policy_version_id?: string | null; total_cents?: number | null } | null;
  if (!order || order.tenant_id !== link.tenant_id) return { ok: false, reason: "not_found" };
  // A cancelled sale (the booking was cancelled) takes no more money, even
  // when its link was not taken down: the customer sees "no longer available".
  if ((order as { status?: string | null }).status === "cancelled") return { ok: false, reason: "not_open" };
  // A link in one currency paying an order priced in another would put an
  // amount across currencies. Refuse with a specific reason before any money
  // row or Stripe session exists (the charge guard would refuse it too, but
  // only as a generic "unavailable").
  const linkCurrency = normalizeCurrencyCode(link.currency);
  const orderCurrency = normalizeCurrencyCode(order.currency);
  if (linkCurrency && orderCurrency && linkCurrency !== orderCurrency) {
    return { ok: false, reason: "currency_mismatch", linkCurrency, orderCurrency };
  }
  const currency = link.currency || order.currency;
  const amountCents = Number(link.amount_cents);
  // The principal is what the order is credited. What Stripe charges is the principal plus the
  // pass_through client surcharge when armed: the same helper the direct checkout uses.
  const collectCents = await (deps.resolveCollect ?? collectForOrderPrincipal)(admin as unknown as SupabaseClient, {
    tenantId: link.tenant_id,
    orderId: order.id,
    orderCurrency: currency,
    principalCents: amountCents,
    subtotalCents: Number((order as { total_cents?: number | string | null }).total_cents ?? 0),
  });

  // ── 2. RESUME, DO NOT MINT A SECOND.
  let transactionId: string | null = claim.transaction_id;
  let bookingId: string | null = null;
  if (transactionId) {
    const { data: txnData, error: txnErr } = await admin
      .from("booking_transactions")
      .select("id, status, booking_id, metadata")
      .eq("id", transactionId)
      .maybeSingle();
    if (txnErr) {
      logServerError("payments.openPaymentLinkCheckout.txn", txnErr);
      return { ok: false, reason: "unavailable" };
    }
    const txn = txnData as { id: string; status: string; booking_id: string; metadata: unknown } | null;
    if (!txn) {
      logServerError("payments.openPaymentLinkCheckout.txn", `link ${link.id}: bound transaction ${transactionId} not found`);
      return { ok: false, reason: "unavailable" };
    }
    if (SETTLED_TXN_STATUSES.has(txn.status)) return { ok: true, url: input.successUrl };
    if (REQUESTED_TXN_STATUSES.has(txn.status)) {
      const requestId = paymentRequestIdFromMetadata(txn.metadata);
      if (!requestId) {
        // Cannot happen from this path (the id is written with the status).
        // Refuse rather than open a second session against the same claim.
        logServerError("payments.openPaymentLinkCheckout.resume", `transaction ${txn.id} is requested with no session id`);
        return { ok: false, reason: "unavailable" };
      }
      const session = await (deps.retrieveCheckoutSession ?? retrieveCheckoutSessionLink)(requestId);
      if (!session.ok) return { ok: false, reason: "unavailable" };
      if (session.status === "open" && session.url) return { ok: true, url: session.url };
      if (session.status === "complete") return { ok: true, url: input.successUrl };
      return { ok: false, reason: "expired" };
    }
    if (txn.status !== "draft") return { ok: false, reason: "expired" };
    // A `draft` row bound to the claim: the earlier attempt never reached
    // Stripe, or never recorded the session. Create again for the SAME row;
    // the key `cs_txn_<row>` answers with the same session if one exists.
    bookingId = txn.booking_id;
  }

  // ── 3. The claim must outlive the session Stripe will accept.
  let expiresAt = claim.expires_at;
  if (Date.parse(expiresAt) - now() < SESSION_FLOOR_MS) {
    const extended = await extendLinkClaim(admin, {
      linkId: link.id,
      claim,
      to: new Date(now() + CARD_RESERVATION_TTL_SECONDS * 1000).toISOString(),
      now,
    });
    if (!extended.ok) return { ok: false, reason: extended.reason === "gone" ? "expired" : "unavailable" };
    expiresAt = extended.expiresAt;
  }

  const contact = await orderContact(admin, order.customer_id);

  // ── 4. The money row, bound to the claim before any session exists.
  if (!transactionId) {
    const shell = await bookingShellForOrder(admin, {
      tenantId: link.tenant_id,
      orderId: order.id,
      currency,
      revenue: amountCents / 100,
      contact,
    });
    // A fresh attempt (no earlier row): nothing can have reached Stripe yet, so this is a clean "could not start".
    if (!shell.ok) return { ok: false, reason: "start_failed" };
    bookingId = shell.bookingId;

    // The seller's own connected account when the link's inquiry has exactly
    // one talent seller; null otherwise (the lane guard then keeps refusing).
    const receiver = await (deps.resolveReceiver ?? resolveLinkPayoutReceiver)(
      admin as unknown as SupabaseClient,
      { tenantId: link.tenant_id, inquiryId: link.inquiry_id },
    );

    const { data: inserted, error: insErr } = await admin
      .from("booking_transactions")
      .insert({
        booking_id: shell.bookingId,
        order_id: order.id,
        source_tenant_id: link.tenant_id,
        payer_email: contact?.email ?? null,
        gross_amount_cents: collectCents,
        platform_fee_basis_points: 0,
        platform_fee_cents: Math.max(0, collectCents - amountCents),
        net_amount_cents: amountCents,
        currency,
        provider: "stripe",
        status: "draft",
        checkout_type: "full",
        ...(receiver
          ? {
              payout_receiver_id: receiver.payoutAccountId,
              payout_receiver_kind: receiver.receiverKind,
              payout_receiver_display_name: receiver.displayName,
            }
          : {}),
        requested_at: new Date(now()).toISOString(),
        metadata: { [RESERVATION_METADATA_KEY]: claim.id, [PAYMENT_LINK_METADATA_KEY]: link.id },
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      logServerError("payments.openPaymentLinkCheckout.insert", insErr);
      return { ok: false, reason: "start_failed" };
    }
    transactionId = (inserted as { id: string }).id;

    const bound = await bindCollectionReservation(admin, { reservationId: claim.id, transactionId });
    if (!bound.ok) {
      // Nothing is payable yet, so the unbound row simply ends here.
      await admin.from("booking_transactions").update({ status: "cancelled" }).eq("id", transactionId).eq("status", "draft");
      // Two taps at once: the other one bound first. Its row is the payment;
      // go and resume it rather than show an error.
      if (bound.reason === "bound_elsewhere" && attempt === 0) return openOnce(admin, input, deps, 1);
      if (bound.reason === "not_reserved") return { ok: false, reason: "expired" };
      return { ok: false, reason: "unavailable" };
    }
  }
  if (!transactionId || !bookingId) return { ok: false, reason: "unavailable" };

  // ── 5. The session, for that row, dying with the claim.
  // Same service-role client; the POS Admin type is narrower than SupabaseClient.
  const payeeName = await resolvePayeeName(
    admin as unknown as Parameters<typeof resolvePayeeName>[0],
    link.tenant_id,
  );
  // The line item the payer reads: the service, and whether this is the deposit
  // or the full amount (never a bare "Payment").
  const { data: itemLines } = await admin
    .from("order_lines")
    .select("label")
    .eq("order_id", order.id)
    .limit(3);
  const labels = ((itemLines ?? []) as { label: string | null }[])
    .map((l) => (l.label ?? "").trim())
    .filter(Boolean);
  const lineItemName = paymentLineItemName({
    serviceName: labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0],
    portion: paymentPortion(amountCents, order.total_cents),
    locale: input.locale ?? null,
  });
  // A draft row opened before this amount was known (or before the surcharge was armed) must match
  // what the session will charge: gross = charge, net = principal, fee = the difference.
  const { error: amountErr } = await admin
    .from("booking_transactions")
    .update({ gross_amount_cents: collectCents, platform_fee_cents: Math.max(0, collectCents - amountCents), net_amount_cents: amountCents })
    .eq("id", transactionId)
    .eq("status", "draft");
  if (amountErr) {
    // Never create a session for a row whose amounts do not match what it will charge.
    logServerError("payments.openPaymentLinkCheckout.amounts", amountErr);
    // No session exists yet, so nothing can have been charged: say "could not start".
    return { ok: false, reason: "start_failed" };
  }
  const session = await (deps.createCheckoutSession ?? createCheckoutSessionForTransaction)({
    transactionId,
    amountCents: collectCents,
    currency,
    payerEmail: contact?.email ?? null,
    inquiryId: null,
    bookingId,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    description: lineItemName,
    payeeName,
    locale: input.locale ?? null,
    expiresAt,
    metadata: { payment_link_code: link.code },
  });
  // A DEFINITE refusal (our guard, Stripe rejecting the request) means no session exists: say it could not start.
  // Only an UNCERTAIN failure (timeout, no URL back) may have left a session or a charge: that stays "status unknown".
  if (!session.ok) return { ok: false, reason: session.uncertain === false ? "start_failed" : "unavailable" };
  // A Stripe link with no Stripe behind it: never hand the customer a fake
  // page. The row stays a bound draft, and the next attempt resumes it.
  if (session.mock) return { ok: false, reason: "provider_unavailable" };

  // ── 6. The row names the session in the same write that says "requested".
  const { error: requestedErr } = await admin
    .from("booking_transactions")
    .update({
      status: "payment_requested",
      metadata: {
        ...collectionMetadata({ reservationId: claim.id, paymentRequestId: session.sessionId }),
        [PAYMENT_LINK_METADATA_KEY]: link.id,
      },
    })
    .eq("id", transactionId)
    .eq("status", "draft");
  if (requestedErr) {
    logServerError("payments.openPaymentLinkCheckout.requested", requestedErr);
    return { ok: false, reason: "unavailable" };
  }
  const { error: statusErr } = await admin
    .from("orders")
    .update({ status: "pending_payment" })
    .eq("id", order.id)
    .in("status", ["draft", "pending_payment"]);
  if (statusErr) logServerError("payments.openPaymentLinkCheckout.orderStatus", statusErr);

  // Legal 2.2: the payer opened checkout under the talent policy version
  // already stamped on the order (none for orders without one). Best effort.
  await recordTalentPolicyAcceptance({
    talentPolicyVersionId: order.policy_version_id ?? null,
    context: "payment",
    contextId: bookingId,
    tenantId: link.tenant_id,
  });

  return { ok: true, url: session.url };
}

async function loadClaim(admin: Admin, reservationId: string): Promise<ClaimRow | null | false> {
  const { data, error } = await admin
    .from("order_collection_reservations")
    .select("id, state, transaction_id, expires_at")
    .eq("id", reservationId)
    .maybeSingle();
  if (error) {
    logServerError("payments.openPaymentLinkCheckout.loadClaim", error);
    return false;
  }
  return (data as ClaimRow | null) ?? null;
}

/**
 * Push the claim AND the link out to `to`, together.
 *
 * Compare-and-set on the claim's old expiry, then read back: a concurrent tap
 * that moved it first is as good as this one, and a claim the reaper released
 * in between is gone. The link follows the claim's instant exactly, because
 * `reap_payment_links` releases the claim when the LINK lapses: a link that
 * expired before its claim would hand the balance back under a live session.
 */
async function extendLinkClaim(
  admin: Admin,
  input: { linkId: string; claim: ClaimRow; to: string; now: () => number },
): Promise<{ ok: true; expiresAt: string } | { ok: false; reason: "gone" | "unavailable" }> {
  const { error } = await admin
    .from("order_collection_reservations")
    .update({ expires_at: input.to })
    .eq("id", input.claim.id)
    .eq("state", "reserved")
    .eq("expires_at", input.claim.expires_at);
  if (error) {
    logServerError("payments.openPaymentLinkCheckout.extendClaim", error);
    return { ok: false, reason: "unavailable" };
  }
  const reread = await loadClaim(admin, input.claim.id);
  if (reread === false) return { ok: false, reason: "unavailable" };
  if (!reread || reread.state !== "reserved") return { ok: false, reason: "gone" };
  if (Date.parse(reread.expires_at) - input.now() < SESSION_FLOOR_MS - 60_000) {
    logServerError(
      "payments.openPaymentLinkCheckout.extendClaim",
      `reservation ${input.claim.id} did not move (still ${reread.expires_at})`,
    );
    return { ok: false, reason: "unavailable" };
  }
  const { error: linkErr } = await admin
    .from("payment_links")
    .update({ expires_at: reread.expires_at })
    .eq("id", input.linkId)
    .eq("status", "open");
  if (linkErr) {
    logServerError("payments.openPaymentLinkCheckout.extendLink", linkErr);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, expiresAt: reread.expires_at };
}

/** Who the receipt goes to: the order's customer, when the order names one. */
async function orderContact(admin: Admin, customerId: string | null): Promise<BookingShellContact | undefined> {
  if (!customerId) return undefined;
  const { data, error } = await admin
    .from("customers")
    .select("email, phone_e164, display_name")
    .eq("id", customerId)
    .maybeSingle();
  if (error) {
    logServerError("payments.openPaymentLinkCheckout.contact", error);
    return undefined;
  }
  const row = data as { email: string | null; phone_e164: string | null; display_name: string | null } | null;
  if (!row) return undefined;
  return { email: row.email, phone: row.phone_e164, displayName: row.display_name };
}

/** Expire the Checkout session a link's claim is bound to, if it has one. */
export async function expireBoundSession(
  admin: Admin,
  reservationId: string,
  expire: typeof expireCheckoutSession,
): Promise<{ ok: true } | { ok: false; reason: "complete" | "unavailable" }> {
  const claim = await loadClaim(admin, reservationId);
  if (claim === false) return { ok: false, reason: "unavailable" };
  if (!claim?.transaction_id) return { ok: true };
  const { data, error } = await admin
    .from("booking_transactions")
    .select("status, metadata")
    .eq("id", claim.transaction_id)
    .maybeSingle();
  if (error) {
    logServerError("payments.cancelPaymentLink.txn", error);
    return { ok: false, reason: "unavailable" };
  }
  const txn = data as { status: string; metadata: unknown } | null;
  if (!txn) return { ok: true };
  if (SETTLED_TXN_STATUSES.has(txn.status)) return { ok: false, reason: "complete" };
  const sessionId = paymentRequestIdFromMetadata(txn.metadata);
  if (!sessionId || sessionId.startsWith("mock_")) return { ok: true };
  const expired = await expire(sessionId);
  return expired.ok ? { ok: true } : { ok: false, reason: expired.reason };
}

/**
 * Read-only twin of `expireBoundSession`: has the Checkout session this claim
 * is bound to already completed (money arriving, not yet settled in the
 * ledger)? Nothing is expired or written. null when it cannot be read.
 */
export async function boundSessionIsComplete(
  admin: Admin,
  reservationId: string,
  retrieve: (sessionId: string) => Promise<{ ok: true; status: string | null } | { ok: false }>,
): Promise<boolean | null> {
  const claim = await loadClaim(admin, reservationId);
  if (claim === false) return null;
  if (!claim?.transaction_id) return false;
  const { data, error } = await admin
    .from("booking_transactions")
    .select("status, metadata")
    .eq("id", claim.transaction_id)
    .maybeSingle();
  if (error) return null;
  const txn = data as { status: string; metadata: unknown } | null;
  if (!txn) return false;
  if (SETTLED_TXN_STATUSES.has(txn.status)) return true;
  const sessionId = paymentRequestIdFromMetadata(txn.metadata);
  if (!sessionId || sessionId.startsWith("mock_")) return false;
  const res = await retrieve(sessionId);
  return res.ok ? res.status === "complete" : null;
}
