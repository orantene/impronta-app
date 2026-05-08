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
  createBookingTransaction,
  requestPayment,
  initiatePayout,
  markPayoutSent,
  type BookingTransaction,
} from "@/lib/bookings/transactions";
import {
  sendOffer,
  clientRejectOffer,
  createOffer,
  updateOfferDraft,
  submitTalentRate as submitTalentRateEngine,
  counterOffer,
  type OfferLineDraft,
} from "@/lib/inquiry/inquiry-engine-offers";
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
 * "Submit rate" CTA in the talent pov. Delegates to the engine
 * `submitTalentRate` which handles permissions, version checks, activity
 * log, and event emission.
 */
export async function submitTalentRate(
  _tenantSlug: string,
  inquiryId: string,
  offerId: string,
  lineItemId: string,
  talentCost: number,
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    const result = await submitTalentRateEngine(supabase, {
      inquiryId,
      tenantId,
      offerId,
      lineItemId,
      actorUserId: user.id,
      talentCost,
    });

    if (!result.success) {
      const reason = (result as { reason?: string; error?: string }).reason
        ?? (result as { error?: string }).error
        ?? "Could not submit rate.";
      const friendly =
        reason === "invalid_rate" ? "Rate must be a positive number."
        : reason === "rate_limited" ? "Too many attempts — try again shortly."
        : reason === "forbidden" ? "You can only submit a rate on your own line item."
        : reason === "offer_not_editable" ? "This offer is locked — counter the offer to revise rates."
        : reason === "line_item_not_found" ? "Line item not found."
        : reason === "offer_not_found" ? "Offer not found."
        : reason;
      return { ok: false, error: friendly };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.submitTalentRate", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Coordinator counter-offer — supersedes the previous offer with a new
 * draft. The previous offer must already be in `rejected` state (the
 * inquiry returns to `coordination` after `clientRejectOffer`). This
 * just opens v2 — caller still wires line items + send.
 */
export async function counterOfferAction(
  _tenantSlug: string,
  inquiryId: string,
  previousOfferId: string | null,
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

    const result = await counterOffer(supabase, {
      inquiryId,
      tenantId,
      actorUserId: user.id,
      expectedVersion: (inq.version as number | null) ?? 1,
      previousOfferId,
    });
    if (!result.success) {
      return { ok: false, error: (result as { reason?: string; error?: string }).reason ?? (result as { error?: string }).error ?? "Could not start counter offer." };
    }
    revalidatePath("/", "layout");
    const offerId = (result as { data?: { offerId?: string } }).data?.offerId;
    if (!offerId) return { ok: false, error: "Counter offer created but no id returned." };
    return { ok: true, data: { offerId } };
  } catch (err) {
    logServerError("admin._pipeline-actions.counterOfferAction", err);
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

/**
 * Create a draft booking transaction for an inquiry that's been booked.
 * Mirrors the canonical createTransactionDraftAction but returns a result
 * instead of redirecting. Fee basis points come from the workspace plan
 * tier (calculateTransactionAmounts).
 */
export async function createInquiryTransactionDraft(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data: booking } = await supabase
      .from("agency_bookings")
      .select("id, total_client_revenue, currency_code, client_user_id, contact_email")
      .eq("tenant_id", tenantId)
      .eq("source_inquiry_id", inquiryId)
      .maybeSingle();
    if (!booking) return { ok: false, error: "No booking found for this inquiry yet." };

    const existing = await loadActiveBookingTransaction(booking.id as string, supabase);
    if (existing) {
      return { ok: false, error: "An active transaction already exists for this booking." };
    }

    const grossAmountCents = booking.total_client_revenue != null
      ? Math.max(0, Math.round(Number(booking.total_client_revenue) * 100))
      : 0;
    if (grossAmountCents <= 0) {
      return { ok: false, error: "Set booking revenue before creating a transaction." };
    }

    const { data: agency } = await supabase
      .from("agencies")
      .select("plan_tier")
      .eq("id", tenantId)
      .maybeSingle();
    const planTier = (agency as { plan_tier?: string } | null)?.plan_tier ?? "free";

    const result = await createBookingTransaction({
      bookingId: booking.id as string,
      sourceTenantId: tenantId,
      sourceInquiryId: inquiryId,
      planTier,
      grossAmountCents,
      currency: (booking.currency_code as string | null) ?? "USD",
      payerUserId: (booking.client_user_id as string | null) ?? null,
      payerEmail: (booking.contact_email as string | null) ?? null,
      createdByProfileId: null,
    });
    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.createInquiryTransactionDraft", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Move a draft transaction → payment_requested. Surfaces the payment link
 * to the client (in production: triggers the payment provider checkout
 * URL or invoice email).
 */
export async function requestInquiryPayment(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult> {
  const wrapped = await withInquiryBooking<void>(inquiryId, async ({ supabase, bookingId }) => {
    const txn = await loadActiveBookingTransaction(bookingId, supabase);
    if (!txn) throw new Error("No active transaction.");
    const result = await requestPayment(txn.id);
    if (!result.ok) throw new Error(result.error);
  });
  return wrapped.ok ? { ok: true } : { ok: false, error: wrapped.error };
}

/**
 * Move a paid transaction → payout_pending. Triggers the payout to the
 * configured receiver (talent or agency payout account).
 */
export async function initiateInquiryPayout(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult> {
  const wrapped = await withInquiryBooking<void>(inquiryId, async ({ supabase, bookingId }) => {
    const txn = await loadActiveBookingTransaction(bookingId, supabase);
    if (!txn) throw new Error("No active transaction.");
    const result = await initiatePayout(txn.id);
    if (!result.ok) throw new Error(result.error);
  });
  return wrapped.ok ? { ok: true } : { ok: false, error: wrapped.error };
}

/**
 * Mark a payout_pending transaction as payout_sent (funds delivered).
 */
export async function markInquiryPayoutSent(
  _tenantSlug: string,
  inquiryId: string,
  providerReference?: string | null,
): Promise<PipelineActionResult> {
  const wrapped = await withInquiryBooking<void>(inquiryId, async ({ supabase, bookingId }) => {
    const txn = await loadActiveBookingTransaction(bookingId, supabase);
    if (!txn) throw new Error("No active transaction.");
    const result = await markPayoutSent(txn.id, { providerReference: providerReference ?? null });
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

// ─── Workspace settings (generic JSONB patch) ────────────────────────────────

/**
 * Patch a single namespace within `agencies.settings` JSONB. The
 * canonical workspace settings table is `agencies` (one row per tenant)
 * with a free-form `settings` jsonb that already holds timezone,
 * primary_locale etc.
 *
 * Used by the settings drawers (theme / SEO / navigation / languages /
 * visibility / filters) that don't have a dedicated typed action.
 *
 * The merge is shallow — `patch` replaces top-level keys under the
 * given namespace, but nested objects are not deep-merged. Callers
 * should pass the full namespace value they want to persist.
 */
export async function patchAgencySettingsNamespace(
  _tenantSlug: string,
  namespace: "theme" | "seo" | "navigation" | "languages" | "visibility" | "filters" | "domain",
  value: Record<string, unknown> | null,
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data: agency, error: readErr } = await supabase
      .from("agencies")
      .select("settings")
      .eq("id", tenantId)
      .single();
    if (readErr || !agency) {
      logServerError("admin._pipeline-actions.patchAgencySettings/read", readErr);
      return { ok: false, error: "Could not load workspace settings." };
    }

    const current: Record<string, unknown> =
      typeof agency.settings === "object" && agency.settings !== null
        ? { ...(agency.settings as Record<string, unknown>) }
        : {};

    if (value == null) {
      delete current[namespace];
    } else {
      current[namespace] = value;
    }

    const { error: writeErr } = await supabase
      .from("agencies")
      .update({ settings: current, updated_at: new Date().toISOString() })
      .eq("id", tenantId);

    if (writeErr) {
      logServerError("admin._pipeline-actions.patchAgencySettings/write", writeErr);
      return { ok: false, error: "Could not save workspace settings." };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.patchAgencySettings", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Read a namespace from `agencies.settings`. Returns the JSON value as
 * a plain record (or null when the namespace hasn't been written yet).
 */
export async function loadAgencySettingsNamespace(
  _tenantSlug: string,
  namespace: "theme" | "seo" | "navigation" | "languages" | "visibility" | "filters" | "domain",
): Promise<PipelineActionResult<Record<string, unknown> | null>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data: agency, error } = await supabase
      .from("agencies")
      .select("settings")
      .eq("id", tenantId)
      .single();
    if (error || !agency) return { ok: false, error: "Could not load settings." };

    const settings: Record<string, unknown> =
      typeof agency.settings === "object" && agency.settings !== null
        ? (agency.settings as Record<string, unknown>)
        : {};
    const value = settings[namespace];
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: true, data: null };
    }
    return { ok: true, data: value as Record<string, unknown> };
  } catch (err) {
    logServerError("admin._pipeline-actions.loadAgencySettings", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Reschedule inquiry event date ───────────────────────────────────────────

/**
 * Patch the event_date on an inquiry. Used by the calendar
 * drag-to-reschedule UX. Empty / null clears the date. Returns the
 * canonical YYYY-MM-DD string on success so the optimistic UI can
 * confirm the server agreed.
 */
export async function rescheduleInquiry(
  _tenantSlug: string,
  inquiryId: string,
  eventDateIso: string | null,
): Promise<PipelineActionResult<{ eventDate: string | null }>> {
  try {
    if (eventDateIso != null) {
      // Loose validation — must look like YYYY-MM-DD. Anything else
      // would round-trip to null at the DB level anyway.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDateIso)) {
        return { ok: false, error: "Date must be YYYY-MM-DD." };
      }
    }
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data, error } = await supabase
      .from("inquiries")
      .update({ event_date: eventDateIso, updated_at: new Date().toISOString() })
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .select("event_date")
      .maybeSingle();

    if (error) {
      logServerError("admin._pipeline-actions.rescheduleInquiry", error);
      return { ok: false, error: "Could not save new date." };
    }
    if (!data) return { ok: false, error: "Inquiry not found in this workspace." };

    revalidatePath("/", "layout");
    return { ok: true, data: { eventDate: (data.event_date as string | null) ?? null } };
  } catch (err) {
    logServerError("admin._pipeline-actions.rescheduleInquiry", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Inquiry user flags (pin / archive / manually_unread) ────────────────────

type FlagKind = "pinned" | "archived" | "manually_unread";

async function setInquiryUserFlag(
  inquiryId: string,
  flag: FlagKind,
  value: boolean,
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    // Pre-flight tenant ownership.
    const { data: inq } = await supabase
      .from("inquiries")
      .select("id")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found in this workspace." };

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      tenant_id: tenantId,
      inquiry_id: inquiryId,
      profile_id: user.id,
      [flag]: value,
    };
    if (flag === "pinned")          patch.pinned_at          = value ? now : null;
    if (flag === "archived")        patch.archived_at        = value ? now : null;
    if (flag === "manually_unread") patch.manually_unread_at = value ? now : null;

    const { error } = await supabase
      .from("inquiry_user_flags")
      .upsert(patch, { onConflict: "tenant_id,inquiry_id,profile_id" });

    if (error) {
      logServerError(`admin._pipeline-actions.setInquiryUserFlag/${flag}`, error);
      return { ok: false, error: "Could not save flag." };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.setInquiryUserFlag", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export const setInquiryPinned = (slug: string, inquiryId: string, value: boolean) =>
  setInquiryUserFlag(inquiryId, "pinned", value);
export const setInquiryArchived = (slug: string, inquiryId: string, value: boolean) =>
  setInquiryUserFlag(inquiryId, "archived", value);
export const setInquiryManuallyUnread = (slug: string, inquiryId: string, value: boolean) =>
  setInquiryUserFlag(inquiryId, "manually_unread", value);

// ─── Booking duplication ──────────────────────────────────────────────────────

/**
 * Duplicate a booking — wraps the canonical `duplicateBooking` action and
 * catches the redirect (the canonical action redirects to the new booking
 * detail; we want to stay in the prototype).
 */
export async function duplicateInquiryBooking(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data: booking } = await supabase
      .from("agency_bookings")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("source_inquiry_id", inquiryId)
      .maybeSingle();
    if (!booking) return { ok: false, error: "No booking found for this inquiry yet." };

    const { duplicateBooking } = await import("@/lib/server-actions/admin-bookings");
    const fd = new FormData();
    fd.set("booking_id", booking.id as string);
    try {
      await duplicateBooking(fd);
    } catch {
      // duplicateBooking calls redirect() — the throw is the success path.
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.duplicateInquiryBooking", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Lineup (inquiry_participants) ────────────────────────────────────────────

export type InquiryParticipant = {
  id: string;
  role: "client" | "coordinator" | "talent";
  status: "invited" | "active" | "declined" | "removed";
  talentProfileId: string | null;
  talentDisplayName: string | null;
  userId: string | null;
  invitedAt: string | null;
};

/**
 * Load the active lineup for an inquiry. Returns participants in the
 * "talent" role (the lineup proper) — coordinator + client rows are
 * filtered out at the DB layer to keep the response focused.
 */
export async function loadInquiryLineup(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult<InquiryParticipant[]>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data, error } = await supabase
      .from("inquiry_participants")
      .select(`
        id, role, status, talent_profile_id, user_id, invited_at,
        talent_profiles ( display_name )
      `)
      .eq("tenant_id", tenantId)
      .eq("inquiry_id", inquiryId)
      .eq("role", "talent")
      .neq("status", "removed")
      .order("invited_at", { ascending: true });

    if (error) {
      logServerError("admin._pipeline-actions.loadInquiryLineup", error);
      return { ok: false, error: "Could not load lineup." };
    }

    type Row = {
      id: string;
      role: "client" | "coordinator" | "talent";
      status: "invited" | "active" | "declined" | "removed";
      talent_profile_id: string | null;
      user_id: string | null;
      invited_at: string | null;
      talent_profiles: { display_name: string | null } | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        role: r.role,
        status: r.status,
        talentProfileId: r.talent_profile_id,
        talentDisplayName: r.talent_profiles?.display_name ?? null,
        userId: r.user_id,
        invitedAt: r.invited_at,
      })),
    };
  } catch (err) {
    logServerError("admin._pipeline-actions.loadInquiryLineup", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Remove a talent participant from an inquiry's lineup. Wraps
 * `rosterRemoveParticipant` from admin-inquiry-roster.ts using a built
 * FormData so the prototype can call this in startTransition.
 */
export async function removeInquiryLineupParticipant(
  _tenantSlug: string,
  inquiryId: string,
  participantId: string,
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found in this workspace." };

    const fd = new FormData();
    fd.set("inquiry_id", inquiryId);
    fd.set("participant_id", participantId);
    fd.set("expected_version", String((inq.version as number | null) ?? 1));

    const { rosterRemoveParticipant } = await import("@/lib/server-actions/admin-inquiry-roster");
    const result = await rosterRemoveParticipant(fd);
    if (!result.ok) return { ok: false, error: result.message ?? "Could not remove." };

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.removeInquiryLineupParticipant", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Add a roster talent to an inquiry by talent_profile_id. Wraps
 * `rosterAddTalent`.
 */
export async function addInquiryLineupTalent(
  _tenantSlug: string,
  inquiryId: string,
  talentProfileId: string,
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found in this workspace." };

    const fd = new FormData();
    fd.set("inquiry_id", inquiryId);
    fd.set("talent_profile_id", talentProfileId);
    fd.set("expected_version", String((inq.version as number | null) ?? 1));

    const { rosterAddTalent } = await import("@/lib/server-actions/admin-inquiry-roster");
    const result = await rosterAddTalent(fd);
    if (!result.ok) return { ok: false, error: result.message ?? "Could not add talent." };

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.addInquiryLineupTalent", err);
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
 * Upload a file to the inquiry-files bucket and create the matching
 * `inquiry_attachments` row. Path convention follows the storage RLS:
 *   {tenant_id}/{inquiry_id}/{uuid}-{filename}
 *
 * Accepts a FormData with `file` (File) + `inquiryId` (string) +
 * optional `description` (string). Tenant ownership of the inquiry is
 * verified before the upload to avoid orphan storage objects.
 *
 * Returns the new attachment id on success.
 */
export async function uploadInquiryAttachment(
  formData: FormData,
): Promise<PipelineActionResult<{ attachmentId: string }>> {
  try {
    const inquiryId = String(formData.get("inquiryId") ?? "");
    const description = String(formData.get("description") ?? "").trim() || null;
    const file = formData.get("file");
    if (!inquiryId) return { ok: false, error: "Missing inquiryId." };
    if (!(file instanceof File)) return { ok: false, error: "No file uploaded." };
    if (file.size === 0) return { ok: false, error: "File is empty." };
    if (file.size > 100 * 1024 * 1024) return { ok: false, error: "File exceeds 100 MB cap." };

    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    const { data: inq } = await supabase
      .from("inquiries")
      .select("id")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found in this workspace." };

    // Build storage path — matches the bucket RLS pattern.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const objectId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const storagePath = `${tenantId}/${inquiryId}/${objectId}-${safeName}`;

    const { error: uploadErr } = await supabase
      .storage
      .from("inquiry-files")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadErr) {
      logServerError("admin._pipeline-actions.uploadInquiryAttachment/storage", uploadErr);
      return { ok: false, error: `Upload failed: ${uploadErr.message}` };
    }

    const { data: row, error: insertErr } = await supabase
      .from("inquiry_attachments")
      .insert({
        tenant_id: tenantId,
        inquiry_id: inquiryId,
        uploaded_by: user.id,
        storage_path: storagePath,
        filename: file.name,
        mime_type: file.type || null,
        byte_size: file.size,
        description,
        visibility: "staff",
      })
      .select("id")
      .single();

    if (insertErr || !row) {
      // Compensating delete — pull the orphan storage object so the bucket
      // doesn't accumulate files with no metadata row.
      await supabase.storage.from("inquiry-files").remove([storagePath]);
      logServerError("admin._pipeline-actions.uploadInquiryAttachment/insert", insertErr);
      return { ok: false, error: "Could not save file metadata." };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { attachmentId: row.id as string } };
  } catch (err) {
    logServerError("admin._pipeline-actions.uploadInquiryAttachment", err);
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

// ─── Offer line-item editor ──────────────────────────────────────────────────

export type OfferDraftSnapshot = {
  offerId: string;
  offerVersion: number;
  inquiryVersion: number;
  totalClientPrice: number;
  coordinatorFee: number;
  currencyCode: string;
  notes: string | null;
  lineItems: Array<{
    id: string;
    talentProfileId: string | null;
    talentDisplayName: string | null;
    label: string | null;
    pricingUnit: "hour" | "day" | "week" | "event";
    units: number;
    unitPrice: number;
    totalPrice: number;
    talentCost: number;
    notes: string | null;
    sortOrder: number;
  }>;
};

/**
 * Load the current draft offer + its line items for editing. Used by the
 * coordinator's offer line-item editor in the OfferTab.
 */
export async function loadOfferDraft(
  _tenantSlug: string,
  offerId: string,
): Promise<PipelineActionResult<OfferDraftSnapshot>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data: offer, error: offerErr } = await supabase
      .from("inquiry_offers")
      .select("id, inquiry_id, version, total_client_price, coordinator_fee, currency_code, notes, status")
      .eq("id", offerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (offerErr || !offer) {
      return { ok: false, error: "Offer not found in this workspace." };
    }

    const { data: inq } = await supabase
      .from("inquiries")
      .select("version")
      .eq("id", offer.inquiry_id as string)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found." };

    const { data: lines } = await supabase
      .from("inquiry_offer_line_items")
      .select(`
        id, talent_profile_id, label, pricing_unit, units, unit_price,
        total_price, talent_cost, notes, sort_order,
        talent_profiles ( display_name )
      `)
      .eq("offer_id", offerId)
      .order("sort_order", { ascending: true });

    type LineRow = {
      id: string;
      talent_profile_id: string | null;
      label: string | null;
      pricing_unit: "hour" | "day" | "week" | "event";
      units: number;
      unit_price: number;
      total_price: number;
      talent_cost: number;
      notes: string | null;
      sort_order: number;
      talent_profiles: { display_name: string | null } | null;
    };
    const rows = (lines ?? []) as unknown as LineRow[];

    return {
      ok: true,
      data: {
        offerId: offer.id as string,
        offerVersion: (offer.version as number | null) ?? 1,
        inquiryVersion: (inq.version as number | null) ?? 1,
        totalClientPrice: Number(offer.total_client_price ?? 0),
        coordinatorFee: Number(offer.coordinator_fee ?? 0),
        currencyCode: (offer.currency_code as string | null) ?? "EUR",
        notes: (offer.notes as string | null) ?? null,
        lineItems: rows.map((r) => ({
          id: r.id,
          talentProfileId: r.talent_profile_id,
          talentDisplayName: r.talent_profiles?.display_name ?? null,
          label: r.label,
          pricingUnit: r.pricing_unit,
          units: Number(r.units),
          unitPrice: Number(r.unit_price),
          totalPrice: Number(r.total_price),
          talentCost: Number(r.talent_cost),
          notes: r.notes,
          sortOrder: r.sort_order,
        })),
      },
    };
  } catch (err) {
    logServerError("admin._pipeline-actions.loadOfferDraft", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Save the offer draft — replaces all line items with the supplied set
 * and updates the offer header (total/fee/currency/notes). Wraps engine
 * `updateOfferDraft` which handles permissions, version safety, and
 * the OFFER_DRAFT_UPDATED event.
 *
 * Caller passes the offer + inquiry expected versions so the engine can
 * reject conflicting writes.
 */
export async function saveOfferDraft(
  _tenantSlug: string,
  offerId: string,
  patch: {
    inquiryExpectedVersion: number;
    offerExpectedVersion: number;
    totalClientPrice: number;
    coordinatorFee: number;
    currencyCode: string;
    notes: string | null;
    lineItems: OfferLineDraft[];
  },
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    const { data: offer } = await supabase
      .from("inquiry_offers")
      .select("inquiry_id")
      .eq("id", offerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!offer) return { ok: false, error: "Offer not found in this workspace." };

    const result = await updateOfferDraft(supabase, {
      inquiryId: offer.inquiry_id as string,
      tenantId,
      offerId,
      actorUserId: user.id,
      inquiryExpectedVersion: patch.inquiryExpectedVersion,
      offerExpectedVersion: patch.offerExpectedVersion,
      total_client_price: patch.totalClientPrice,
      coordinator_fee: patch.coordinatorFee,
      currency_code: patch.currencyCode,
      notes: patch.notes,
      lineItems: patch.lineItems,
    });

    if (!result.success) {
      const reason = (result as { reason?: string; error?: string }).reason
        ?? (result as { error?: string }).error
        ?? "Could not save offer.";
      const friendly =
        reason === "version_conflict" ? "Offer was updated elsewhere — refresh and retry."
        : reason === "offer_not_editable" ? "This offer is locked (already sent / accepted)."
        : reason === "post_booking_immutable" ? "Inquiry is past its mutable phase."
        : reason === "inquiry_frozen" ? "Inquiry is frozen."
        : reason === "rate_limited" ? "Too many save attempts — try again shortly."
        : reason;
      return { ok: false, error: friendly };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.saveOfferDraft", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Payout receiver picker ─────────────────────────────────────────────────

export type PayoutReceiverOption = {
  payoutAccountId: string;
  ownerType: "agency" | "profile" | "talent";
  ownerId: string;
  displayName: string;
  receiverKind: string;
};

/**
 * Load the eligible payout receivers for an inquiry's booking. Used by
 * the per-transaction picker UI. Empty array if no booking exists yet
 * or no eligible receivers are configured.
 */
export async function loadInquiryPayoutReceiverCandidates(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult<PayoutReceiverOption[]>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data: booking } = await supabase
      .from("agency_bookings")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("source_inquiry_id", inquiryId)
      .maybeSingle();
    if (!booking) return { ok: true, data: [] };

    const { loadPayoutReceiverCandidatesForBooking } = await import("@/lib/bookings/transactions");
    const candidates = await loadPayoutReceiverCandidatesForBooking({
      tenantId,
      bookingId: booking.id as string,
      supabase,
    });

    return {
      ok: true,
      data: candidates.map((c) => ({
        payoutAccountId: c.payoutAccountId,
        ownerType: c.ownerType,
        ownerId: c.ownerId,
        displayName: c.displayName,
        receiverKind: c.receiverKind,
      })),
    };
  } catch (err) {
    logServerError("admin._pipeline-actions.loadInquiryPayoutReceiverCandidates", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Set the payout receiver on the active transaction for an inquiry.
 * Wraps `setTransactionPayoutReceiver` from lib/bookings/transactions.
 */
export async function setInquiryPayoutReceiver(
  _tenantSlug: string,
  inquiryId: string,
  payoutAccountId: string,
): Promise<PipelineActionResult> {
  try {
    if (!payoutAccountId.trim()) {
      return { ok: false, error: "Choose a payout receiver." };
    }
    const wrapped = await withInquiryBooking<void>(inquiryId, async ({ supabase, bookingId }) => {
      const txn = await loadActiveBookingTransaction(bookingId, supabase);
      if (!txn) throw new Error("No active transaction for this booking.");
      const { setTransactionPayoutReceiver } = await import("@/lib/bookings/transactions");
      const result = await setTransactionPayoutReceiver({
        transactionId: txn.id,
        payoutAccountId,
        sourceTenantId: txn.sourceTenantId,
      });
      if (!result.ok) throw new Error(result.error);
    });
    return wrapped.ok ? { ok: true } : { ok: false, error: wrapped.error };
  } catch (err) {
    logServerError("admin._pipeline-actions.setInquiryPayoutReceiver", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Lineup reorder ──────────────────────────────────────────────────────────

/**
 * Reorder the lineup. Accepts an array of participant ids in the new
 * order. Wraps `rosterMoveParticipant` (called once per moved participant
 * via the underlying engine helper).
 *
 * The engine's `reorderRoster` does the bulk update in one call.
 */
export async function reorderInquiryLineup(
  _tenantSlug: string,
  inquiryId: string,
  participantIdsInOrder: string[],
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
    if (!inq) return { ok: false, error: "Inquiry not found." };

    const { reorderRoster } = await import("@/lib/inquiry/inquiry-engine-roster");
    const result = await reorderRoster(supabase, {
      inquiryId,
      tenantId,
      actorUserId: user.id,
      expectedVersion: (inq.version as number | null) ?? 1,
      orderedParticipantIds: participantIdsInOrder,
    });
    if (!result.success) {
      const reason = (result as { reason?: string; error?: string }).reason
        ?? (result as { error?: string }).error
        ?? "Could not reorder.";
      return { ok: false, error: reason };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.reorderInquiryLineup", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Bulk inquiry archive ────────────────────────────────────────────────────

/**
 * Bulk-nudge — posts a coordinator-attributed system message into the
 * group thread on each selected inquiry. The talent participants see
 * the bump in their inbox via the standard unread-count plumbing, so
 * Nudge surfaces as "the coordinator is waiting on me" without needing
 * a separate notifications system.
 *
 * `body` defaults to a friendly bump if the caller doesn't provide one.
 */
export async function bulkNudgeInquiries(
  _tenantSlug: string,
  inquiryIds: string[],
  body?: string,
): Promise<PipelineActionResult<{ ok: number; failed: number }>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    const trimmed = (body ?? "✋ Bumping this — coordinator is waiting on the talent group's reply.")
      .trim()
      .slice(0, 10_000);
    if (!trimmed) return { ok: false, error: "Empty nudge body." };

    let okCount = 0;
    let failed = 0;
    for (const inquiryId of inquiryIds) {
      // Tenant + role gating is implicit — we only insert when the row
      // belongs to this tenant. Failure on one row doesn't abort the rest.
      const { data: inq } = await supabase
        .from("inquiries")
        .select("id")
        .eq("id", inquiryId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!inq) { failed++; continue; }

      const { error } = await supabase
        .from("inquiry_messages")
        .insert({
          inquiry_id: inquiryId,
          thread_type: "group",
          sender_user_id: user.id,
          body: trimmed,
          tenant_id: tenantId,
        });
      if (error) failed++;
      else okCount++;
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { ok: okCount, failed } };
  } catch (err) {
    logServerError("admin._pipeline-actions.bulkNudgeInquiries", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Bulk-reassign coordinator on the selected inquiries. Each row is
 * assigned to the current staff actor (the user driving the bulk bar).
 * Wraps `assignInquiryToCurrentStaff` per row.
 */
export async function bulkReassignInquiriesToMe(
  _tenantSlug: string,
  inquiryIds: string[],
): Promise<PipelineActionResult<{ ok: number; failed: number }>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };

    const { assignInquiryToCurrentStaff } = await import("@/lib/server-actions/admin-inquiries");

    let okCount = 0;
    let failed = 0;
    for (const id of inquiryIds) {
      const fd = new FormData();
      fd.set("inquiry_id", id);
      const r = await assignInquiryToCurrentStaff({}, fd);
      if (r && "error" in r && r.error) failed++;
      else okCount++;
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { ok: okCount, failed } };
  } catch (err) {
    logServerError("admin._pipeline-actions.bulkReassignInquiriesToMe", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Archive multiple inquiries in a single round-trip per inquiry. Skips
 * any that fail individually and returns a summary so the caller can
 * surface partial-success.
 */
export async function bulkSetInquiryArchived(
  _tenantSlug: string,
  inquiryIds: string[],
  archived: boolean,
): Promise<PipelineActionResult<{ ok: number; failed: number }>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    let okCount = 0;
    let failed = 0;
    const now = new Date().toISOString();
    for (const id of inquiryIds) {
      const { error } = await supabase
        .from("inquiry_user_flags")
        .upsert({
          tenant_id: tenantId,
          inquiry_id: id,
          profile_id: user.id,
          archived,
          archived_at: archived ? now : null,
        }, { onConflict: "tenant_id,inquiry_id,profile_id" });
      if (error) failed++;
      else okCount++;
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { ok: okCount, failed } };
  } catch (err) {
    logServerError("admin._pipeline-actions.bulkSetInquiryArchived", err);
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
