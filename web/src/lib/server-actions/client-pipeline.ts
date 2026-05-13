"use server";

/**
 * Client-side pipeline server actions for the prototype client shell.
 *
 * Mirrors `talent-pipeline.ts`: any authenticated user, with engine-level
 * permission validation per action. The client surface uses these to
 * Approve / Counter-reject the current offer, send messages on the
 * private (client) thread, and request payment-related actions.
 *
 * All wrappers translate `EngineResult` to a flat `{ ok, error }` shape.
 */

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { clientAcceptOffer } from "@/lib/inquiry/inquiry-engine-approvals";
import { clientRejectOffer } from "@/lib/inquiry/inquiry-engine-offers";
import { loadActiveBookingTransaction } from "@/lib/bookings/transactions";
import { createCheckoutSessionForTransaction } from "@/lib/payments/stripe-checkout";
import {
  getConnectedAccountSnapshotById,
  canRouteCheckoutsToAgency,
  getApplicationFeeForBooking,
} from "@/lib/payments/stripe-connect";
import { headers } from "next/headers";

// A.4 INTENTIONAL DIVERGENCE: align with canonical `ServerActionResult<T>` — currently
// preserved as a structurally compatible local type so `startInquiryCheckout`
// can attach `url`/`mock` on success without restructuring callers (Stripe
// redirect flow). Convert when checkout response is moved into a `data`
// payload across all callers.
export type ClientActionResult = { ok: true } | { ok: false; error: string };

async function loadClientInquiryContext(inquiryId: string): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
      tenantId: string;
      version: number;
      currentOfferId: string | null;
    }
> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: inq } = await supabase
    .from("inquiries")
    .select("tenant_id, version, current_offer_id, client_user_id")
    .eq("id", inquiryId)
    .maybeSingle();
  if (!inq) return { ok: false, error: "Inquiry not found." };
  // The client_user_id check below is a belt-and-suspenders gate — the
  // engine itself uses participant-role validation, so even if a user
  // with no client_user_id binding tried this they'd be rejected at
  // validateActorPermission. But fail fast here for cleaner error copy.
  if (inq.client_user_id && inq.client_user_id !== user.id) {
    return { ok: false, error: "Not your inquiry." };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    tenantId: inq.tenant_id as string,
    version: (inq.version as number | null) ?? 1,
    currentOfferId: (inq.current_offer_id as string | null) ?? null,
  };
}

/**
 * Client approves the current offer on an inquiry. Records the approval
 * via the engine's `clientAcceptOffer` (which resolves the client's
 * participant row and writes to `inquiry_approvals` + advances the
 * inquiry to `approved` once all approvals land).
 */
