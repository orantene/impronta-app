"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import {
  cancelTransaction,
  createBookingTransaction,
  initiatePayout,
  loadPayoutReceiverCandidatesForBooking,
  loadActiveBookingTransaction,
  markDisputed,
  markFailed,
  markPending,
  markPaid,
  markPayoutSent,
  markRefunded,
  requestPayment,
  setTransactionPayoutReceiver,
  type BookingTransaction,
  type TransactionResult,
} from "@/lib/bookings/transactions";
import { logServerError } from "@/lib/server/safe-error";

type Context = {
  tenantId: string;
  inquiryId: string;
  booking: {
    id: string;
    total_client_revenue: number | string | null;
    currency_code: string | null;
    client_user_id: string | null;
    contact_email: string | null;
  } | null;
};

type PaymentActionCapability =
  | "booking.payment.select_receiver"
  | "booking.payment.change_receiver"
  | "booking.payment.request"
  | "booking.payment.mark_received"
  | "booking.payment.refund"
  | "booking.payment.payout_mark_external"
  | "agency.payout_account.manage"
  | "manage_billing";

function returnToDetail(tenantSlug: string, inquiryId: string, params: URLSearchParams): never {
  redirect(`/${tenantSlug}/admin/work/${inquiryId}?${params.toString()}`);
}

function centsFromRevenue(raw: number | string | null): number {
  if (raw == null) return 0;
  return Math.max(0, Math.round(Number(raw) * 100));
}

async function resolveContext(tenantSlug: string, inquiryId: string): Promise<Context | null> {
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id")
    .eq("tenant_id", scope.tenantId)
    .eq("id", inquiryId)
    .maybeSingle();

  if (!inquiry) return null;

  const { data: booking } = await supabase
    .from("agency_bookings")
    .select("id, total_client_revenue, currency_code, client_user_id, contact_email")
    .eq("tenant_id", scope.tenantId)
    .eq("source_inquiry_id", inquiryId)
    .maybeSingle();

  return {
    tenantId: scope.tenantId,
    inquiryId,
    booking: (booking as Context["booking"]) ?? null,
  };
}

async function canUseBillingAction(
  tenantId: string,
  caps: readonly PaymentActionCapability[],
): Promise<boolean> {
  for (const cap of caps) {
    if (await userHasCapability(cap, tenantId)) {
      return true;
    }
  }
  return false;
}

