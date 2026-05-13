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
import {
  persistBookingCommissionSnapshot,
  loadBookingCommissionSnapshot,
} from "@/lib/billing/commission-engine";
import type { PaymentMethod, BookingCommissionSnapshot } from "@/lib/billing/commission";
import { formatRateLimitedCopy } from "@/lib/i18n/error-copy";
import { assignCoordinator } from "@/lib/inquiry/inquiry-engine-coordinator";
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
 * `engine_convert_to_booking` Postgres RPC. Used by the admin shell's
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
      const retryAfterMs = (result as { retryAfterMs?: number }).retryAfterMs;
      const friendly =
        reason === "approvals_incomplete" ? "Client hasn't approved the offer yet."
        : reason === "no_active_offer" ? "There's no active offer on this inquiry."
        : reason === "version_conflict" ? "This inquiry was updated elsewhere — refresh and retry."
        : reason === "requirement_groups_unfulfilled" ? "Some requirement groups are still unfulfilled."
        : reason === "inquiry_frozen" ? "This inquiry is frozen."
        // C5 — surface actual retry-after window so user isn't guessing.
        : reason === "rate_limited" ? formatRateLimitedCopy(retryAfterMs)
        : reason;
      return { ok: false, error: friendly };
    }

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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
      const retryAfterMs = (result as { retryAfterMs?: number }).retryAfterMs;
      const friendly =
        reason === "invalid_rate" ? "Rate must be a positive number."
        // C5 — surface actual retry-after window.
        : reason === "rate_limited" ? formatRateLimitedCopy(retryAfterMs)
        : reason === "forbidden" ? "You can only submit a rate on your own line item."
        : reason === "offer_not_editable" ? "This offer is locked — counter the offer to revise rates."
        : reason === "line_item_not_found" ? "Line item not found."
        : reason === "offer_not_found" ? "Offer not found."
        : reason;
      return { ok: false, error: friendly };
    }

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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
    revalidatePath(`/${auth.tenantSlug}`, "layout");
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
    revalidatePath(`/${auth.tenantSlug}`, "layout");
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

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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
    revalidatePath(`/${auth.tenantSlug}`, "layout");
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
    revalidatePath(`/${auth.tenantSlug}`, "layout");
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
    revalidatePath(`/${auth.tenantSlug}`, "layout");
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

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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

    revalidatePath(`/${auth.tenantSlug}`, "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.setInquiryUserFlag", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// "use server" files allow only `async function` exports — these wrappers
// must be functions, not const arrows, or Turbopack will refuse to bundle.
export async function setInquiryPinned(_slug: string, inquiryId: string, value: boolean) {
  return setInquiryUserFlag(inquiryId, "pinned", value);
}
export async function setInquiryArchived(_slug: string, inquiryId: string, value: boolean) {
  return setInquiryUserFlag(inquiryId, "archived", value);
}
export async function setInquiryManuallyUnread(_slug: string, inquiryId: string, value: boolean) {
  return setInquiryUserFlag(inquiryId, "manually_unread", value);
}

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
    revalidatePath(`/${auth.tenantSlug}`, "layout");
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

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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
      const retryAfterMs = (result as { retryAfterMs?: number }).retryAfterMs;
      const friendly =
        reason === "version_conflict" ? "Offer was updated elsewhere — refresh and retry."
        : reason === "offer_not_editable" ? "This offer is locked (already sent / accepted)."
        : reason === "post_booking_immutable" ? "Inquiry is past its mutable phase."
        : reason === "inquiry_frozen" ? "Inquiry is frozen."
        // C5 — surface actual retry-after window.
        : reason === "rate_limited" ? formatRateLimitedCopy(retryAfterMs)
        : reason;
      return { ok: false, error: friendly };
    }

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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
    revalidatePath(`/${auth.tenantSlug}`, "layout");
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

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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

    revalidatePath(`/${auth.tenantSlug}`, "layout");
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
  // Hard timeout — the 2026-05-12 audit reported the button hanging on
  // "Starting…" forever. Wrap the whole flow so any silent block surfaces
  // as a toast instead of locking the button.
  const ACTION_TIMEOUT_MS = 12_000;
  const timer = new Promise<PipelineActionResult<{ offerId: string }>>((resolve) =>
    setTimeout(
      () =>
        resolve({
          ok: false,
          error: "Timed out after 12s — check server logs for createOfferAction.",
        }),
      ACTION_TIMEOUT_MS,
    ),
  );
  const work = (async (): Promise<PipelineActionResult<{ offerId: string }>> => {
    try {
      const auth = await requireStaffTenantAction();
      if (!auth.ok) return { ok: false, error: auth.error };
      const { supabase, user, tenantId } = auth;

      const { data: inq, error: inqErr } = await supabase
        .from("inquiries")
        .select("version")
        .eq("id", inquiryId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (inqErr) {
        logServerError("createOfferAction/load_inquiry", inqErr);
        return { ok: false, error: `Inquiry lookup failed: ${inqErr.message}` };
      }
      if (!inq) return { ok: false, error: "Inquiry not found in this workspace." };

      const result = await createOffer(supabase, {
        inquiryId,
        tenantId,
        actorUserId: user.id,
        expectedVersion: (inq.version as number | null) ?? 1,
        currencyCode,
      });
      if (!result.success) {
        const reason = (result as { reason?: string }).reason;
        const errMsg = (result as { error?: string }).error;
        logServerError(
          "createOfferAction/engine_failed",
          new Error(`reason=${reason ?? ""} error=${errMsg ?? ""}`),
        );
        return { ok: false, error: reason ?? errMsg ?? "Could not create offer." };
      }
      revalidatePath(`/${auth.tenantSlug}`, "layout");
      const offerId = (result as { data?: { offerId?: string } }).data?.offerId;
      if (!offerId) return { ok: false, error: "Offer created but no id returned." };
      return { ok: true, data: { offerId } };
    } catch (err) {
      logServerError("admin._pipeline-actions.createOfferAction", err);
      return { ok: false, error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` };
    }
  })();
  return Promise.race([work, timer]);
}

// ─── Coordinator management ────────────────────────────────────────────

export type WorkspaceCoordinatorCandidate = {
  userId: string;
  displayName: string;
  role: string;
  activeInquiryCount: number;
  status: "active" | "pending_acceptance";
};

/**
 * Lists workspace members who can take ownership of an inquiry as
 * coordinator. Includes anyone with a coordinator-eligible role
 * (owner / admin / coordinator) and excludes the caller's currently-
 * assigned coordinator so the picker shows real handoff targets.
 *
 * 2026-05-12 fix A5: replaces the hardcoded mock list inside
 * ReassignCoordinatorSheet so admin reassignment is wired end-to-end.
 */
export async function loadWorkspaceCoordinatorCandidates(
  _tenantSlug: string,
  options: { excludeUserId?: string | null } = {},
): Promise<PipelineActionResult<WorkspaceCoordinatorCandidate[]>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    const { data: memberships, error } = await supabase
      .from("agency_memberships")
      .select(
        "profile_id, role, status, profiles:profile_id(display_name)",
      )
      .eq("tenant_id", tenantId)
      .in("status", ["active", "pending_acceptance"])
      .in("role", ["owner", "admin", "coordinator"]);
    if (error) {
      logServerError("loadWorkspaceCoordinatorCandidates/memberships", error);
      return { ok: false, error: error.message };
    }

    type Row = {
      profile_id: string;
      role: string;
      status: "active" | "pending_acceptance";
      profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    };
    const rows = (memberships ?? []) as Row[];
    const filtered = options.excludeUserId
      ? rows.filter((r) => r.profile_id !== options.excludeUserId)
      : rows;

    // Load active inquiry count per candidate so the picker can show
    // load alongside the name. One query for all candidates is cheaper
    // than per-row.
    const userIds = filtered.map((r) => r.profile_id);
    const loadCounts: Record<string, number> = {};
    if (userIds.length > 0) {
      const { data: loadRows } = await supabase
        .from("inquiries")
        .select("coordinator_id")
        .eq("tenant_id", tenantId)
        .in("coordinator_id", userIds)
        .in("status", ["submitted", "coordination", "offer_pending", "approved", "booked"]);
      for (const lr of (loadRows ?? []) as Array<{ coordinator_id: string | null }>) {
        if (!lr.coordinator_id) continue;
        loadCounts[lr.coordinator_id] = (loadCounts[lr.coordinator_id] ?? 0) + 1;
      }
    }

    const candidates: WorkspaceCoordinatorCandidate[] = filtered.map((r) => {
      const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      const name = prof?.display_name ?? "Workspace member";
      return {
        userId: r.profile_id,
        displayName: name,
        role: r.role,
        activeInquiryCount: loadCounts[r.profile_id] ?? 0,
        status: r.status,
      };
    });

    // Sort: active first, then by current load ascending (least busy
    // surfaces first — natural pick for handoffs).
    candidates.sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return a.activeInquiryCount - b.activeInquiryCount;
    });

    return { ok: true, data: candidates };
  } catch (err) {
    logServerError("admin._pipeline-actions.loadWorkspaceCoordinatorCandidates", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Reassign the primary coordinator on an inquiry to a new workspace
 * member. Wraps the `assignCoordinator` engine call, which atomically
 * updates `inquiries.coordinator_id` AND deletes the old coordinator
 * participant + inserts the new one as `status='invited'` (they accept
 * via their inbox).
 *
 * 2026-05-12 fix A5: wires the ReassignCoordinatorSheet — the modal
 * existed but had no live action behind it.
 */
export async function reassignCoordinatorAction(
  _tenantSlug: string,
  inquiryId: string,
  newCoordinatorUserId: string,
  _handoffNote: string,
): Promise<PipelineActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId } = auth;

    const { data: inq, error: inqErr } = await supabase
      .from("inquiries")
      .select("version")
      .eq("id", inquiryId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (inqErr) {
      logServerError("reassignCoordinatorAction/load_inquiry", inqErr);
      return { ok: false, error: `Inquiry lookup failed: ${inqErr.message}` };
    }
    if (!inq) return { ok: false, error: "Inquiry not found in this workspace." };

    const result = await assignCoordinator(supabase, {
      inquiryId,
      tenantId,
      coordinatorUserId: newCoordinatorUserId,
      actorUserId: user.id,
      expectedVersion: (inq.version as number | null) ?? 1,
    });

    if (!result.success) {
      const reason = (result as { reason?: string }).reason;
      const errMsg = (result as { error?: string }).error;
      const friendly =
        reason === "version_conflict" ? "Inquiry changed since you opened it — refresh and retry."
        : reason === "inquiry_frozen" ? "Inquiry is frozen — unfreeze first."
        : reason === "forbidden" ? "You don't have permission to reassign the coordinator."
        : (reason ?? errMsg ?? "Could not reassign coordinator.");
      return { ok: false, error: friendly };
    }

    // TODO(S0.8): persist the handoff note as a system message on the
    // talent group thread so the new + outgoing coordinator see context.
    // For now the engine event captures the assignment fact.

    revalidatePath(`/${auth.tenantSlug}`, "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.reassignCoordinatorAction", err);
    return { ok: false, error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── Commission / payment method actions (Phase B PR 2) ─────────────────────
// Spec: web/docs/commission-model-2026-05-13.md
// Imports hoisted to file top.

const VALID_PAYMENT_METHODS: PaymentMethod[] = [
  "card", "apple_pay", "google_pay", "bank_transfer",
  "cash", "wire", "venue_paid", "crypto", "other",
];

/**
 * Load the commission snapshot for a booking — for UI consumption
 * (admin Money settings, offer-drafter breakdown, talent earnings view).
 */
export async function loadBookingCommissionSnapshotAction(
  _tenantSlug: string,
  bookingId: string,
): Promise<PipelineActionResult<BookingCommissionSnapshot | null>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId } = auth;

    // Verify booking belongs to the calling tenant.
    const { data: booking, error: bookingErr } = await supabase
      .from("agency_bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (bookingErr) {
      logServerError("loadBookingCommissionSnapshotAction/lookup", bookingErr);
      return { ok: false, error: bookingErr.message };
    }
    if (!booking) return { ok: false, error: "Booking not found in this workspace." };

    const snap = await loadBookingCommissionSnapshot(supabase, bookingId);
    return { ok: true, data: snap };
  } catch (err) {
    logServerError("admin._pipeline-actions.loadBookingCommissionSnapshotAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Mark a booking as paid via an off-platform method (cash / wire / venue /
 * crypto / other) — OR back to an on-platform card path.
 *
 * v1: if no snapshot exists yet (rare race), creates one with the chosen
 * method. If snapshot exists with the same method → no-op. If snapshot
 * exists with a different method → blocks the change (the snapshot is
 * immutable in v1; payment-method reclassification lands in a follow-up
 * PR with proper reversal-movement logic). The workspace UI should
 * surface this as "Payment method already set — contact support to
 * reclassify."
 *
 * Spec §4.B + §11 decision #4: off-platform → accrual movement + balance
 * bump. Reversal of an existing accrual is the harder case, deferred.
 */
export async function markBookingPaymentMethodAction(
  _tenantSlug: string,
  bookingId: string,
  method: PaymentMethod,
  reason?: string | null,
): Promise<PipelineActionResult<{ snapshot: BookingCommissionSnapshot }>> {
  try {
    if (!VALID_PAYMENT_METHODS.includes(method)) {
      return { ok: false, error: "Invalid payment method." };
    }
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId, tenantSlug } = auth;

    // Verify booking belongs to the calling tenant.
    const { data: booking, error: bookingErr } = await supabase
      .from("agency_bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (bookingErr) {
      logServerError("markBookingPaymentMethodAction/lookup", bookingErr);
      return { ok: false, error: bookingErr.message };
    }
    if (!booking) return { ok: false, error: "Booking not found in this workspace." };

    // Check current snapshot state. If no snapshot exists, create one with
    // the chosen method (catches edge cases where the booking landed but
    // the post-commit commission step failed).
    const existing = await loadBookingCommissionSnapshot(supabase, bookingId);
    if (!existing) {
      const result = await persistBookingCommissionSnapshot(
        supabase, bookingId, method, reason ?? null,
      );
      if (!result.ok) {
        return { ok: false, error: `Could not record commission: ${result.detail ?? result.reason}` };
      }
      revalidatePath(`/${tenantSlug}`, "layout");
      return { ok: true, data: { snapshot: result.snapshot } };
    }
    if (existing.payment_method === method) {
      return { ok: true, data: { snapshot: existing } };
    }
    // Reclassification path — blocked in v1. Returns the immutability
    // message; UI surfaces support hand-off.
    return {
      ok: false,
      error: "Payment method already recorded for this booking. Reclassification needs a refund-style reversal which lands in a follow-up — contact platform support to change.",
    };
  } catch (err) {
    logServerError("admin._pipeline-actions.markBookingPaymentMethodAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Workspace submits a custom-rate request. Tulala platform admin reviews
 * and either approves (writes the actual rate) or denies. Spec §11 #5.
 *
 * Idempotent: if an open request already exists for this tenant, this
 * updates it. If a closed (approved/denied) request exists, this opens
 * a new one (workspace can revise their ask).
 */
export async function requestPlatformRateOverrideAction(
  _tenantSlug: string,
  requestedTakeBps: number,
  note: string,
): Promise<PipelineActionResult> {
  try {
    if (!Number.isInteger(requestedTakeBps) || requestedTakeBps < 0 || requestedTakeBps > 5000) {
      return { ok: false, error: "Requested rate must be between 0% and 50%." };
    }
    if (!note || note.trim().length < 10) {
      return { ok: false, error: "Please explain the rate request (at least 10 characters)." };
    }
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId, tenantSlug } = auth;

    // Upsert request fields on the workspace_commission_overrides row.
    // The RLS policy lets tenant staff INSERT/UPDATE the requested_* fields
    // only; rate fields are write-locked to platform admin.
    const { data: existing, error: existingErr } = await supabase
      .from("workspace_commission_overrides")
      .select("tenant_id, request_status")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (existingErr) {
      logServerError("requestPlatformRateOverrideAction/lookup", existingErr);
      return { ok: false, error: existingErr.message };
    }

    if (!existing) {
      const { error: insErr } = await supabase
        .from("workspace_commission_overrides")
        .insert({
          tenant_id: tenantId,
          requested_platform_take_bps: requestedTakeBps,
          requested_note: note.trim(),
          requested_at: new Date().toISOString(),
          requested_by_user_id: user.id,
          request_status: "open",
        });
      if (insErr) {
        logServerError("requestPlatformRateOverrideAction/insert", insErr);
        return { ok: false, error: insErr.message };
      }
    } else {
      const { error: updErr } = await supabase
        .from("workspace_commission_overrides")
        .update({
          requested_platform_take_bps: requestedTakeBps,
          requested_note: note.trim(),
          requested_at: new Date().toISOString(),
          requested_by_user_id: user.id,
          request_status: "open",
        })
        .eq("tenant_id", tenantId);
      if (updErr) {
        logServerError("requestPlatformRateOverrideAction/update", updErr);
        return { ok: false, error: updErr.message };
      }
    }

    revalidatePath(`/${tenantSlug}`, "layout");
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.requestPlatformRateOverrideAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── B1 — talent holds (workspace-staff calendar locks) ─────────────────────
// Thin wrappers around the engine layer in `lib/talent-calendar/hold-actions.ts`
// so the admin inquiry surface can place/release holds without importing
// from the lib directly. Each wrapper takes the standard tenantSlug
// signature the admin shell uses (curried at the page level).

export async function placeTalentHoldAction(
  tenantSlug: string,
  inquiryId: string,
  talentProfileId: string,
  input: {
    title: string;
    clientLabel?: string | null;
    startsAt: string;
    endsAt: string;
    allDay?: boolean;
    holdStrength?: "soft" | "firm";
    expiresAt?: string | null;
  },
): Promise<PipelineActionResult<{ holdId: string }>> {
  try {
    const { placeTalentHold } = await import("@/lib/talent-calendar/hold-actions");
    const r = await placeTalentHold({
      tenantSlug,
      talentProfileId,
      inquiryId,
      title: input.title,
      clientLabel: input.clientLabel ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay,
      holdStrength: input.holdStrength,
      expiresAt: input.expiresAt ?? undefined,
    });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, data: r.data };
  } catch (err) {
    logServerError("admin._pipeline-actions.placeTalentHoldAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export async function releaseTalentHoldAction(
  _tenantSlug: string,
  holdId: string,
): Promise<PipelineActionResult> {
  try {
    const { releaseTalentHold } = await import("@/lib/talent-calendar/hold-actions");
    const r = await releaseTalentHold(holdId);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true };
  } catch (err) {
    logServerError("admin._pipeline-actions.releaseTalentHoldAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export async function loadHoldsForInquiryAction(
  _tenantSlug: string,
  inquiryId: string,
): Promise<PipelineActionResult<Array<{
  id: string;
  talentProfileId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  holdStrength: "soft" | "firm";
  expiresAt: string | null;
}>>> {
  try {
    const { loadHoldsForInquiry } = await import("@/lib/talent-calendar/hold-actions");
    const r = await loadHoldsForInquiry(inquiryId);
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true,
      data: r.data.map((h) => ({
        id: h.id,
        talentProfileId: h.talentProfileId,
        title: h.title,
        startsAt: h.startsAt,
        endsAt: h.endsAt,
        holdStrength: h.holdStrength,
        expiresAt: h.expiresAt,
      })),
    };
  } catch (err) {
    logServerError("admin._pipeline-actions.loadHoldsForInquiryAction", err);
    return { ok: false, error: "Unexpected error." };
  }
}
