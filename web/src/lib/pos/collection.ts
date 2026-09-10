import "server-only";

/**
 * POS collection and close commands (L53).
 *
 * Card collection uses the small Stripe adapter at the existing Checkout
 * boundary. Cash is recorded via `settleAtDoor`. Preparation tickets are
 * owned by `lib/preparation/tickets.ts`.
 */

import { logServerError } from "@/lib/server/safe-error";
import { settleAtDoor } from "@/lib/orders/settle-at-door";
import { bookingShellForOrder } from "@/lib/orders/booking-shell";
import { completeZeroTotalOrder, type OnOrderPaid } from "@/lib/orders/complete-order";
import { stripeCollectionAdapter } from "@/lib/payments/stripe-collection";
import { reportTerminalAvailability } from "@/lib/payments/terminal-availability";
import type { EnsureCustomerResult } from "@/lib/customers/ensure-customer";
import { identityVerdict, type IdentityLine } from "@/lib/orders/identity-requirement";
import { releaseCapacity } from "@/lib/capacity";
import {
  submitOrderToPreparation,
  type PrepDestination,
  type SubmitPrepResult,
} from "@/lib/preparation/tickets";
import { currentShift } from "./shift";
import { holdDraftOrderCapacity } from "./hold-capacity";
import type { PosBuyerContact, PosCollectionMethod } from "./commands";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

const COLLECTABLE = new Set(["draft", "pending_payment"]);

async function collectedPaidCents(
  admin: Admin,
  orderId: string,
): Promise<{ ok: true; cents: number } | { ok: false }> {
  const { data, error } = await admin
    .from("booking_transactions")
    .select("gross_amount_cents")
    .eq("order_id", orderId)
    .eq("status", "paid");
  if (error) return { ok: false };
  const cents = (data ?? []).reduce(
    (sum: number, r: { gross_amount_cents?: number | string }) =>
      sum + Number(r.gross_amount_cents ?? 0),
    0,
  );
  return { ok: true, cents };
}

/**
 * The order's lines, with the identity demand of the offering each one sells.
 *
 * Read here rather than derived from the draft in memory because the OFFERING
 * is the authority and it can have been edited since the line was added. The
 * decision itself is `lib/orders/identity-requirement`, which is pure and
 * shared with the public purchase pipeline so the counter and the web cannot
 * answer the same question two ways.
 */
async function identityLinesForOrder(
  admin: Admin,
  orderId: string,
): Promise<{ ok: true; lines: IdentityLine[] } | { ok: false }> {
  const { data: lineRows, error: lineErr } = await admin
    .from("order_lines")
    .select("offering_id, label, sort_order")
    .eq("order_id", orderId)
    .order("sort_order", { ascending: true });
  if (lineErr) {
    logServerError("pos.identityLinesForOrder.lines", lineErr);
    return { ok: false };
  }
  const rows = (lineRows ?? []) as Array<{
    offering_id: string | null;
    label: string | null;
    sort_order?: number | null;
  }>;
  const offeringIds = [...new Set(rows.map((r) => r.offering_id).filter((id): id is string => !!id))];
  if (offeringIds.length === 0) return { ok: true, lines: [] };

  const { data: offeringRows, error: offErr } = await admin
    .from("talent_offerings")
    .select("id, title, requires_identity, identity_reason")
    .in("id", offeringIds);
  if (offErr) {
    logServerError("pos.identityLinesForOrder.offerings", offErr);
    return { ok: false };
  }
  const byId = new Map(
    ((offeringRows ?? []) as Array<{
      id: string;
      title: string | null;
      requires_identity: boolean | null;
      identity_reason: string | null;
    }>).map((o) => [o.id, o]),
  );

  return {
    ok: true,
    lines: rows.map((r) => {
      const offering = r.offering_id ? byId.get(r.offering_id) : undefined;
      return {
        offeringId: r.offering_id ?? null,
        offeringTitle: offering?.title ?? r.label ?? null,
        requiresIdentity: offering?.requires_identity === true,
        identityReason: offering?.identity_reason ?? null,
      };
    }),
  };
}

/**
 * May this order take money without a customer row?
 *
 * `unavailable` means the READ failed. It is not a verdict about the buyer and
 * must never be reported as one, and it must never lead to a second attempt at
 * the same write.
 */
