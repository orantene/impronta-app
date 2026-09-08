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
import { stripeCollectionAdapter } from "@/lib/payments/stripe-collection";
import { reportTerminalAvailability } from "@/lib/payments/terminal-availability";
import type { EnsureCustomerResult } from "@/lib/customers/ensure-customer";
import {
  submitOrderToPreparation,
  type PrepDestination,
  type SubmitPrepResult,
} from "@/lib/preparation/tickets";
import type { PosBuyerContact, PosCollectionMethod } from "./commands";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as expire-orders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

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

export type StartCollectionResult =
  | { ok: true; method: "cash"; orderId: string; transactionId: string; alreadySettled: boolean }
  | { ok: true; method: "online_card"; orderId: string; transactionId: string; checkoutUrl: string; mock?: boolean }
  | {
      ok: false;
      reason:
        | "no_contact"
        | "not_found"
        | "wrong_tenant"
        | "not_draft"
        | "empty"
        | "unavailable"
        | "terminal_unavailable"
        | "engine_error";
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
  },
  deps: StartCollectionDeps = {},
): Promise<StartCollectionResult> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status, customer_id, currency, total_cents")
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
  };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That sale is not in this workspace." };
  }
  if (row.status !== "draft") {
    return { ok: false, reason: "not_draft", error: "This sale is no longer open." };
  }
  if (!Number.isInteger(row.total_cents) || row.total_cents < 0) {
    return { ok: false, reason: "unavailable", error: "The total is not collectable." };
  }

  let customerId = row.customer_id;
  if (!customerId) {
    const email = input.contact?.email ?? null;
    const phone = input.contact?.phone ?? null;
    if (!email && !phone) {
      return {
        ok: false,
        reason: "no_contact",
        error: "Collecting money needs an email or a phone.",
      };
    }
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
      .eq("status", "draft");
    if (attErr) {
      logServerError("pos.startCollection.attach", attErr);
      return { ok: false, reason: "unavailable", error: "Could not name the buyer." };
    }
  }

  if (row.total_cents === 0) {
    const { error: paidErr } = await admin
      .from("orders")
      .update({ status: "paid" })
      .eq("id", row.id)
      .eq("status", "draft");
    if (paidErr) {
      logServerError("pos.startCollection.zero", paidErr);
      return { ok: false, reason: "unavailable", error: "Could not close a free sale." };
    }
    return {
      ok: true,
      method: "cash",
      orderId: row.id,
      transactionId: "zero-collect",
      alreadySettled: false,
    };
  }

  if (input.method === "cash") {
    const settle = deps.settle ?? settleAtDoor;
    const settled = await settle(admin as never, {
      tenantId: input.tenantId,
      orderId: row.id,
      actorUserId: input.actorUserId,
      paidVia: "cash",
      amountCents: row.total_cents,
      currency: row.currency,
      idempotencyKey: `pos-cash:${row.id}`,
    });
    if (!settled.ok) {
      return { ok: false, reason: "unavailable", error: "Could not record the cash." };
    }
    return {
      ok: true,
      method: "cash",
      orderId: settled.orderId,
      transactionId: settled.transactionId,
      alreadySettled: settled.alreadySettled,
    };
  }

  const { data: bookingRow, error: bookingErr } = await admin
    .from("agency_bookings")
    .insert({
      tenant_id: input.tenantId,
      tenant_id_snapshot: input.tenantId,
      order_id: row.id,
      source_inquiry_id: null,
      title: "POS sale",
      status: "confirmed",
      contact_email: input.contact?.email ?? null,
      contact_phone: input.contact?.phone ?? null,
      contact_name: input.contact?.displayName ?? null,
      total_client_revenue: row.total_cents / 100,
      currency_code: row.currency,
    })
    .select("id")
    .single();
  if (bookingErr || !bookingRow) {
    logServerError("pos.startCollection.booking", bookingErr);
    return { ok: false, reason: "engine_error", error: "Could not open the payment." };
  }
  const bookingId = (bookingRow as { id: string }).id;

  const { data: txnRow, error: txnErr } = await admin
    .from("booking_transactions")
    .insert({
      booking_id: bookingId,
      order_id: row.id,
      source_tenant_id: input.tenantId,
      payer_user_id: input.actorUserId,
      payer_email: input.contact?.email ?? null,
      gross_amount_cents: row.total_cents,
      platform_fee_basis_points: 0,
      platform_fee_cents: 0,
      net_amount_cents: row.total_cents,
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
    amountCents: row.total_cents,
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
    .eq("status", "draft");
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
  if (!row.customer_id) {
    return { ok: false, reason: "no_contact", error: "Collecting money needs an email or a phone." };
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
  | { ok: true; orderId: string; status: "cancelled" }
  | { ok: false; reason: "not_found" | "wrong_tenant" | "not_open" | "unavailable"; error: string };

export async function finalizeOrCancel(
  admin: Admin,
  input: { tenantId: string; orderId: string },
): Promise<FinalizeResult> {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, tenant_id, status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) return { ok: false, reason: "unavailable", error: "Could not load the sale." };
  if (!order) return { ok: false, reason: "not_found", error: "That sale is gone." };
  const row = order as { id: string; tenant_id: string; status: string };
  if (row.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That sale is not in this workspace." };
  }
  if (row.status !== "draft" && row.status !== "pending_payment") {
    return { ok: false, reason: "not_open", error: "This sale cannot be cancelled." };
  }
  const { error: uErr } = await admin
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", row.id);
  if (uErr) {
    logServerError("pos.finalizeOrCancel", uErr);
    return { ok: false, reason: "unavailable", error: "Could not cancel the sale." };
  }
  return { ok: true, orderId: row.id, status: "cancelled" };
}

export { reportTerminalAvailability };