async function mutateStatus(
  tenantSlug: string,
  inquiryId: string,
  transactionId: string,
  requiredCaps: readonly PaymentActionCapability[],
  fn: (transactionId: string) => Promise<TransactionResult<BookingTransaction>>,
  successMessage: string,
  requireReceiver: boolean = false,
): Promise<never> {
  const context = await resolveContext(tenantSlug, inquiryId);
  if (!context?.booking) {
    const p = new URLSearchParams({ txerr: "Booking not found or permission denied." });
    returnToDetail(tenantSlug, inquiryId, p);
  }
  if (!(await canUseBillingAction(context.tenantId, requiredCaps))) {
    const p = new URLSearchParams({ txerr: "You do not have permission for this billing action." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    const p = new URLSearchParams({ txerr: "Database unavailable." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const active = await loadActiveBookingTransaction(context.booking.id, supabase);
  if (!active || active.id !== transactionId) {
    const p = new URLSearchParams({ txerr: "Active transaction not found for this booking." });
    returnToDetail(tenantSlug, inquiryId, p);
  }
  if (requireReceiver && !active.payoutReceiverId) {
    const p = new URLSearchParams({ txerr: "Select a payout receiver before requesting payment." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const result = await fn(transactionId);
  if (!result.ok) {
    const p = new URLSearchParams({ txerr: result.error });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  revalidatePath(`/${tenantSlug}/admin/work/${inquiryId}`);
  revalidatePath(`/${tenantSlug}/admin/bookings`);
  const p = new URLSearchParams({ tx: successMessage });
  returnToDetail(tenantSlug, inquiryId, p);
}

export async function createTransactionDraftAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");

  const context = await resolveContext(tenantSlug, inquiryId);
  if (!context?.booking) {
    const p = new URLSearchParams({ txerr: "Booking not found or permission denied." });
    returnToDetail(tenantSlug, inquiryId, p);
  }
  if (!(await canUseBillingAction(context.tenantId, ["booking.payment.request", "manage_billing"]))) {
    const p = new URLSearchParams({ txerr: "You do not have permission for this billing action." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    const p = new URLSearchParams({ txerr: "Database unavailable." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const existing = await loadActiveBookingTransaction(context.booking.id, supabase);
  if (existing) {
    if (existing.status === "disputed") {
      // The DB trigger graph allows disputed → failed → cancelled, but we surface a clear
      // error rather than silently blocking. TODO: add dispute-resolution UI to unblock.
      const p = new URLSearchParams({
        txerr: "There's an active disputed transaction — resolve the dispute first before creating a new draft.",
      });
      returnToDetail(tenantSlug, inquiryId, p);
    }
    const p = new URLSearchParams({ txerr: "An active transaction already exists for this booking." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const grossAmountCents = centsFromRevenue(context.booking.total_client_revenue);
  if (grossAmountCents <= 0) {
    const p = new URLSearchParams({ txerr: "Set booking revenue before creating a transaction." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const { data: agency } = await supabase
    .from("agencies")
    .select("plan_tier")
    .eq("id", context.tenantId)
    .maybeSingle();
  const planTier = (agency as { plan_tier?: string } | null)?.plan_tier ?? "free";

  const result = await createBookingTransaction({
    bookingId: context.booking.id,
    sourceTenantId: context.tenantId,
    sourceInquiryId: context.inquiryId,
    planTier,
    grossAmountCents,
    currency: context.booking.currency_code ?? "USD",
    payerUserId: context.booking.client_user_id ?? null,
    payerEmail: context.booking.contact_email ?? null,
    createdByProfileId: null,
  });

  if (!result.ok) {
    logServerError("workspace.work.createTransactionDraft", result.error);
    const p = new URLSearchParams({ txerr: result.error });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  revalidatePath(`/${tenantSlug}/admin/work/${inquiryId}`);
  revalidatePath(`/${tenantSlug}/admin/bookings`);
  const p = new URLSearchParams({ tx: "Draft transaction created." });
  returnToDetail(tenantSlug, inquiryId, p);
}

export async function requestPaymentAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  return mutateStatus(
    tenantSlug,
    inquiryId,
    transactionId,
    ["booking.payment.request", "manage_billing"],
    requestPayment,
    "Payment requested.",
    true,
  );
}

export async function markPendingAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  return mutateStatus(
    tenantSlug,
    inquiryId,
    transactionId,
    ["booking.payment.mark_received", "manage_billing"],
    markPending,
    "Payment marked pending.",
  );
}

export async function selectPayoutReceiverAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  const payoutAccountId = String(formData.get("payoutAccountId") ?? "");

  if (!payoutAccountId) {
    const p = new URLSearchParams({ txerr: "Select a payout receiver account first." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const context = await resolveContext(tenantSlug, inquiryId);
  if (!context?.booking) {
    const p = new URLSearchParams({ txerr: "Booking not found or permission denied." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    const p = new URLSearchParams({ txerr: "Database unavailable." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const active = await loadActiveBookingTransaction(context.booking.id, supabase);
  if (!active || active.id !== transactionId) {
    const p = new URLSearchParams({ txerr: "Active transaction not found for this booking." });
    returnToDetail(tenantSlug, inquiryId, p);
  }
  const requiredCaps: readonly PaymentActionCapability[] = active.payoutReceiverId
    ? ["booking.payment.change_receiver", "manage_billing"]
    : ["booking.payment.select_receiver", "manage_billing"];
  if (!(await canUseBillingAction(context.tenantId, requiredCaps))) {
    const p = new URLSearchParams({ txerr: "You do not have permission for this billing action." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const candidates = await loadPayoutReceiverCandidatesForBooking({
    tenantId: context.tenantId,
    bookingId: context.booking.id,
    supabase,
  });
  if (!candidates.some((c) => c.payoutAccountId === payoutAccountId)) {
    const p = new URLSearchParams({ txerr: "That payout receiver is not eligible for this booking." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const result = await setTransactionPayoutReceiver({
    transactionId,
    payoutAccountId,
    sourceTenantId: context.tenantId,
  });
  if (!result.ok) {
    const p = new URLSearchParams({ txerr: result.error });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  revalidatePath(`/${tenantSlug}/admin/work/${inquiryId}`);
  revalidatePath(`/${tenantSlug}/admin/bookings`);
  const p = new URLSearchParams({ tx: "Payout receiver saved." });
  returnToDetail(tenantSlug, inquiryId, p);
}

export async function markPaidAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  return mutateStatus(
    tenantSlug,
    inquiryId,
    transactionId,
    ["booking.payment.mark_received", "manage_billing"],
    markPaid,
    "Transaction marked paid.",
  );
}

export async function initiatePayoutAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  return mutateStatus(
    tenantSlug,
    inquiryId,
    transactionId,
    ["booking.payment.payout_mark_external", "manage_billing"],
    initiatePayout,
    "Payout started.",
  );
}

export async function markPayoutSentAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  const providerReference = String(formData.get("payoutExternalReference") ?? "").trim() || null;
  const externalNote = String(formData.get("payoutExternalNote") ?? "").trim() || null;
  return mutateStatus(
    tenantSlug,
    inquiryId,
    transactionId,
    ["booking.payment.payout_mark_external", "manage_billing"],
    (id) =>
      markPayoutSent(id, {
        providerReference,
        externalNote,
      }),
    "Payout marked sent.",
  );
}

export async function cancelTransactionAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  return mutateStatus(
    tenantSlug,
    inquiryId,
    transactionId,
    ["booking.payment.request", "manage_billing"],
    cancelTransaction,
    "Transaction cancelled.",
  );
}

export async function markFailedAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  return mutateStatus(
    tenantSlug,
    inquiryId,
    transactionId,
    ["booking.payment.refund", "manage_billing"],
    markFailed,
    "Transaction marked failed.",
  );
}

export async function markDisputedAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  return mutateStatus(
    tenantSlug,
    inquiryId,
    transactionId,
    ["booking.payment.refund", "manage_billing"],
    markDisputed,
    "Transaction marked disputed.",
  );
}

export async function markRefundedAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "");
  const providerReference = String(formData.get("refundReference") ?? "").trim() || null;
  const refundNote = String(formData.get("refundNote") ?? "").trim() || null;
  return mutateStatus(
    tenantSlug,
    inquiryId,
    transactionId,
    ["booking.payment.refund", "manage_billing"],
    (id) =>
      markRefunded(id, {
        providerReference,
        refundNote,
      }),
    "Transaction marked refunded.",
  );
}

export async function createAgencyPayoutAccountAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const inquiryId = String(formData.get("inquiryId") ?? "");

  const context = await resolveContext(tenantSlug, inquiryId);
  if (!context) {
    const p = new URLSearchParams({ txerr: "Permission denied." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  if (!(await canUseBillingAction(context.tenantId, ["agency.payout_account.manage", "manage_billing"]))) {
    const p = new URLSearchParams({ txerr: "You do not have permission to manage payout accounts." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    const p = new URLSearchParams({ txerr: "Database unavailable." });
    returnToDetail(tenantSlug, inquiryId, p);
  }

  const { data: existing, error: existingError } = await supabase
    .from("payout_accounts")
    .select("id")
    .eq("tenant_id", context.tenantId)
    .eq("owner_type", "agency")
    .eq("owner_id", context.tenantId)
    .in("status", ["pending_verification", "connected"])
    .maybeSingle();

  if (existingError) {
    logServerError("workspace.work.createAgencyPayoutAccount.lookup", existingError);
  }

  if (!existing) {
    const { data: agency } = await supabase
      .from("agencies")
      .select("display_name")
      .eq("id", context.tenantId)
      .maybeSingle();
    const displayName = `${(agency as { display_name?: string } | null)?.display_name ?? "Workspace"} payouts`;

    const { error } = await supabase.from("payout_accounts").insert({
      tenant_id: context.tenantId,
      owner_type: "agency",
      owner_id: context.tenantId,
      display_name: displayName,
      provider: "manual_bank",
      status: "connected",
      connected_at: new Date().toISOString(),
    });

    if (error) {
      logServerError("workspace.work.createAgencyPayoutAccount.insert", error);
      const p = new URLSearchParams({ txerr: "Failed to create payout account." });
      returnToDetail(tenantSlug, inquiryId, p);
    }
  }

  revalidatePath(`/${tenantSlug}/admin/work/${inquiryId}`);
  const p = new URLSearchParams({
    tx: existing ? "Workspace payout account already exists." : "Workspace payout account created.",
  });
  returnToDetail(tenantSlug, inquiryId, p);
}