export async function clientApproveCurrentOffer(inquiryId: string): Promise<ClientActionResult> {
  try {
    const ctx = await loadClientInquiryContext(inquiryId);
    if (!ctx.ok) return ctx;
    if (!ctx.currentOfferId) return { ok: false, error: "No active offer to approve yet." };

    const result = await clientAcceptOffer(ctx.supabase, {
      inquiryId,
      tenantId: ctx.tenantId,
      offerId: ctx.currentOfferId,
      actorUserId: ctx.userId,
      expectedVersion: ctx.version,
    });
    if (!result.success) {
      const reason = (result as { reason?: string; error?: string }).reason
        ?? (result as { error?: string }).error
        ?? "Could not approve offer.";
      const friendly =
        reason === "no_client_participant" ? "We couldn't find your client record on this inquiry."
        : reason === "version_conflict" ? "This inquiry was updated — refresh and retry."
        : reason === "forbidden" ? "You don't have permission to approve this offer."
        : reason;
      return { ok: false, error: friendly };
    }
    // Slice AUDIT wiring: emit audit row on successful approval. Fire-
    // and-forget — if the audit emit fails (network/transient), the
    // approval still stands. The user-facing action result is unchanged.
    await ctx.supabase.rpc("inquiry_audit_emit", {
      p_inquiry_id: inquiryId,
      p_kind: "offer_accepted",
      p_payload: { offer_id: ctx.currentOfferId, accepted_by: ctx.userId },
    }).then((r) => {
      if (r.error) logServerError("client-pipeline.approve.audit", r.error);
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("client-pipeline.clientApproveCurrentOffer", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Client rejects the current offer. Optional `reason` + `reasonText`.
 * Sends the inquiry back to coordination so the agency can counter.
 */
export async function clientRejectCurrentOffer(
  inquiryId: string,
  reason: "too_expensive" | "wrong_talent" | "timing" | "changed_plans" | "other" = "other",
  reasonText?: string,
): Promise<ClientActionResult> {
  try {
    const ctx = await loadClientInquiryContext(inquiryId);
    if (!ctx.ok) return ctx;
    if (!ctx.currentOfferId) return { ok: false, error: "No active offer to reject." };

    const result = await clientRejectOffer(ctx.supabase, {
      inquiryId,
      tenantId: ctx.tenantId,
      offerId: ctx.currentOfferId,
      actorUserId: ctx.userId,
      expectedVersion: ctx.version,
      rejectionReason: reason,
      rejectionReasonText: reasonText ?? null,
    });
    if (!result.success) {
      const r = (result as { reason?: string; error?: string }).reason
        ?? (result as { error?: string }).error
        ?? "Could not reject offer.";
      return { ok: false, error: r };
    }
    // Slice AUDIT wiring: emit audit row on successful decline.
    await ctx.supabase.rpc("inquiry_audit_emit", {
      p_inquiry_id: inquiryId,
      p_kind: "offer_declined",
      p_payload: {
        offer_id: ctx.currentOfferId,
        declined_by: ctx.userId,
        reason,
        reason_text: reasonText ?? null,
      },
    }).then((r) => {
      if (r.error) logServerError("client-pipeline.reject.audit", r.error);
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("client-pipeline.clientRejectCurrentOffer", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Client requests a Stripe Checkout session to pay the inquiry's
 * outstanding invoice. Returns the hosted Stripe URL on success — the
 * client redirects the browser there. Webhook flips the transaction
 * to `paid` once Stripe confirms the charge.
 *
 * Mock mode (no STRIPE_SECRET_KEY): returns a synthetic URL so the
 * prototype demo still completes the redirect step without crashing.
 */
export async function startInquiryCheckout(
  inquiryId: string,
): Promise<ClientActionResult & { url?: string; mock?: boolean }> {
  try {
    const ctx = await loadClientInquiryContext(inquiryId);
    if (!ctx.ok) return ctx;

    const { data: booking } = await ctx.supabase
      .from("agency_bookings")
      .select("id, currency_code, contact_email")
      .eq("tenant_id", ctx.tenantId)
      .eq("source_inquiry_id", inquiryId)
      .maybeSingle();
    if (!booking) return { ok: false, error: "No booking yet for this inquiry." };

    const txn = await loadActiveBookingTransaction(booking.id as string, ctx.supabase);
    if (!txn) return { ok: false, error: "No active transaction — ask the agency to request payment first." };
    if (txn.status === "paid" || txn.status === "payout_pending" || txn.status === "payout_sent") {
      return { ok: false, error: "This invoice is already paid." };
    }

    // Build success/cancel URLs. Prefer NEXT_PUBLIC_BASE_URL but fall
    // back to the request's origin so local dev works without env vars.
    const hdrs = await headers();
    const host = hdrs.get("host") ?? "localhost";
    const proto = hdrs.get("x-forwarded-proto") ?? "https";
    const origin = process.env.NEXT_PUBLIC_BASE_URL ?? `${proto}://${host}`;
    const successUrl = `${origin}/checkout/success`;
    const cancelUrl = `${origin}/checkout/cancel`;

    // Connect routing: if the agency has connected Stripe and the account is
    // fully enabled, run a Direct Charge against their account. Otherwise
    // fall back to the platform's single-account flow (legacy / pre-launch).
    const connectSnap = await getConnectedAccountSnapshotById(ctx.tenantId);
    const useConnect = connectSnap.ok && canRouteCheckoutsToAgency(connectSnap.data);
    const connectedAccountId = useConnect ? connectSnap.data.stripeAccountId : null;
    // Phase B PR 3 — pull the actual platform fee from the persisted
    // commission snapshot, not the legacy flat-0 helper. When the booking
    // has no snapshot yet (rare), falls back to 0 so checkout still works.
    const applicationFeeCents = useConnect
      ? await getApplicationFeeForBooking(booking.id as string)
      : 0;

    const result = await createCheckoutSessionForTransaction({
      transactionId: txn.id,
      amountCents: txn.grossAmountCents,
      currency: txn.currency || (booking.currency_code as string | null) || "USD",
      payerEmail: txn.payerEmail ?? (booking.contact_email as string | null) ?? null,
      inquiryId,
      bookingId: booking.id as string,
      successUrl,
      cancelUrl,
      description: "Booking invoice",
      connectedAccountId,
      applicationFeeCents,
    });

    if (!result.ok) return { ok: false, error: result.error };

    return { ok: true, url: result.url, mock: result.mock };
  } catch (err) {
    logServerError("client-pipeline.startInquiryCheckout", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Client sends a message on the private (client) thread. Bypasses the
 * staff-capability gate by validating the actor is the inquiry's client.
 */
export async function sendInquiryMessageAsClient(
  inquiryId: string,
  body: string,
): Promise<ClientActionResult> {
  try {
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "Message body is empty." };
    if (trimmed.length > 10000) return { ok: false, error: "Message too long." };

    const ctx = await loadClientInquiryContext(inquiryId);
    if (!ctx.ok) return ctx;

    const { error } = await ctx.supabase
      .from("inquiry_messages")
      .insert({
        inquiry_id: inquiryId,
        thread_type: "private",
        sender_user_id: ctx.userId,
        body: trimmed,
        tenant_id: ctx.tenantId,
      });
    if (error) {
      logServerError("client-pipeline.sendInquiryMessageAsClient", error);
      return { ok: false, error: "Failed to send message." };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("client-pipeline.sendInquiryMessageAsClient", err);
    return { ok: false, error: "Unexpected error." };
  }
}