async function anonymousSaleVerdict(
  admin: Admin,
  orderId: string,
): Promise<{ ok: true } | { ok: false; reason: "no_contact" | "unavailable"; error: string }> {
  const read = await identityLinesForOrder(admin, orderId);
  if (!read.ok) {
    return { ok: false, reason: "unavailable", error: "Could not check what this sale needs." };
  }
  const verdict = identityVerdict({ hasCustomer: false, lines: read.lines });
  if (verdict.ok) return { ok: true };
  return { ok: false, reason: "no_contact", error: verdict.message };
}

async function openShiftId(admin: Admin, tenantId: string): Promise<string | null> {
  const found = await currentShift(admin, { tenantId });
  if (!found.ok) return null;
  return found.shift?.id ?? null;
}

export type SubmitToPreparationResult = SubmitPrepResult;

export async function submitToPreparation(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    destination?: PrepDestination;
    station?: string;
    promisedAt?: string | null;
  },
): Promise<SubmitToPreparationResult> {
  return submitOrderToPreparation(admin, input);
}

/**
 * The order's one booking shell now lives in `lib/orders/booking-shell.ts`,
 * next to nothing in particular and imported by both paths that record money.
 *
 * It was private to this file, and that is exactly how the cash path came to
 * be broken: the card path below called it, the cash branch returned before
 * reaching it, and `settleAtDoor` then inserted a `booking_transactions` row
 * with a null `booking_id` that the scope trigger refused. Sharing it means
 * `settleAtDoor` ensures its own shell and no caller has to remember.
 */

export type StartCollectionResult =
  | {
      ok: true;
      method: "cash";
      orderId: string;
      transactionId: string;
      alreadySettled: boolean;
      amountCents: number;
      tenderedCents: number;
      changeCents: number;
      outstandingAfterCents: number;
    }
  | { ok: true; method: "online_card"; orderId: string; transactionId: string; checkoutUrl: string; mock?: boolean }
  | {
      ok: false;
      reason:
        | "no_contact"
        | "not_found"
        | "wrong_tenant"
        | "not_draft"
        | "amount"
        | "tendered"
        | "empty"
        | "unavailable"
        | "sold_out"
        | "terminal_unavailable"
        | "engine_error"
        | "conflict";
      error: string;
    };

export type StartCollectionDeps = {
  ensureCustomer?: (input: {
    tenantId: string;
    email?: string | null;
    phone?: string | null;
    displayName?: string | null;
  }) => Promise<EnsureCustomerResult>;
  createPaymentRequest?: ReturnType<typeof stripeCollectionAdapter>["createPaymentRequest"];
  settle?: typeof settleAtDoor;
  holdCapacity?: typeof holdDraftOrderCapacity;
  onOrderPaid?: OnOrderPaid;
};

