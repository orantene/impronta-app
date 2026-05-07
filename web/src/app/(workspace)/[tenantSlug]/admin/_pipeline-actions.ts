"use server";

/**
 * Pipeline server actions called by the prototype admin shell.
 *
 * These wrap engine functions in `lib/inquiry/inquiry-engine*.ts` with a
 * plain-object client interface — drawer + button components in `_messages.tsx`
 * / `_drawers.tsx` call these via `startTransition` and toast on the
 * `{ ok: false, error }` shape rather than dealing with engine internals.
 *
 * Pattern (mirror of admin/messages/actions.ts):
 *   1. Resolve staff + tenant scope via requireStaffTenantAction
 *   2. Pre-flight any cross-tenant ownership checks
 *   3. Call engine function (truly atomic where the engine uses an RPC)
 *   4. Translate `EngineResult` to a flat `{ ok, ... }` for the client
 */

import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { convertToBooking } from "@/lib/inquiry/inquiry-engine-booking";
import {
  loadActiveBookingTransaction,
  markPaid,
  markPending,
  markDisputed,
  markFailed,
  cancelTransaction,
  type BookingTransaction,
} from "@/lib/bookings/transactions";
import { sendOffer, clientRejectOffer, createOffer } from "@/lib/inquiry/inquiry-engine-offers";
import { clientAcceptOffer } from "@/lib/inquiry/inquiry-engine-approvals";

export type PipelineActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ─── convertInquiryToBookingAction ────────────────────────────────────────────

/**
 * Atomic conversion of an approved inquiry to a booking via the
 * `engine_convert_to_booking` Postgres RPC. Used by the prototype shell's
 * StageTransitionMenu when the coordinator picks "Convert to booking".
 *
 * Preconditions enforced inside the engine + RPC:
 *   - inquiry.status = 'approved'
 *   - inquiry.current_offer_id IS NOT NULL
 *   - the active offer must be 'accepted'
 *   - per-group requirement fulfillment (or super_admin override)
 */