export async function startCollection(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    actorUserId: string;
    method: PosCollectionMethod;
    contact?: PosBuyerContact;
    successUrl: string;
    cancelUrl: string;
    locale?: string | null;
    /** This allocation. Defaults to remaining outstanding. */
    amountCents?: number;
    /** Cash counted from the customer. Defaults to amountCents. */
    tenderedCents?: number;
    /** Unique per allocation so equal splits do not collide. */
    idempotencyKey?: string;
  },
  deps: StartCollectionDeps = {},
): Promise<StartCollectionResult> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, customer_id, currency, total_cents, promo_code_id, discount_cents")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logServerError("pos.startCollection", error);
    return { ok: false, reason: "unavailable", error: "Could not load the sale." };
  }
  if (!order) return { ok: false, reason: "not_found", error: "That sale is gone." };
  const row = order as {
    id: string;
    tenant_id: string;
    status: string;
    customer_id: string | null;
    currency: string;
    total_cents: number;
    promo_code_id?: string | null;
    discount_cents?: number;
  };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That sale is not in this workspace." };
  }
  if (!COLLECTABLE.has(row.status)) {
    return { ok: false, reason: "not_draft", error: "This sale is no longer open." };
  }
  if (!Number.isInteger(row.total_cents) || row.total_cents < 0) {
    return { ok: false, reason: "unavailable", error: "The total is not collectable." };
  }

  const paid = await collectedPaidCents(admin, row.id);
  if (!paid.ok) {
    return { ok: false, reason: "unavailable", error: "Could not read what is already paid." };
  }
  const outstanding = Math.max(0, row.total_cents - paid.cents);
  if (row.total_cents > 0 && outstanding <= 0) {
    return { ok: false, reason: "not_draft", error: "This sale is already collected." };
  }

  let amountCents = 0;
  let tenderedCents = 0;
  let changeCents = 0;
  let outstandingAfterCents = 0;
  if (row.total_cents > 0) {
    amountCents = input.amountCents ?? outstanding;
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return { ok: false, reason: "amount", error: "This allocation must be more than zero." };
    }
    if (amountCents > outstanding) {
      return { ok: false, reason: "amount", error: "This allocation is more than what is outstanding." };
    }
    tenderedCents = input.tenderedCents ?? amountCents;
    if (!Number.isInteger(tenderedCents) || tenderedCents < amountCents) {
      return { ok: false, reason: "tendered", error: "Tendered cash is less than this allocation." };
    }
    changeCents = tenderedCents - amountCents;
    outstandingAfterCents = outstanding - amountCents;
  }

  let customerId = row.customer_id;
  // MONEY DOES NOT REQUIRE A NAME. A PRODUCT MAY.
  //
  // This used to refuse any paid sale without an email or a phone, which made
  // the commonest transaction on a counter impossible: an anonymous cash
  // walk-in. The retrieval anchor for that sale is `orders.receipt_code`,
  // printed on the slip and resolvable at `/r/<code>` by whoever holds it, and
  // `orders_identified_before_payment` now accepts exactly that shape (a guest
  // session plus a receipt code).
  //
  // What still refuses is a LINE whose offering says it needs a name: a ticket
  // the door checks, something to be delivered, credit spent later. That
  // decision is the offering's, not the till's.
  if (!customerId) {
    const email = input.contact?.email ?? null;
    const phone = input.contact?.phone ?? null;
    if (!email && !phone) {
      const allowed = await anonymousSaleVerdict(admin, row.id);
      if (!allowed.ok) return { ok: false, reason: allowed.reason, error: allowed.error };
    } else {
      if (!deps.ensureCustomer) {
        return { ok: false, reason: "unavailable", error: "Could not name the buyer." };
      }
      const named = await deps.ensureCustomer({
        tenantId: input.tenantId,
        email,
        phone,
        displayName: input.contact?.displayName,
      });
      if (!named.ok) {
        return { ok: false, reason: "no_contact", error: named.error };
      }
      customerId = named.customerId;
      const { error: attErr } = await admin
        .from("orders")
        .update({ customer_id: customerId })
        .eq("id", row.id)
        .in("status", ["draft", "pending_payment"]);
      if (attErr) {
        logServerError("pos.startCollection.attach", attErr);
        return { ok: false, reason: "unavailable", error: "Could not name the buyer." };
      }
    }
  }

  const hold = deps.holdCapacity ?? holdDraftOrderCapacity;
  const held = await hold(admin, {
    tenantId: input.tenantId,
    orderId: row.id,
    actorUserId: input.actorUserId,
  });
  if (!held.ok) {
    const reason =
      held.reason === "sold_out" ||
      held.reason === "wrong_tenant" ||
      held.reason === "not_found" ||
      held.reason === "not_draft"
        ? held.reason
        : "unavailable";
    return { ok: false, reason, error: held.error };
  }

  if (row.promo_code_id && customerId && typeof admin.rpc === "function") {
    const redeemed = await admin.rpc("redeem_tenant_promo", {
      p_code_id: row.promo_code_id,
      p_order_id: row.id,
      p_customer_id: customerId,
      p_amount_cents: Math.trunc(Number(row.discount_cents ?? 0)),
    });
    if (redeemed.error) {
      logServerError("pos.startCollection.redeem", redeemed.error);
      return { ok: false, reason: "unavailable", error: "Could not redeem that code." };
    }
    const verdict = (redeemed.data ?? {}) as { ok?: boolean; reason?: string };
    if (verdict.ok !== true && verdict.reason !== "already") {
      return { ok: false, reason: "unavailable", error: "That code cannot be used on this sale." };
    }
  }

  if (row.total_cents === 0) {
    const done = await completeZeroTotalOrder(
      admin as never,
      { tenantId: input.tenantId, orderId: row.id },
      { onOrderPaid: deps.onOrderPaid },
    );
    if (!done.ok) {
      return { ok: false, reason: "unavailable", error: done.error ?? "Could not close a free sale." };
    }
    return {
      ok: true,
      method: "cash",
      orderId: row.id,
      transactionId: row.id,
      alreadySettled: false,
      amountCents: 0,
      tenderedCents: 0,
      changeCents: 0,
      outstandingAfterCents: 0,
    };
  }

  if (input.method === "cash") {
    const settle = deps.settle ?? settleAtDoor;
    const shiftId = await openShiftId(admin, input.tenantId);
    const settled = await settle(admin as never, {
      tenantId: input.tenantId,
      orderId: row.id,
      actorUserId: input.actorUserId,
      paidVia: "cash",
      amountCents,
      currency: row.currency,
      idempotencyKey: input.idempotencyKey ?? `pos-cash:${row.id}:${crypto.randomUUID()}`,
      shiftId,
      tenderedCents,
      // So a cash sale that is the first collection on this order stamps the
      // buyer onto the shell, exactly as the card path does.
      contact: input.contact,
    }, { onOrderPaid: deps.onOrderPaid });
    if (!settled.ok) {
      return { ok: false, reason: "unavailable", error: "Could not record the cash." };
    }
    return {
      ok: true,
      method: "cash",
      orderId: settled.orderId,
      transactionId: settled.transactionId,
      alreadySettled: settled.alreadySettled,
      amountCents,
      tenderedCents,
      changeCents,
      outstandingAfterCents: settled.alreadySettled ? outstanding : outstandingAfterCents,
    };
  }

  const shell = await bookingShellForOrder(admin, {
    tenantId: input.tenantId,
    orderId: row.id,
    currency: row.currency,
    revenue: amountCents / 100,
    contact: input.contact,
  });
  if (!shell.ok) {
    return { ok: false, reason: "engine_error", error: "Could not open the payment." };
  }
  const bookingId = shell.bookingId;

  const { data: txnRow, error: txnErr } = await admin
    .from("booking_transactions")
    .insert({
      booking_id: bookingId,
      order_id: row.id,
      source_tenant_id: input.tenantId,
      payer_user_id: input.actorUserId,
      payer_email: input.contact?.email ?? null,
      gross_amount_cents: amountCents,
      platform_fee_basis_points: 0,
      platform_fee_cents: 0,
      net_amount_cents: amountCents,
      currency: row.currency,
      provider: "stripe",
      status: "draft",
      checkout_type: "full",
      requested_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (txnErr || !txnRow) {
    logServerError("pos.startCollection.txn", txnErr);
    return { ok: false, reason: "engine_error", error: "Could not open the payment." };
  }
  const transactionId = (txnRow as { id: string }).id;

  const create =
    deps.createPaymentRequest ?? stripeCollectionAdapter().createPaymentRequest;
  const request = await create({
    transactionId,
    amountCents,
    currency: row.currency,
    payerEmail: input.contact?.email ?? null,
    inquiryId: null,
    bookingId,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    description: "POS sale",
    locale: input.locale,
    method: "online_card",
  });
  if (!request.ok) {
    return { ok: false, reason: "engine_error", error: request.error };
  }

  await admin
    .from("booking_transactions")
    .update({ status: "payment_requested" })
    .eq("id", transactionId)
    .eq("status", "draft");

  const { error: statusErr } = await admin
    .from("orders")
    .update({ status: "pending_payment" })
    .eq("id", row.id)
    .in("status", ["draft", "pending_payment"]);
  if (statusErr) {
    logServerError("pos.startCollection.status", statusErr);
    return { ok: false, reason: "unavailable", error: "Could not hold the sale for payment." };
  }

  return {
    ok: true,
    method: "online_card",
    orderId: row.id,
    transactionId,
    checkoutUrl: request.checkoutUrl ?? input.successUrl,
    mock: request.mock,
  };
}

export type RecordVerifiedCollectionResult =
  | { ok: true; orderId: string; transactionId: string; alreadySettled: boolean }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "unavailable" | "no_contact"; error: string };

export async function recordVerifiedCollection(
  admin: Admin,
  input: {
    tenantId: string;
    orderId: string;
    actorUserId: string;
    paidVia: "cash" | "card";
    amountCents: number;
    currency: string;
  },
  deps: { settle?: typeof settleAtDoor } = {},
): Promise<RecordVerifiedCollectionResult> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, customer_id")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable", error: "Could not load the sale." };
  if (!order) return { ok: false, reason: "not_found", error: "That sale is gone." };
  const row = order as { id: string; tenant_id: string; status: string; customer_id: string | null };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That sale is not in this workspace." };
  }
  // Same rule as `startCollection`: the sale needs a name only when something
  // in it does. A verified cash collection on an anonymous walk-in is legal.
  if (!row.customer_id) {
    const allowed = await anonymousSaleVerdict(admin, row.id);
    if (!allowed.ok) return { ok: false, reason: allowed.reason, error: allowed.error };
  }
  const settle = deps.settle ?? settleAtDoor;
  const settled = await settle(admin as never, {
    tenantId: input.tenantId,
    orderId: row.id,
    actorUserId: input.actorUserId,
    paidVia: input.paidVia,
    amountCents: input.amountCents,
    currency: input.currency,
    idempotencyKey: `pos-verify:${row.id}:${input.paidVia}`,
  });
  if (!settled.ok) return { ok: false, reason: "unavailable", error: "Could not record the collection." };
  return {
    ok: true,
    orderId: settled.orderId,
    transactionId: settled.transactionId,
    alreadySettled: settled.alreadySettled,
  };
}