export async function convertInquiryToBookingAction(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult<{ bookingId: string }>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    // Pre-flight tenant ownership + load current version for optimistic lock.
    const { data: inq, error: inqErr } = await supabase
      .from("inquiries")
      .select("version, status")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (inqErr || !inq) {
      return { ok: false, error: "Inquiry not found in this workspace." };
    }

    const result = await convertToBooking(supabase, {
      inquiryId,
      tenantId,
      actorUserId: user.id,
      expectedVersion: (inq.version as number | null) ?? 1,
    });

    if (!result.success) {
      const reason = (result as { reason?: string; error?: string }).reason
        ?? (result as { error?: string }).error
        ?? "Could not convert inquiry to booking.";
      const friendly =
        reason === "approvals_incomplete" ? "Client hasn't approved the offer yet."
        : reason === "no_active_offer" ? "There's no active offer on this inquiry."
        : reason === "version_conflict" ? "This inquiry was updated elsewhere — refresh and retry."
        : reason === "requirement_groups_unfulfilled" ? "Some requirement groups are still unfulfilled."
        : reason === "inquiry_frozen" ? "This inquiry is frozen."
        : reason === "rate_limited" ? "Too many conversion attempts — try again shortly."
        : reason;
      return { ok: false, error: friendly };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { bookingId: result.data!.bookingId } };
  } catch (err) {
    logServerError("admin._pipeline-actions.convertInquiryToBooking", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── submitTalentRate ─────────────────────────────────────────────────────────

/**
 * Update a single talent's rate on an offer line item. Used by the OfferTab
 * "Submit rate" CTA in the talent pov. Writes to inquiry_offer_line_items.
 *
 * Note: the engine doesn't have a dedicated `talentSubmitRate` function yet,
 * so this writes directly via the supabase client. Tenant ownership is
 * enforced by joining through `inquiry_offers.inquiry_id` → `inquiries.tenant_id`.
 */
export async function submitTalentRate(
  _tenantSlug: string,
  lineItemId: string,
  talentCost: number,
): Promise<PipelineActionResult> {
  try {
    if (!Number.isFinite(talentCost) || talentCost < 0) {
      return { ok: false, error: "Rate must be a positive number." };
    }
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    // Verify the line item belongs to an inquiry in this tenant.
    const { data: li } = await supabase
      .from("inquiry_offer_line_items")
      .select("id, units, inquiry_offers(inquiry_id, inquiries(tenant_id))")
      .eq("id", lineItemId)
      .maybeSingle();

    type Joined = {
      units: number | null;
      inquiry_offers: { inquiry_id: string; inquiries: { tenant_id: string } | null } | null;
    };
    const joined = li as unknown as Joined | null;
    const liTenantId = joined?.inquiry_offers?.inquiries?.tenant_id ?? null;
    if (!liTenantId || liTenantId !== tenantId) {
      return { ok: false, error: "Line item not found in this workspace." };
    }

    const units = joined?.units ?? 1;
    const totalPrice = talentCost * units;

    const { error } = await supabase
      .from("inquiry_offer_line_items")
      .update({
        talent_cost: talentCost,
        unit_price: talentCost,
        total_price: totalPrice,
      })
      .eq("id", lineItemId);

    if (error) {
      logServerError("admin._pipeline-actions.submitTalentRate", error);
      return { ok: false, error: "Could not submit rate." };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.submitTalentRate", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Payment state ────────────────────────────────────────────────────────────

export type InquiryPaymentState = {
  bookingId: string | null;
  totalRevenueCents: number | null;
  currency: string | null;
  transaction: BookingTransaction | null;
};

/**
 * Load the booking + active transaction for an inquiry, in one round-trip.
 * Used by the prototype PaymentTab to render real payment state.
 */
export async function loadInquiryPaymentState(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult<InquiryPaymentState>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data: booking } = await supabase
      .from("agency_bookings")
      .select("id, total_client_revenue, currency_code")
      .eq("tenant_id", tenantId)
      .eq("source_inquiry_id", inquiryId)
      .maybeSingle();

    if (!booking) {
      return { ok: true, data: { bookingId: null, totalRevenueCents: null, currency: null, transaction: null } };
    }

    const txn = await loadActiveBookingTransaction(booking.id as string, supabase);
    const rawRevenue = booking.total_client_revenue as number | string | null;
    const totalRevenueCents = rawRevenue != null ? Math.round(Number(rawRevenue) * 100) : null;

    return {
      ok: true,
      data: {
        bookingId: booking.id as string,
        totalRevenueCents,
        currency: (booking.currency_code as string | null) ?? null,
        transaction: txn,
      },
    };
  } catch (err) {
    logServerError("admin._pipeline-actions.loadInquiryPaymentState", err);
    return { ok: false, error: "Unexpected error." };
  }
}

async function withInquiryBooking<T>(
  inquiryId: string,
  fn: (ctx: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string; tenantId: string; bookingId: string }) => Promise<T>,
): Promise<PipelineActionResult<T>> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, tenantId } = auth;

  const { data: booking } = await supabase
    .from("agency_bookings")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("source_inquiry_id", inquiryId)
    .maybeSingle();
  if (!booking) return { ok: false, error: "No booking found for this inquiry yet." };

  try {
    const data = await fn({ supabase, userId: user.id, tenantId, bookingId: booking.id as string });
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (err) {
    logServerError("admin._pipeline-actions.withInquiryBooking", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Mark the active booking transaction as paid (received).
 * Wraps `markPaid` from lib/bookings/transactions.
 */
export async function markInquiryPaymentReceived(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult> {
  const wrapped = await withInquiryBooking<void>(inquiryId, async ({ supabase, bookingId }) => {
    const txn = await loadActiveBookingTransaction(bookingId, supabase);
    if (!txn) throw new Error("No active transaction.");
    const result = await markPaid(txn.id);
    if (!result.ok) throw new Error(result.error);
  });
  return wrapped.ok ? { ok: true } : { ok: false, error: wrapped.error };
}

export async function markInquiryPaymentPending(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult> {
  const wrapped = await withInquiryBooking<void>(inquiryId, async ({ supabase, bookingId }) => {
    const txn = await loadActiveBookingTransaction(bookingId, supabase);
    if (!txn) throw new Error("No active transaction.");
    const result = await markPending(txn.id);
    if (!result.ok) throw new Error(result.error);
  });
  return wrapped.ok ? { ok: true } : { ok: false, error: wrapped.error };
}

export async function markInquiryPaymentDisputed(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult> {
  const wrapped = await withInquiryBooking<void>(inquiryId, async ({ supabase, bookingId }) => {
    const txn = await loadActiveBookingTransaction(bookingId, supabase);
    if (!txn) throw new Error("No active transaction.");
    const result = await markDisputed(txn.id);
    if (!result.ok) throw new Error(result.error);
  });
  return wrapped.ok ? { ok: true } : { ok: false, error: wrapped.error };
}

export async function markInquiryPaymentFailed(
  _tenantSlug: string,
  inquiryId: string,
  reason: string,
): Promise<PipelineActionResult> {
  const wrapped = await withInquiryBooking<void>(inquiryId, async ({ supabase, bookingId }) => {
    const txn = await loadActiveBookingTransaction(bookingId, supabase);
    if (!txn) throw new Error("No active transaction.");
    const result = await markFailed(txn.id, reason.trim() || "manual_marked_failed");
    if (!result.ok) throw new Error(result.error);
  });
  return wrapped.ok ? { ok: true } : { ok: false, error: wrapped.error };
}

export async function cancelInquiryTransaction(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult> {
  const wrapped = await withInquiryBooking<void>(inquiryId, async ({ supabase, bookingId }) => {
    const txn = await loadActiveBookingTransaction(bookingId, supabase);
    if (!txn) throw new Error("No active transaction.");
    const result = await cancelTransaction(txn.id);
    if (!result.ok) throw new Error(result.error);
  });
  return wrapped.ok ? { ok: true } : { ok: false, error: wrapped.error };
}

// ─── Offer engine wrappers ────────────────────────────────────────────────────

/**
 * Coordinator sends the current draft offer to the client for approval.
 */
export async function sendOfferAction(
  _tenantSlug: string,
  inquiryId: string,
  offerId: string,
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found in this workspace." };

    const { data: offerRow } = await supabase
      .from("inquiry_offers")
      .select("version")
      .eq("id", offerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!offerRow) return { ok: false, error: "Offer not found." };

    const result = await sendOffer(supabase, {
      inquiryId,
      tenantId,
      offerId,
      actorUserId: user.id,
      inquiryExpectedVersion: (inq.version as number | null) ?? 1,
      offerExpectedVersion: (offerRow.version as number | null) ?? 1,
    });
    if (!result.success) {
      return { ok: false, error: (result as { reason?: string; error?: string }).reason ?? (result as { error?: string }).error ?? "Could not send offer." };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.sendOfferAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Client (or admin acting on behalf) approves the active offer.
 */
export async function approveOfferAction(
  _tenantSlug: string,
  inquiryId: string,
  offerId: string,
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found in this workspace." };

    const result = await clientAcceptOffer(supabase, {
      inquiryId,
      tenantId,
      offerId,
      actorUserId: user.id,
      expectedVersion: (inq.version as number | null) ?? 1,
    });
    if (!result.success) {
      return { ok: false, error: (result as { reason?: string; error?: string }).reason ?? (result as { error?: string }).error ?? "Could not approve offer." };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.approveOfferAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Reject the active offer (sets it back to coordination).
 */
export async function rejectOfferAction(
  _tenantSlug: string,
  inquiryId: string,
  offerId: string,
  reasonText: string | null,
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found in this workspace." };

    const result = await clientRejectOffer(supabase, {
      inquiryId,
      tenantId,
      offerId,
      actorUserId: user.id,
      expectedVersion: (inq.version as number | null) ?? 1,
      rejectionReason: "other",
      rejectionReasonText: reasonText,
    });
    if (!result.success) {
      return { ok: false, error: (result as { reason?: string; error?: string }).reason ?? (result as { error?: string }).error ?? "Could not reject offer." };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.rejectOfferAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Files (inquiry_attachments) ──────────────────────────────────────────────

export type InquiryAttachment = {
  id: string;
  filename: string;
  mimeType: string | null;
  byteSize: number | null;
  description: string | null;
  visibility: "staff" | "shared";
  uploadedBy: string | null;
  createdAt: string;
};

/**
 * Load (non-deleted) attachments for an inquiry. Tenant scope is enforced
 * by RLS + the `tenant_id` filter so the read can never cross tenants.
 */
export async function loadInquiryAttachments(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult<InquiryAttachment[]>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data, error } = await supabase
      .from("inquiry_attachments")
      .select("id, filename, mime_type, byte_size, description, visibility, uploaded_by, created_at")
      .eq("tenant_id", tenantId)
      .eq("inquiry_id", inquiryId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      logServerError("admin._pipeline-actions.loadInquiryAttachments", error);
      return { ok: false, error: "Could not load files." };
    }

    type Row = {
      id: string; filename: string; mime_type: string | null;
      byte_size: number | null; description: string | null;
      visibility: "staff" | "shared"; uploaded_by: string | null; created_at: string;
    };
    const rows = (data ?? []) as Row[];
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        mimeType: r.mime_type,
        byteSize: r.byte_size,
        description: r.description,
        visibility: r.visibility,
        uploadedBy: r.uploaded_by,
        createdAt: r.created_at,
      })),
    };
  } catch (err) {
    logServerError("admin._pipeline-actions.loadInquiryAttachments", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Soft-delete an attachment (sets deleted_at). The storage object stays
 * in the bucket — purging is a separate batch job.
 */
export async function deleteInquiryAttachment(
  _tenantSlug: string,
  attachmentId: string,
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { error } = await supabase
      .from("inquiry_attachments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", attachmentId)
      .eq("tenant_id", tenantId);

    if (error) {
      logServerError("admin._pipeline-actions.deleteInquiryAttachment", error);
      return { ok: false, error: "Could not delete file." };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.deleteInquiryAttachment", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Coordinator creates a new draft offer for an inquiry. Returns the new
 * offer id so the caller can immediately switch to editing it.
 */
export async function createOfferAction(
  _tenantSlug: string,
  inquiryId: string,
  currencyCode: string = "EUR",
): Promise<PipelineActionResult<{ offerId: string }>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found in this workspace." };

    const result = await createOffer(supabase, {
      inquiryId,
      tenantId,
      actorUserId: user.id,
      expectedVersion: (inq.version as number | null) ?? 1,
      currencyCode,
    });
    if (!result.success) {
      return { ok: false, error: (result as { reason?: string; error?: string }).reason ?? (result as { error?: string }).error ?? "Could not create offer." };
    }
    revalidatePath("/", "layout");
    const offerId = (result as { data?: { offerId?: string } }).data?.offerId;
    if (!offerId) return { ok: false, error: "Offer created but no id returned." };
    return { ok: true, data: { offerId } };
  } catch (err) {
    logServerError("admin._pipeline-actions.createOfferAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}