export type FinalizeResult =
  | { ok: true; orderId: string; status: "cancelled"; releasedAllocationIds: string[] }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "not_open" | "unavailable" | "conflict"; error: string };

export async function finalizeOrCancel(
  admin: Admin,
  input: { tenantId: string; orderId: string; expectedVersion?: number },
  deps: { release?: typeof releaseCapacity } = {},
): Promise<FinalizeResult> {
  if (typeof admin.rpc === "function") {
    const { data, error } = await admin.rpc("pos_cancel_draft", {
      p_tenant_id: input.tenantId,
      p_order_id: input.orderId,
      p_expected_version: input.expectedVersion ?? null,
    });
    if (error) {
      logServerError("pos.finalizeOrCancel.rpc", error);
      return { ok: false, reason: "unavailable", error: "Could not cancel the sale." };
    }
    const reply = (data ?? {}) as {
      ok?: boolean;
      reason?: string;
      order_id?: string;
      released_allocation_ids?: string[];
    };
    if (reply.ok !== true) {
      const reason =
        reply.reason === "not_found" ||
        reply.reason === "wrong_tenant" ||
        reply.reason === "not_open" ||
        reply.reason === "conflict"
          ? reply.reason
          : "unavailable";
      return { ok: false, reason, error: "Could not cancel the sale." };
    }
    return {
      ok: true,
      orderId: reply.order_id ?? input.orderId,
      status: "cancelled",
      releasedAllocationIds: reply.released_allocation_ids ?? [],
    };
  }

  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, version")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable", error: "Could not load the sale." };
  if (!order) return { ok: false, reason: "not_found", error: "That sale is gone." };
  const row = order as { id: string; tenant_id: string; status: string; version: number };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That sale is not in this workspace." };
  }
  if (row.status !== "draft" && row.status !== "pending_payment") {
    return { ok: false, reason: "not_open", error: "This sale cannot be cancelled." };
  }
  if (input.expectedVersion != null && Number(row.version) !== input.expectedVersion) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }
  const { data: cancelled, error: uErr } = await admin
    .from("orders")
    .update({ status: "cancelled", version: Number(row.version) + 1 })
    .eq("id", row.id)
    .eq("tenant_id", input.tenantId)
    .in("status", ["draft", "pending_payment"])
    .eq("version", row.version)
    .select("id")
    .maybeSingle();
  if (uErr) {
    logServerError("pos.finalizeOrCancel", uErr);
    return { ok: false, reason: "unavailable", error: "Could not cancel the sale." };
  }
  if (!cancelled) {
    return { ok: false, reason: "conflict", error: "This sale was just changed. Reload." };
  }

  const { data: lineRows, error: lineErr } = await admin
    .from("order_lines")
    .select("id")
    .eq("order_id", row.id)
    .eq("tenant_id", input.tenantId);
  if (lineErr) {
    logServerError("pos.finalizeOrCancel.lines", lineErr);
    return { ok: false, reason: "unavailable", error: "Could not release the held places." };
  }
  const lineIds = ((lineRows ?? []) as Array<{ id: string }>).map((l) => l.id);
  let releasedAllocationIds: string[] = [];
  if (lineIds.length > 0) {
    const { data: allocRows, error: allocErr } = await admin
      .from("capacity_allocations")
      .select("id, released_at")
      .eq("tenant_id", input.tenantId)
      .in("order_line_id", lineIds);
    if (allocErr) {
      logServerError("pos.finalizeOrCancel.allocations", allocErr);
      return { ok: false, reason: "unavailable", error: "Could not release the held places." };
    }
    const live = ((allocRows ?? []) as Array<{ id: string; released_at: string | null }>).filter(
      (a) => !a.released_at,
    );
    releasedAllocationIds = live.map((a) => a.id);
    if (releasedAllocationIds.length > 0) {
      const release = deps.release ?? releaseCapacity;
      const released = await release(releasedAllocationIds, admin as never);
      if (!released.ok) {
        return { ok: false, reason: "unavailable", error: "Could not release the held places." };
      }
    }
  }
  return { ok: true, orderId: row.id, status: "cancelled", releasedAllocationIds };
}

export { reportTerminalAvailability };
